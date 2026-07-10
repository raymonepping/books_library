import couchbase from 'couchbase'
import { getCluster, getScope } from '../config/couchbase.js'
import { logger } from '../config/logger.js'
import { config } from '../config/env.js'
import { cosineSim } from './embeddingService.js'
import { embed } from '../embedding/embed.js'
import axios from 'axios'

const PROFILE_ID = 'reader_profile::default'
const OLLAMA_BASE_URL = config.OLLAMA_BASE_URL
const OLLAMA_PROFILE_MODEL = config.OLLAMA_PROFILE_MODEL

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Compute weight for a single book based on rating and read status
 */
function bookWeight(book) {
  const ratingMult = { 5: 2.0, 4: 1.5, 3: 1.0, 2: 0.6, 1: 0.3 }
  const readMult = book.readStatus === 'read' ? 1.5 : 1.0
  const rating = book.rating ?? null
  const rMult = rating ? (ratingMult[rating] ?? 1.0) : 0.8
  return rMult * readMult
}

/**
 * Compute series completion multiplier
 */
function seriesCompletionMult(ownedCount, totalCount) {
  const pct = ownedCount / totalCount
  if (pct >= 1.0) return 1.3 // complete — strong signal
  if (pct >= 0.5) return 1.1 // majority owned
  return 1.0 // started
}

/**
 * L2-normalize a vector to unit length
 */
function normalizeVector(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
  return norm > 0 ? vec.map(v => v / norm) : vec
}

/**
 * Call Ollama with streaming. Collects tokens as they arrive and returns
 * when the model signals done or when no new token arrives for 15s.
 * This avoids a single long blocking timeout for the whole response.
 */
async function generateText(prompt, numPredict = 120) {
  return new Promise((resolve) => {
    const tokens = []
    let settled = false
    let idleTimer = null

    const settle = (text) => {
      if (settled) return
      settled = true
      clearTimeout(idleTimer)
      resolve(text?.trim() || null)
    }

    const resetIdle = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        logger.warn('[profile] Ollama idle — accepting partial response', { tokens: tokens.length })
        settle(tokens.join(''))
      }, 15_000)
    }

    axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model: OLLAMA_PROFILE_MODEL,
        prompt,
        stream: true,
        options: { num_predict: numPredict },
      },
      { responseType: 'stream', timeout: 60_000 }
    ).then(res => {
      resetIdle()
      let buf = ''
      res.data.on('data', chunk => {
        resetIdle()
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            if (data.response) tokens.push(data.response)
            if (data.done) settle(tokens.join(''))
          } catch {}
        }
      })
      res.data.on('end', () => settle(tokens.join('')))
      res.data.on('error', err => {
        logger.warn('[profile] stream error', { err: err.message })
        settle(tokens.join(''))
      })
    }).catch(err => {
      logger.warn('[profile] Ollama generate failed', { err: err.message })
      resolve(null)
    })
  })
}

// ── Data collection ───────────────────────────────────────────────────────────

/**
 * Load all series and their books, compute weights
 */
async function collectSeriesData() {
  logger.info('[profile] collecting series data...')
  const scope = getScope()
  
  // Load all series
  const seriesScan = await scope.collection('series').scan(new couchbase.RangeScan())
  const allSeries = seriesScan.map(r => ({ id: r.id, ...r.content }))
  
  // Load all books
  const booksScan = await scope.collection('books').scan(new couchbase.RangeScan())
  const allBooks = booksScan.map(r => ({ id: r.id, ...r.content }))
  
  // Group books by seriesId
  const booksBySeries = {}
  for (const book of allBooks) {
    if (book.seriesId) {
      if (!booksBySeries[book.seriesId]) booksBySeries[book.seriesId] = []
      booksBySeries[book.seriesId].push(book)
    }
  }
  
  // Compute weights for each book
  const weightedBooks = []
  let totalBooksWeighted = 0
  let booksWithRating = 0
  let totalRating = 0
  
  for (const series of allSeries) {
    const seriesBooks = booksBySeries[series.id] ?? []
    if (seriesBooks.length === 0) continue
    
    const ownedCount = seriesBooks.filter(b => b.owned).length
    const seriesMult = seriesCompletionMult(ownedCount, series.totalBooks ?? seriesBooks.length)
    
    for (const book of seriesBooks) {
      const weight = bookWeight(book) * seriesMult
      weightedBooks.push({ book, weight, seriesId: series.id })
      totalBooksWeighted += weight
      
      if (book.rating) {
        booksWithRating++
        totalRating += book.rating
      }
    }
  }
  
  const avgRating = booksWithRating > 0 ? Math.round((totalRating / booksWithRating) * 10) / 10 : null
  
  return {
    weightedBooks,
    totalBooksWeighted,
    booksWithRating,
    avgRating,
    seriesContributing: allSeries.filter(s => (booksBySeries[s.id] ?? []).length > 0).length,
    allSeries,
  }
}

