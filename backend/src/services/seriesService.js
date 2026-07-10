import couchbase from 'couchbase'
import { getCluster, getScope } from '../config/couchbase.js'
import { seriesId, slugify } from '../utils/idGenerator.js'
import { NotFoundError, ValidationError } from '../utils/errors.js'
import { logger } from '../config/logger.js'
import { recalculateProfile } from './profileService.js'
import { cosineSim } from './embeddingService.js'

const BUCKET = process.env.COUCHBASE_BUCKET || 'library'
const SCOPE_NAME = process.env.COUCHBASE_SCOPE || 'library_scope'
const KS       = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`series\``
const KS_AUTHORS = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`authors\``
const KS_BOOKS   = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`books\``

function col(name = 'series') {
  return getScope().collection(name)
}

async function kvGet(id) {
  try {
    return await col().get(id)
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) throw new NotFoundError('Series', id)
    throw err
  }
}

// Annotate each series with the highest-priority readStatus across its linked books.
// Priority: reading > want-to-read > read > did-not-finish
const STATUS_PRIORITY = { reading: 0, 'want-to-read': 1, read: 2, 'did-not-finish': 3 }

async function annotateStatuses(seriesList) {
  const allBookIds = [...new Set(
    seriesList.flatMap(s => (s.books ?? []).map(b => b.bookId).filter(Boolean))
  )]
  if (!allBookIds.length) return seriesList

  const result = await getCluster().query(
    `SELECT META(b).id AS bookId, b.readStatus
     FROM ${KS_BOOKS} b
     WHERE META(b).id IN $bookIds AND b.readStatus IS NOT MISSING`,
    { parameters: { bookIds: allBookIds } }
  )
  const statusMap = Object.fromEntries(result.rows.map(r => [r.bookId, r.readStatus]))

  return seriesList.map(s => {
    const statuses = (s.books ?? [])
      .filter(b => b.bookId && statusMap[b.bookId])
      .map(b => statusMap[b.bookId])
    const currentReadStatus = statuses.length
      ? statuses.sort((a, b) => (STATUS_PRIORITY[a] ?? 99) - (STATUS_PRIORITY[b] ?? 99))[0]
      : null
    return { ...s, currentReadStatus }
  })
}

function withCompletion(s) {
  const ownedCount = (s.books ?? []).filter((b) => b.owned).length
  const total = s.totalBooks ?? 0
  const completionPct = total > 0 ? Math.round((ownedCount / total) * 1000) / 10 : 0
  return { ...s, ownedCount, completionPct }
}

function bolUrl(book) {
  const q = book.isbn
    ? encodeURIComponent(book.isbn)
    : encodeURIComponent(book.title)
  return `https://www.bol.com/nl/nl/s/?searchtext=${q}`
}

// ------------------------------------------------------------------------------
// List
// ------------------------------------------------------------------------------
export async function listSeries({ page = 1, limit = 20 } = {}) {
  const limitN  = Math.min(parseInt(limit) || 20, 100)
  const offsetN = (Math.max(parseInt(page) || 1, 1) - 1) * limitN

  const [dataRes, countRes] = await Promise.all([
    getCluster().query(
      `SELECT s.*,
         IFNULL((SELECT RAW a.name FROM ${KS_AUTHORS} a USE KEYS [s.authorId] LIMIT 1)[0], null) AS authorName
       FROM ${KS} s
       ORDER BY s.name ASC
       LIMIT ${limitN} OFFSET ${offsetN}`
    ),
    getCluster().query(`SELECT COUNT(*) AS total FROM ${KS} s`),
  ])

  const total = countRes.rows[0]?.total ?? 0
  const seriesList = await annotateStatuses(dataRes.rows.map(withCompletion))
  return {
    series: seriesList,
    total,
    page: Math.max(parseInt(page) || 1, 1),
    limit: limitN,
    pages: Math.ceil(total / limitN),
  }
}

// ------------------------------------------------------------------------------
// Get single
// ------------------------------------------------------------------------------
export async function getSeries(id) {
  const result = await kvGet(id)
  return withCompletion(result.content)
}