// ── Vector computation ────────────────────────────────────────────────────────

/**
 * Compute the reader's taste vector from weighted book embeddings
 */
async function computeProfileVector(weightedBooks) {
  logger.info('[profile] computing vector...')
  
  const dims = config.OLLAMA_EMBED_DIMS
  const sumVector = new Array(dims).fill(0)
  let totalWeight = 0
  let booksWithEmbedding = 0
  
  for (const { book, weight } of weightedBooks) {
    if (book.embeddingSource !== 'enriched' || !book.embedding?.length) continue
    if (book.embedding.length !== dims) {
      logger.warn('[profile] book has wrong embedding dims', { bookId: book.id, dims: book.embedding.length })
      continue
    }
    
    booksWithEmbedding++
    for (let i = 0; i < dims; i++) {
      sumVector[i] += book.embedding[i] * weight
    }
    totalWeight += weight
  }
  
  if (totalWeight === 0 || booksWithEmbedding === 0) {
    logger.warn('[profile] no books with enriched embeddings found')
    return { vector: null, booksWithEmbedding: 0 }
  }
  
  // Step 1: weighted average
  const avgVector = sumVector.map(v => v / totalWeight)
  
  // Step 2: L2-normalize to unit length
  const profileVector = normalizeVector(avgVector)
  
  // Verify normalization
  const norm = Math.sqrt(profileVector.reduce((s, v) => s + v * v, 0))
  logger.info('[profile] vector computed', { booksWithEmbedding, norm: Math.round(norm * 10000) / 10000 })
  
  return { vector: profileVector, booksWithEmbedding }
}

// ── Structured profile aggregation ────────────────────────────────────────────

/**
 * Load author profiles for all contributing books
 */
async function loadAuthorProfiles(weightedBooks) {
  const scope = getScope()
  const authorIds = [...new Set(
    weightedBooks
      .map(wb => wb.book.authors?.[0]?.id)
      .filter(Boolean)
  )]
  
  const profiles = []
  for (const authorId of authorIds) {
    try {
      const doc = await scope.collection('authors').get(authorId)
      if (doc.content.profile) {
        profiles.push({ authorId, profile: doc.content.profile, name: doc.content.name })
      }
    } catch (err) {
      // Author not found or no profile - skip
    }
  }
  
  return profiles
}

/**
 * Aggregate structured profile fields from author profiles
 */
async function aggregateStructuredProfile(weightedBooks, authorProfiles, stats) {
  logger.info('[profile] aggregating structured profile...')
  
  // Map author IDs to profiles
  const profileMap = Object.fromEntries(
    authorProfiles.map(ap => [ap.authorId, ap.profile])
  )
  
  // Case-insensitive key — accumulate under lowercase, display as Title Case
  const titleCase = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  const ciKey     = s => s.toLowerCase().trim()

  // Dominant subgenres (case-insensitive dedup)
  const subgenreCounts = {}
  const subgenreCanon  = {}  // lowercase → display form (first seen wins)
  for (const { book, weight } of weightedBooks) {
    const authorId = book.authors?.[0]?.id
    const profile = profileMap[authorId]
    if (profile?.subgenre) {
      const key = ciKey(profile.subgenre)
      subgenreCounts[key] = (subgenreCounts[key] || 0) + weight
      if (!subgenreCanon[key]) subgenreCanon[key] = profile.subgenre
    }
  }
  const totalSubgenreWeight = Object.values(subgenreCounts).reduce((s, w) => s + w, 0)
  const dominantSubgenres = Object.entries(subgenreCounts)
    .map(([key, weight]) => ({ name: subgenreCanon[key], weight: weight / totalSubgenreWeight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)

  // Dominant tone (case-insensitive dedup, title-cased output)
  const toneCounts = {}
  for (const { book, weight } of weightedBooks) {
    const authorId = book.authors?.[0]?.id
    const profile = profileMap[authorId]
    if (profile?.tone) {
      for (const tone of profile.tone) {
        const key = ciKey(tone)
        toneCounts[key] = (toneCounts[key] || 0) + weight
      }
    }
  }
  const dominantTone = Object.entries(toneCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => titleCase(key))

  // Recurring themes (case-insensitive dedup, title-cased output)
  const themeCounts = {}
  for (const { book, weight } of weightedBooks) {
    const authorId = book.authors?.[0]?.id
    const profile = profileMap[authorId]
    if (profile?.themes) {
      for (const theme of profile.themes) {
        const key = ciKey(theme)
        themeCounts[key] = (themeCounts[key] || 0) + weight
      }
    }
  }
  const recurringThemes = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key]) => titleCase(key))
  
  // Pacing preference
  const pacingCounts = { 'slow-burn': 0, 'moderate': 0, 'fast-paced': 0 }
  for (const { book, weight } of weightedBooks) {
    const authorId = book.authors?.[0]?.id
    const profile = profileMap[authorId]
    if (profile?.pacing) {
      const key = profile.pacing.toLowerCase().replace(/[^a-z-]/g, '')
      if (pacingCounts[key] !== undefined) {
        pacingCounts[key] += weight
      }
    }
  }
  const totalPacing = Object.values(pacingCounts).reduce((s, w) => s + w, 0)
  const pacingPreference = totalPacing > 0
    ? Object.fromEntries(Object.entries(pacingCounts).map(([k, v]) => [k, Math.round((v / totalPacing) * 100) / 100]))
    : { 'slow-burn': 0, 'moderate': 0, 'fast-paced': 0 }
  
  // Violence comfort
  const violenceCounts = {}
  for (const { book, weight } of weightedBooks) {
    const authorId = book.authors?.[0]?.id
    const profile = profileMap[authorId]
    if (profile?.violenceLevel) {
      violenceCounts[profile.violenceLevel] = (violenceCounts[profile.violenceLevel] || 0) + weight
    }
  }
  const violenceComfort = Object.entries(violenceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  
  // Geographies — extract country from "City, Country"; skip vague/long values
  const geoSet = new Set()
  for (const { book } of weightedBooks) {
    const authorId = book.authors?.[0]?.id
    const profile = profileMap[authorId]
    if (profile?.primarySetting) {
      const parts = profile.primarySetting.split(',').map(p => p.trim())
      const geo = parts[parts.length - 1]
      // Skip: too long (>30 chars = vague description), "Unknown", "varies", "multiple"
      if (geo && geo.length <= 30 && !/^(unknown|varies|multiple)/i.test(geo))
        geoSet.add(geo)
    }
  }
  const geographies = Array.from(geoSet)
  
  // Author orbit (top 8 by contributed weight)
  const authorWeights = {}
  for (const { book, weight } of weightedBooks) {
    const authorName = book.authors?.[0]?.name
    if (authorName) {
      authorWeights[authorName] = (authorWeights[authorName] || 0) + weight
    }
  }
  const authorOrbit = Object.entries(authorWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name]) => name)
  
  // Persons of interest
  const comparableAuthors = {}
  for (const { book, weight } of weightedBooks) {
    const authorId = book.authors?.[0]?.id
    const profile = profileMap[authorId]
    if (profile?.comparableAuthors) {
      for (const comp of profile.comparableAuthors) {
        if (!comparableAuthors[comp]) {
          comparableAuthors[comp] = { count: 0, reason: comp, sourceWeight: weight }
        }
        comparableAuthors[comp].count++
        if (weight > comparableAuthors[comp].sourceWeight) {
          comparableAuthors[comp].sourceWeight = weight
        }
      }
    }
  }
  const comparablePool = Object.entries(comparableAuthors)
    .filter(([name]) => !authorOrbit.includes(name))
    .sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count
      return b[1].sourceWeight - a[1].sourceWeight
    })
    .slice(0, 4)
    .map(([name]) => name)
  
  // Modus operandi (via Ollama)
  const completedCount = stats.allSeries.filter(s => {
    const books = weightedBooks.filter(wb => wb.seriesId === s.id).map(wb => wb.book)
    return books.length > 0 && books.every(b => b.owned)
  }).length
  const avgCompletionPct = stats.allSeries.length > 0
    ? Math.round((completedCount / stats.allSeries.length) * 100)
    : 0
  const longestSeries = stats.allSeries.reduce((max, s) => 
    (s.totalBooks ?? 0) > (max?.totalBooks ?? 0) ? s : max
  , null)
  
  const modusPrompt = `In one sentence of 20 words or fewer, describe this reader's series-collecting behaviour based on these stats:
- Completed series: ${completedCount} of ${stats.allSeries.length}
- Average completion: ${avgCompletionPct}%
- Longest series owned: ${longestSeries?.totalBooks ?? 0} books

Write in third person. No bullet points. No lists. Be specific and slightly dry.
Examples of good output:
"Completes series obsessively. Rarely abandons a series mid-run."
"Builds collections methodically, prioritising completion over breadth."`
  
  const modusOperandi = await generateText(modusPrompt, 40)
  
  // Confidence
  const booksWithEmbedding = weightedBooks.filter(wb => 
    wb.book.embeddingSource === 'enriched' && wb.book.embedding?.length
  ).length
  const confidence = Math.min(0.95, 0.3 + (booksWithEmbedding / 200) * 0.65)
  
  return {
    dominantSubgenres,
    dominantTone,
    recurringThemes,
    pacingPreference,
    violenceComfort,
    geographies,
    authorOrbit,
    comparablePool,
    modusOperandi,
    confidence: Math.round(confidence * 100) / 100,
  }
}