// ------------------------------------------------------------------------------
// Create
// ------------------------------------------------------------------------------
export async function createSeries(data) {
  const slug = data.slug ?? slugify(data.name)
  const id = seriesId(slug)
  const doc = {
    id,
    type: 'series',
    name: data.name,
    slug,
    authorId: data.authorId ?? null,
    totalBooks: parseInt(data.totalBooks) || 0,
    completedAt: null,
    addedAt: new Date().toISOString(),
    books: (data.books ?? []).map((b) => ({
      seriesOrder: b.seriesOrder,
      bookId: b.bookId ?? null,
      title: b.title ?? '',
      originalTitle: b.originalTitle ?? null,
      altTitles: b.altTitles ?? [],
      isbn: b.isbn ?? '',
      publishedYear: b.publishedYear ?? null,
      owned: b.owned ?? false,
    })),
  }
  try {
    await col().insert(id, doc)
  } catch (err) {
    if (err instanceof couchbase.DocumentExistsError) {
      throw new ValidationError(`Series slug '${slug}' already exists — provide a unique slug`)
    }
    throw err
  }
  logger.info('[series] created', { id })
  
  // Trigger profile recalculation
  recalculateProfile({ trigger: 'series_change' }).catch(err =>
    logger.warn('[series] background profile recalculation failed', { err: err.message })
  )
  
  return withCompletion(doc)
}

// ------------------------------------------------------------------------------
// Missing books
// ------------------------------------------------------------------------------
export async function getMissingBooks(id) {
  const result = await kvGet(id)
  const series = result.content
  const missing = (series.books ?? [])
    .filter((b) => !b.owned)
    .sort((a, b) => a.seriesOrder - b.seriesOrder)
    .map((b) => ({ ...b, bolUrl: bolUrl(b) }))
  return { series: series.name, seriesId: id, missing }
}

// ------------------------------------------------------------------------------
// Update
// ------------------------------------------------------------------------------
export async function updateSeries(id, data) {
  const existing = await kvGet(id)
  const current = existing.content

  const books = (data.books ?? current.books ?? []).map((b) => ({
    seriesOrder: parseInt(b.seriesOrder) || 0,
    bookId: b.bookId ?? null,
    title: b.title ?? '',
    originalTitle: b.originalTitle ?? '',
    altTitles: Array.isArray(b.altTitles) ? b.altTitles.filter(Boolean) : [],
    isbn: b.isbn ?? '',
    publishedYear: b.publishedYear ? parseInt(b.publishedYear) : null,
    owned: Boolean(b.owned),
  })).sort((a, b) => a.seriesOrder - b.seriesOrder)

  const updated = {
    ...current,
    name: data.name?.trim() ?? current.name,
    slug: data.slug ?? current.slug,
    authorId: data.authorId !== undefined ? data.authorId : current.authorId,
    totalBooks: books.length,
    books,
    completedAt: books.length > 0 && books.every((b) => b.owned)
      ? (current.completedAt ?? new Date().toISOString())
      : null,
  }

  await col().replace(id, updated)
  logger.info('[series] updated', { id })
  
  // Trigger profile recalculation
  recalculateProfile({ trigger: 'series_change' }).catch(err =>
    logger.warn('[series] background profile recalculation failed', { err: err.message })
  )
  
  return withCompletion(updated)
}

// ------------------------------------------------------------------------------
// Delete
// ------------------------------------------------------------------------------
export async function deleteSeries(id) {
  try {
    await col().remove(id)
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) throw new NotFoundError('Series', id)
    throw err
  }
  logger.info('[series] deleted', { id })
  
  // Trigger profile recalculation
  recalculateProfile({ trigger: 'series_change' }).catch(err =>
    logger.warn('[series] background profile recalculation failed', { err: err.message })
  )
}

// ------------------------------------------------------------------------------
// Mark book owned / unowned
// ------------------------------------------------------------------------------
export async function markBookOwned(id, order, { owned }) {
  const result = await kvGet(id)
  const series = result.content
  const orderNum = parseInt(order)

  const idx = series.books.findIndex((b) => b.seriesOrder === orderNum)
  if (idx === -1) throw new NotFoundError('SeriesBook', `seriesOrder ${order}`)

  series.books[idx].owned = Boolean(owned)

  // Sync flag to the linked book document when it exists
  const linkedBookId = series.books[idx].bookId
  if (linkedBookId) {
    try {
      await col('books').mutateIn(linkedBookId, [
        couchbase.MutateInSpec.upsert('owned', Boolean(owned)),
      ])
    } catch (err) {
      if (!(err instanceof couchbase.DocumentNotFoundError)) throw err
      logger.warn('[series] bookId in series points to missing book doc', { linkedBookId })
    }
  }

  // Mark series complete when every entry is owned
  const allOwned = series.books.length > 0 && series.books.every((b) => b.owned)
  series.completedAt = allOwned ? new Date().toISOString() : null

  await col().replace(id, series)
  logger.info('[series] marked book owned', { id, order: orderNum, owned })
  return withCompletion(series)
}