// ── Portrait generation ───────────────────────────────────────────────────────

/**
 * Generate reader portrait via Ollama
 */
async function generatePortrait(structuredProfile) {
  logger.info('[profile] generating portrait via Ollama...')
  
  const pacingDesc = Object.entries(structuredProfile.pacingPreference)
    .filter(([, v]) => v > 0.1)
    .map(([k, v]) => `${k} (${Math.round(v * 100)}%)`)
    .join(', ')
  
  const prompt = `You are a literary analyst writing a dossier entry for a criminal profiler.
Write a 2–3 sentence portrait of this reader's taste in crime fiction.
Be specific — name authors, settings, atmospheres. Use third person.
No bullet points. No headers. Slightly clinical tone.
Do not mention ratings or statistics. Do not use the word "profile".

Data:
- Dominant subgenres: ${structuredProfile.dominantSubgenres.map(s => s.label).join(', ')}
- Tone: ${structuredProfile.dominantTone.join(', ')}
- Themes: ${structuredProfile.recurringThemes.join(', ')}
- Geography preference: ${structuredProfile.geographies.join(', ')}
- Most-read authors: ${structuredProfile.authorOrbit.join(', ')}
- Pacing: ${pacingDesc}
- Violence comfort: ${structuredProfile.violenceComfort}`
  
  logger.info('[profile] calling Ollama for portrait generation...')
  const portrait = await generateText(prompt, 250)
  logger.info('[profile] portrait generated', { length: portrait?.length || 0 })
  
  if (!portrait) {
    const N = structuredProfile.authorOrbit.length
    const M = structuredProfile.dominantSubgenres.length
    logger.warn('[profile] Ollama unavailable, using fallback portrait')
    return {
      portrait: `Reader profile based on ${N} authors across ${M} subgenres. Recalculate when Ollama is available to generate a full portrait.`,
      modusOperandi: structuredProfile.modusOperandi || 'Pattern analysis pending.',
      portraitFallback: true,
    }
  }
  
  // Use modus operandi from structuredProfile (already generated)
  return {
    portrait,
    modusOperandi: structuredProfile.modusOperandi,
    portraitFallback: false
  }
}

// ── Main recalculation function ───────────────────────────────────────────────

/**
 * Recalculate the complete reader profile
 */