// ------------------------------------------------------------------------------
// Series vector caching and similarity
// ------------------------------------------------------------------------------

// In-memory cache for series vectors (5-minute TTL)
const _seriesVectorCache = new Map()
const SERIES_VECTOR_TTL = 5 * 60 * 1000

/**
 * Compute book weight (same as profileService)
 */
function bookWeight(book) {
  const ratingMult = { 5: 2.0, 4: 1.5, 3: 1.0, 2: 0.6, 1: 0.3 }
  const readMult = book.readStatus === 'read' ? 1.5 : 1.0
  const rating = book.rating ?? null
  const rMult = rating ? (ratingMult[rating] ?? 1.0) : 0.8
  return rMult * readMult
}

/**
 * Compute series vector from weighted book embeddings
 */
async function computeSeriesVector(seriesId) {
  const scope = getScope()
  
  // Load all books in this series
  const result = await getCluster().query(
    `SELECT b.* FROM ${KS_BOOKS} b WHERE b.seriesId = $seriesId`,
    { parameters: { seriesId } }
  )
  const books = result.rows ?? []
  
  if (books.length === 0) return null
  
  // Compute weighted average of book embeddings
  const dims = 768
  const sumVector = new Array(dims).fill(0)
  let totalWeight = 0
  let booksWithEmbedding = 0
  
  for (const book of books) {
    if (!book.embedding?.length || book.embedding.length !== dims) continue
    
    const weight = bookWeight(book)
    booksWithEmbedding++
    
    for (let i = 0; i < dims; i++) {
      sumVector[i] += book.embedding[i] * weight
    }
    totalWeight += weight
  }
  
  if (totalWeight === 0 || booksWithEmbedding === 0) return null
  
  // Weighted average
  const avgVector = sumVector.map(v => v / totalWeight)
  
  // L2-normalize
  const norm = Math.sqrt(avgVector.reduce((s, v) => s + v * v, 0))
  const normalized = norm > 0 ? avgVector.map(v => v / norm) : avgVector
  
  return normalized
}

/**
 * Get series vector with caching
 */
async function getSeriesVector(seriesId) {
  const cached = _seriesVectorCache.get(seriesId)
  if (cached && Date.now() - cached.ts < SERIES_VECTOR_TTL) {
    return cached.vector
  }
  
  const vector = await computeSeriesVector(seriesId)
  if (vector) {
    _seriesVectorCache.set(seriesId, { vector, ts: Date.now() })
  }
  
  return vector
}

/**
 * Invalidate series vector cache (called when books in series change)
 */
export function invalidateSeriesVector(seriesId) {
  _seriesVectorCache.delete(seriesId)
  logger.debug('[series] vector cache invalidated', { seriesId })
}

/**
 * Generate WHY explanation for similar series
 */
async function generateSeriesWhy(seedSeries, resultSeries) {
  const scope = getScope()
  const reasons = []
  
  // Load author profiles for both series
  const [seedAuthor, resultAuthor] = await Promise.all([
    seedSeries.authorId ? scope.collection('authors').get(seedSeries.authorId).catch(() => null) : null,
    resultSeries.authorId ? scope.collection('authors').get(resultSeries.authorId).catch(() => null) : null,
  ])
  
  const seedProfile = seedAuthor?.content?.profile
  const resultProfile = resultAuthor?.content?.profile
  
  if (seedProfile && resultProfile) {
    // Same subgenre
    if (seedProfile.subgenre && seedProfile.subgenre === resultProfile.subgenre) {
      reasons.push(`subgenre: ${resultProfile.subgenre}`)
    }
    
    // Shared tone
    const sharedTone = (seedProfile.tone ?? []).filter(t => 
      (resultProfile.tone ?? []).includes(t)
    )
    if (sharedTone.length > 0) {
      reasons.push(`tone: ${sharedTone.slice(0, 2).join('+')}`)
    }
    
    // Shared themes
    const sharedThemes = (seedProfile.themes ?? []).filter(t => 
      (resultProfile.themes ?? []).includes(t)
    )
    if (sharedThemes.length > 0) {
      reasons.push(`themes: ${sharedThemes.slice(0, 2).join('+')}`)
    }
    
    // Same geography region
    if (seedProfile.primarySetting && resultProfile.primarySetting) {
      const seedGeo = seedProfile.primarySetting.split(',').pop().trim()
      const resultGeo = resultProfile.primarySetting.split(',').pop().trim()
      if (seedGeo === resultGeo) {
        reasons.push(`setting: ${resultGeo}`)
      }
    }
  }
  
  return reasons.length > 0 ? reasons.join(' · ') : 'similar themes and style'
}

/**
 * Find similar series to a given series
 */
export async function getSimilarSeries(seriesId, { limit = 4 } = {}) {
  // Load target series
  const targetSeries = await getSeries(seriesId)
  
  // Compute target series vector
  const targetVector = await getSeriesVector(seriesId)
  if (!targetVector) {
    return { seriesId, seriesName: targetSeries.name, similar: [] }
  }
  
  // Load all other series
  const allSeriesResult = await getCluster().query(
    `SELECT s.*, 
       IFNULL((SELECT RAW a.name FROM ${KS_AUTHORS} a USE KEYS [s.authorId] LIMIT 1)[0], null) AS authorName
     FROM ${KS} s
     WHERE META(s).id != $seriesId`,
    { parameters: { seriesId } }
  )
  const allSeries = allSeriesResult.rows ?? []
  
  // Compute similarity scores
  const scored = []
  for (const series of allSeries) {
    const vector = await getSeriesVector(series.id)
    if (!vector) continue
    
    const score = cosineSim(targetVector, vector)
    if (score > 0) {
      scored.push({ series, score })
    }
  }
  
  // Sort by score and take top N
  scored.sort((a, b) => b.score - a.score)
  const topSimilar = scored.slice(0, limit)
  
  // Generate WHY explanations
  const similar = await Promise.all(
    topSimilar.map(async ({ series, score }) => ({
      seriesId: series.id,
      seriesName: series.name,
      authorName: series.authorName,
      score: Math.round(score * 1000) / 1000,
      why: await generateSeriesWhy(targetSeries, series),
    }))
  )
  
  return {
    seriesId,
    seriesName: targetSeries.name,
    similar,
  }
}

/**
 * Find standalone books that bridge to a series
 */
export async function getBridgingReads(seriesId, { limit = 3 } = {}) {
  // Compute series vector
  const seriesVector = await getSeriesVector(seriesId)
  if (!seriesVector) {
    return { seriesId, bridging: [] }
  }
  
  // Load all standalone books (no seriesId)
  const standaloneResult = await getCluster().query(
    `SELECT b.* FROM ${KS_BOOKS} b 
     WHERE (b.seriesId IS MISSING OR b.seriesId IS NULL)
       AND b.embedding IS NOT MISSING`
  )
  const standaloneBooks = standaloneResult.rows ?? []
  
  // Score by similarity
  const scored = []
  for (const book of standaloneBooks) {
    if (!book.embedding?.length) continue
    
    const score = cosineSim(seriesVector, book.embedding)
    if (score > 0) {
      scored.push({ book, score })
    }
  }
  
  // Sort and take top N
  scored.sort((a, b) => b.score - a.score)
  const topBridging = scored.slice(0, limit)
  
  // Load series for WHY generation
  const targetSeries = await getSeries(seriesId)
  const scope = getScope()
  
  // Generate WHY for each
  const bridging = await Promise.all(
    topBridging.map(async ({ book, score }) => {
      const reasons = []
      
      // Load author profile
      const authorId = book.authors?.[0]?.id
      if (authorId) {
        try {
          const authorDoc = await scope.collection('authors').get(authorId)
          const profile = authorDoc.content.profile
          
          // Load target series author profile
          let targetProfile = null
          if (targetSeries.authorId) {
            try {
              const targetAuthorDoc = await scope.collection('authors').get(targetSeries.authorId)
              targetProfile = targetAuthorDoc.content.profile
            } catch {}
          }
          
          if (profile && targetProfile) {
            if (profile.subgenre === targetProfile.subgenre) {
              reasons.push(`${profile.subgenre}`)
            }
            const sharedTone = (profile.tone ?? []).filter(t => 
              (targetProfile.tone ?? []).includes(t)
            )
            if (sharedTone.length > 0) {
              reasons.push(sharedTone[0])
            }
            const sharedThemes = (profile.themes ?? []).filter(t => 
              (targetProfile.themes ?? []).includes(t)
            )
            if (sharedThemes.length > 0) {
              reasons.push(sharedThemes[0])
            }
          }
        } catch {}
      }
      
      return {
        bookId: book.id,
        title: book.title,
        authorName: book.authors?.[0]?.name ?? '',
        coverUrl: book.coverUrl ?? '',
        score: Math.round(score * 1000) / 1000,
        why: reasons.length > 0 ? reasons.join(' · ') : 'similar themes',
      }
    })
  )
  
  return {
    seriesId,
    bridging,
  }
}