export async function recalculateProfile({ trigger = 'manual' } = {}) {
  const startTime = Date.now()
  logger.info('[profile] recalculation started', { trigger })
  
  try {
    // 1. Collect data
    const stats = await collectSeriesData()
    
    // 2. Compute vector
    const { vector, booksWithEmbedding } = await computeProfileVector(stats.weightedBooks)
    
    // 3. Load author profiles
    const authorProfiles = await loadAuthorProfiles(stats.weightedBooks)
    
    // 4. Aggregate structured profile
    const structuredProfile = await aggregateStructuredProfile(
      stats.weightedBooks,
      authorProfiles,
      stats
    )
    
    // 5. Generate portrait and modus operandi
    const { portrait, modusOperandi, portraitFallback } = await generatePortrait(structuredProfile)
    
    // 6. Embed portrait for librarian context
    let portraitVector = null
    if (!portraitFallback) {
      try {
        portraitVector = await embed(portrait)
      } catch (err) {
        logger.warn('[profile] failed to embed portrait', { err: err.message })
      }
    }
    
    if (portraitFallback) {
      structuredProfile.portraitFallback = true
    }
    
    // 7. Build profile document
    const profileDoc = {
      id: PROFILE_ID,
      type: 'reader_profile',
      schemaVersion: '1.0.0',
      subject: 'Raymon E.',
      portrait,
      modusOperandi,
      portraitFallback,
      vector,
      portraitVector,
      // Flatten structured profile for frontend convenience
      subgenres: structuredProfile.dominantSubgenres,
      tone: structuredProfile.dominantTone.map(t => ({ name: t, weight: 0.5 })),
      themes: structuredProfile.recurringThemes.map(t => ({ name: t, weight: 0.5 })),
      pacing: (() => {
        const pref = structuredProfile.pacingPreference
        if (!pref) return []
        const dominant = Object.entries(pref).sort((a, b) => b[1] - a[1])[0]
        return dominant ? [{ name: dominant[0], weight: dominant[1] }] : []
      })(),
      violence: structuredProfile.violenceComfort ? [{ name: structuredProfile.violenceComfort, weight: 0.5 }] : [],
      geographies: structuredProfile.geographies.map(g => ({ name: g, weight: 0.5 })),
      authorOrbit: structuredProfile.authorOrbit,
      personsOfInterest: structuredProfile.comparablePool || [],
      booksAnalyzed: stats.totalBooksWeighted,
      seriesAnalyzed: stats.seriesContributing,
      lastCalculated: new Date().toISOString(),
      // Keep full structured profile for backend use
      structuredProfile,
      stats: {
        totalBooksWeighted: Math.round(stats.totalBooksWeighted * 10) / 10,
        seriesContributing: stats.seriesContributing,
        booksWithRating: stats.booksWithRating,
        avgRating: stats.avgRating,
        lastRecalculated: new Date().toISOString(),
        recalculationTrigger: trigger,
        recalculationDurationMs: Date.now() - startTime,
      },
    }
    
    // 8. Write to Couchbase
    logger.info('[profile] writing to Couchbase...')
    await getScope().collection('profile').upsert(PROFILE_ID, profileDoc)
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    logger.info(`[profile] done in ${duration}s`, {
      confidence: structuredProfile.confidence,
      booksWithEmbedding,
      seriesContributing: stats.seriesContributing,
    })
    
    return profileDoc
  } catch (err) {
    logger.error('[profile] recalculation failed', { err: err.message, stack: err.stack })
    throw err
  }
}

/**
 * Get the current profile, creating it if it doesn't exist
 */
export async function getProfile() {
  try {
    const doc = await getScope().collection('profile').get(PROFILE_ID)
    return doc.content
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) {
      // Profile doesn't exist - create it synchronously
      logger.info('[profile] profile not found, creating...')
      return await recalculateProfile({ trigger: 'first_load' })
    }
    throw err
  }
}

/**
 * Invalidate series vector cache (called when books in a series change)
 */
export function invalidateSeriesVector(seriesId) {
  // This will be used by Section 4 - series vector caching
  // For now, just a placeholder
  logger.debug('[profile] series vector invalidated', { seriesId })
}

// Made with Bob
