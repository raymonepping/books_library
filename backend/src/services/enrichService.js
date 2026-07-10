import axios from 'axios'
import { getGoogleBooksApiKey } from '../config/secrets.js'
import { logger } from '../config/logger.js'

const OL_BASE = 'https://openlibrary.org'
const GB_BASE = 'https://www.googleapis.com/books/v1'
const TIMEOUT = 8_000

function normaliseIsbn(isbn) {
  return isbn.replace(/[-\s]/g, '')
}

function parseYear(str) {
  const m = String(str ?? '').match(/\d{4}/)
  return m ? parseInt(m[0], 10) : null
}

function httpsUrl(url) {
  return url ? url.replace(/^http:/, 'https:') : ''
}

// ------------------------------------------------------------------------------
// Open Library — book by ISBN
// ------------------------------------------------------------------------------
async function fetchOLBook(isbn) {
  try {
    const res = await axios.get(`${OL_BASE}/api/books`, {
      params: { bibkeys: `ISBN:${isbn}`, format: 'json', jscmd: 'data' },
      timeout: TIMEOUT,
    })
    return res.data[`ISBN:${isbn}`] ?? null
  } catch (err) {
    logger.warn('[enrich] Open Library book fetch failed', { isbn, err: err.message })
    return null
  }
}

// ------------------------------------------------------------------------------
// Google Books — volume by ISBN
// ------------------------------------------------------------------------------
async function fetchGBBook(isbn) {
  try {
    const apiKey = getGoogleBooksApiKey()
    const params = { q: `isbn:${isbn}` }
    if (apiKey && apiKey !== 'PLACEHOLDER_UPDATE_ME') params.key = apiKey
    const res = await axios.get(`${GB_BASE}/volumes`, { params, timeout: TIMEOUT })
    return res.data.items?.[0] ?? null
  } catch (err) {
    logger.warn('[enrich] Google Books fetch failed', { isbn, err: err.message })
    return null
  }
}

// ------------------------------------------------------------------------------
// Merge OL + Google Books into a normalised book shape
// ------------------------------------------------------------------------------
function mergeBook(isbn, ol, gbItem) {
  const gb = gbItem?.volumeInfo ?? null

  const authors = ol?.authors?.map((a) => a.name).filter(Boolean)
    ?? gb?.authors
    ?? []

  const coverUrl =
    httpsUrl(ol?.cover?.large) ||
    httpsUrl(ol?.cover?.medium) ||
    httpsUrl(gb?.imageLinks?.large) ||
    httpsUrl(gb?.imageLinks?.thumbnail) ||
    ''

  const description = gb?.description || ol?.excerpts?.[0]?.text || ''

  const olSubjects = (ol?.subjects ?? [])
    .map((s) => (typeof s === 'string' ? s : s.name))
    .filter(Boolean)
  const genres = olSubjects.length ? olSubjects : (gb?.categories ?? [])

  const publishedYear = parseYear(ol?.publish_date) ?? parseYear(gb?.publishedDate) ?? null

  const workKey = ol?.works?.[0]?.key ?? null

  return {
    isbn,
    isbn13: isbn.length === 13 ? isbn : '',
    title: ol?.title || gb?.title || '',
    subtitle: gb?.subtitle || '',
    authors,
    publishedYear,
    pageCount: ol?.number_of_pages || gb?.pageCount || null,
    coverUrl,
    description,
    genres,
    language: gb?.language || '',
    publishers: ol?.publishers?.map((p) => p.name) ?? (gb?.publisher ? [gb.publisher] : []),
    sources: {
      openLibrary: ol ? { key: ol.key ?? null, workKey } : null,
      googleBooks: gbItem ? { id: gbItem.id } : null,
    },
  }
}

// ------------------------------------------------------------------------------
// Open Library — cover search by title + optional author
// ------------------------------------------------------------------------------
export async function fetchCoverByTitleAuthor(title, authors = []) {
  try {
    const authorName = Array.isArray(authors)
      ? (typeof authors[0] === 'string' ? authors[0] : authors[0]?.name ?? '')
      : ''
    const params = { title, limit: 3, fields: 'cover_i,title,author_name' }
    if (authorName) params.author = authorName

    const res = await axios.get(`${OL_BASE}/search.json`, { params, timeout: TIMEOUT })
    const coverId = res.data.docs?.find(d => d.cover_i)?.cover_i
    if (!coverId) return null
    return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
  } catch (err) {
    logger.warn('[enrich] OL title/author cover search failed', { title, err: err.message })
    return null
  }
}

// ------------------------------------------------------------------------------
// Public: enrich by ISBN
// ------------------------------------------------------------------------------
export async function enrichByIsbn(rawIsbn) {
  const isbn = normaliseIsbn(rawIsbn)
  const [ol, gbItem] = await Promise.all([fetchOLBook(isbn), fetchGBBook(isbn)])
  if (!ol && !gbItem) return null
  return mergeBook(isbn, ol, gbItem)
}

// ------------------------------------------------------------------------------
// Open Library — author search
// ------------------------------------------------------------------------------
async function fetchOLAuthor(name) {
  try {
    const res = await axios.get(`${OL_BASE}/search/authors.json`, {
      params: { q: name, limit: 5 },
      timeout: TIMEOUT,
    })
    return res.data.docs ?? []
  } catch (err) {
    logger.warn('[enrich] Open Library author search failed', { name, err: err.message })
    return []
  }
}

// ------------------------------------------------------------------------------
// Open Library — full author document (bio, photos, birth_date, …)
// ------------------------------------------------------------------------------
async function fetchOLAuthorDetails(olKey) {
  try {
    const key = olKey.startsWith('/authors/') ? olKey.slice('/authors/'.length) : olKey
    const res = await axios.get(`${OL_BASE}/authors/${key}.json`, { timeout: TIMEOUT })
    return res.data ?? null
  } catch (err) {
    logger.warn('[enrich] OL author details fetch failed', { olKey, err: err.message })
    return null
  }
}

// ------------------------------------------------------------------------------
// Public: pick best OL match, fetch full details, return normalised author data.
// Used by both the per-author route and the batch admin endpoint.
// ------------------------------------------------------------------------------
export async function enrichAuthorByName(name) {
  const candidates = await fetchOLAuthor(name)
  if (!candidates.length) return null

  // Prefer exact name match, then highest work_count
  const lower = name.toLowerCase()
  const best  = candidates.find(c => c.name?.toLowerCase() === lower)
    ?? [...candidates].sort((a, b) => (b.work_count ?? 0) - (a.work_count ?? 0))[0]

  if (!best?.key) return null

  const details = await fetchOLAuthorDetails(best.key)

  const bio = typeof details?.bio === 'string'
    ? details.bio
    : (details?.bio?.value ?? '')

  // Photo: prefer a known photo ID (more reliable than OLID cover lookup)
  const photoId  = details?.photos?.find?.(p => p > 0) ?? null
  const photoUrl = photoId
    ? `https://covers.openlibrary.org/a/id/${photoId}-L.jpg`
    : `https://covers.openlibrary.org/a/olid/${best.key}-L.jpg`

  return {
    name:      details?.personal_name ?? details?.name ?? best.name ?? name,
    bio:       bio.slice(0, 2000),
    birthYear: parseYear(best.birth_date ?? details?.birth_date),
    photoUrl,
    olKey:     best.key,
  }
}

// ------------------------------------------------------------------------------
// Ollama — genre + sentiment analysis
// ------------------------------------------------------------------------------

export const GENRES = [
  'Scandinavisch noir',
  'Psychologische thriller',
  'Politiethriller',
  'Juridische thriller',
  'Misdaad',
  'Spionage',
  'Historische thriller',
  'Literaire fictie',
  'Horrorthriller',
  'Actiethriller',
  'Sociaal drama',
]

const MIN_GENRES = 3

const GENRE_ALIASES = new Map([
  // Scandinavisch noir — all observed model variants
  ['scandi noir',              'Scandinavisch noir'],
  ['scandi-noir',              'Scandinavisch noir'],
  ['scandi noire',             'Scandinavisch noir'],
  ['scandinoir',               'Scandinavisch noir'],
  ['scandi',                   'Scandinavisch noir'],
  ['scandiethriller',          'Scandinavisch noir'],
  ['scandiithriller',          'Scandinavisch noir'],
  ['scandiinavische misdaad',  'Scandinavisch noir'],
  ['scandinavische misdaad',   'Scandinavisch noir'],
  ['nordic noir',              'Scandinavisch noir'],
  ['nordic crime',             'Scandinavisch noir'],
  ['scandinavian noir',        'Scandinavisch noir'],
  ['scandinavisch noir',       'Scandinavisch noir'],

  // Politiethriller variants
  ['poliithriller',            'Politiethriller'],
  ['poliitiethriller',         'Politiethriller'],
  ['politie thriller',         'Politiethriller'],
  ['politiethriller',          'Politiethriller'],
  ['police thriller',          'Politiethriller'],
  ['police procedural',        'Politiethriller'],

  // English equivalents — model occasionally responds in English
  ['psychological thriller',   'Psychologische thriller'],
  ['historical thriller',      'Historische thriller'],
  ['legal thriller',           'Juridische thriller'],
  ['horror thriller',          'Horrorthriller'],
  ['action thriller',          'Actiethriller'],
  ['social drama',             'Sociaal drama'],
  ['literary fiction',         'Literaire fictie'],
  ['crime',                    'Misdaad'],
  ['espionage',                'Spionage'],
  ['spy',                      'Spionage'],
])

function normalizeGenre(genre) {
  if (typeof genre !== 'string') return null
  const trimmed = genre.trim()
  if (GENRES.includes(trimmed)) return trimmed
  const lower = trimmed.toLowerCase()
  const caseMatch = GENRES.find(g => g.toLowerCase() === lower)
  if (caseMatch) return caseMatch
  const alias = GENRE_ALIASES.get(lower)
  if (alias) return alias

  const closest = GENRES
    .map(candidate => ({ candidate, distance: levenshtein(lower, candidate.toLowerCase()) }))
    .sort((a, b) => a.distance - b.distance)[0]

  return closest?.distance <= 3 ? closest.candidate : null
}

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = Array(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      )
    }
    prev.splice(0, prev.length, ...curr)
  }

  return prev[b.length]
}

const NORDIC_KEYWORDS = [
  // Countries
  'noorwegen', 'norway', 'norge',
  'zweden', 'sweden', 'sverige',
  'denemarken', 'denmark', 'danmark',
  'finland', 'suomi',
  'ijsland', 'iceland', 'ísland',
  // Cities
  'oslo', 'bergen', 'stavanger', 'trondheim',
  'stockholm', 'göteborg', 'malmö', 'gothenburg',
  'kopenhagen', 'copenhagen', 'københavn',
  'helsinki', 'tampere',
  'reykjavik',
  // Cultural / linguistic markers
  'noors', 'noorse', 'zweeds', 'zweedse',
  'deens', 'deense', 'fins', 'finse',
  'scandinavisch', 'scandinavische',
  'nordic', 'nordisch',
  'fjord', 'lapland',
]

function buildGenrePrompt(description) {
  return `You are a literary genre analyst. Analyse the book description below and return JSON only. No explanation, no markdown, no code fences.

Tasks:
1. Extract the dominant sentiment from the description: tone, mood, setting, and pace.
2. Assign between 3 and 5 genres from this list (ranked by relevance, most relevant first):
   ${GENRES.join(', ')}
   Use exact spellings only. Never invent genres not in this list.

   STRICT RULE for "Scandinavisch noir":
   Only assign "Scandinavisch noir" when the description explicitly mentions
   a Nordic country or city: Norway, Sweden, Denmark, Finland, Iceland,
   Oslo, Stockholm, Copenhagen, Helsinki, Reykjavik, Bergen, Göteborg, etc.
   If no Nordic location appears in the description → do NOT assign it.
   When in doubt, leave it out.

Description:
"${description}"

Respond with this exact JSON structure and nothing else:
{
  "sentiment": {
    "tone": ["word1", "word2"],
    "mood": ["word1", "word2"],
    "setting": ["word1", "word2"],
    "pace": "single phrase"
  },
  "genres": ["Genre 1","Genre 2","Genre 3"]
}`
}

function repairJSON(str) {
  return str
    .replace(/[\u2018\u2019]/g, "'")           // smart single quotes
    .replace(/[\u201C\u201D]/g, '"')           // smart double quotes
    .replace(/,(\s*[}\]])/g, '$1')               // trailing commas before } or ]
    .replace(/([\]"0-9truefalsnull}])\s*\n(\s*")/g, '$1,\n$2') // missing comma between properties
}

function extractGenreJSON(raw) {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
  const first = stripped.indexOf('{')
  const last  = stripped.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('No JSON object found in model response')
  return JSON.parse(repairJSON(stripped.slice(first, last + 1)))
}

function validateGenreResponse(parsed) {
  const { sentiment, genres } = parsed
  if (!sentiment || typeof sentiment !== 'object') throw new Error('Missing or invalid sentiment object')
  if (!Array.isArray(genres) || genres.length === 0) throw new Error('Missing or empty genres array')
  // Deduplicate while preserving order
  const seen = new Set()
  const validGenres = genres
    .map(normalizeGenre)
    .filter(g => g && !seen.has(g) && seen.add(g))
  if (validGenres.length < MIN_GENRES) {
    throw new Error(`Only ${validGenres.length} valid genres, need at least ${MIN_GENRES}: ${JSON.stringify(genres)}`)
  }
  return {
    sentiment: {
      tone:    Array.isArray(sentiment.tone)      ? sentiment.tone    : [],
      mood:    Array.isArray(sentiment.mood)      ? sentiment.mood    : [],
      setting: Array.isArray(sentiment.setting)   ? sentiment.setting : [],
      pace:    typeof sentiment.pace === 'string' ? sentiment.pace    : '',
    },
    genres: validGenres,
  }
}

export function buildEmbeddingInput(book) {
  return [
    book.styleFingerprint ?? '',
    book.styleFingerprint ?? '',
    (book.sentiment?.tone ?? []).join(' '),
    (book.sentiment?.mood ?? []).join(' '),
    book.sentiment?.pace ?? '',
    (book.genres ?? []).slice(0, 3).join(' '),
  ].filter(Boolean).join(' . ')
}

export async function analyseDescription(description) {
  const model   = process.env.OLLAMA_GENRE_MODEL ?? process.env.OLLAMA_GENERATE_MODEL
  const baseUrl = process.env.OLLAMA_BASE_URL
  if (!model)   throw new Error('OLLAMA_GENRE_MODEL is not set')
  if (!baseUrl) throw new Error('OLLAMA_BASE_URL is not set')

  const prompt = buildGenrePrompt(description)
  let bestResult = null
  const MAX = 2
  // Slightly higher temperature on retries to shake loose different genres
  const temperatures = [0.2, 0.5]

  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model, prompt, stream: false, options: { temperature: temperatures[attempt - 1], top_p: 0.9 } }),
      })
      if (!response.ok) throw new Error(`Ollama responded ${response.status}: ${await response.text()}`)
      const data   = await response.json()
      const parsed = extractGenreJSON(data.response ?? '')
      const result = validateGenreResponse(parsed)

      // Nordic gate — strip Scandinavisch noir if no Nordic keyword in description
      if (result.genres.includes('Scandinavisch noir')) {
        const descLower = description.toLowerCase()
        const hasNordicSignal = NORDIC_KEYWORDS.some(k => descLower.includes(k))
        if (!hasNordicSignal) {
          result.genres = result.genres.filter(g => g !== 'Scandinavisch noir')
          logger.debug('[enrich] stripped Scandinavisch noir — no Nordic keywords in description')
        }
      }

      if (!bestResult || result.genres.length > bestResult.genres.length) bestResult = result
      if (result.genres.length >= MIN_GENRES) break
      if (attempt < MAX) logger.warn(`[enrich] got ${result.genres.length}/${MIN_GENRES} genres on attempt ${attempt}, retrying`)
    } catch (err) {
      logger.warn(`[enrich] genre analysis attempt ${attempt} failed: ${err.message}`)
      if (attempt === MAX && !bestResult) throw err
    }
  }

  logger.debug(`[enrich] genre analysis complete model=${model} genres=${bestResult.genres.join(', ')}`)
  return bestResult
}

export async function generateFingerprint(description) {
  const model   = process.env.OLLAMA_FINGERPRINT_MODEL ?? process.env.OLLAMA_GENERATE_MODEL
  const baseUrl = process.env.OLLAMA_BASE_URL
  if (!model)   throw new Error('OLLAMA_FINGERPRINT_MODEL is not set')
  if (!baseUrl) throw new Error('OLLAMA_BASE_URL is not set')

  const basePrompt = `You are a literary atmosphere analyst. Read the book description below.

Write a styleFingerprint: a phrase of MAXIMUM 20 WORDS that describes the
atmosphere, narrative style, type of threat, and type of investigator.

ABSOLUTE RULES — violation means failure:
- NO character names (e.g. NOT "Harry Hole", NOT "Kim Stone", NOT "Sabine Nemez")
- NO city names (e.g. NOT "Oslo", NOT "Munich", NOT "Glasgow")
- NO country names
- NO plot details or spoilers
- NO character relationships
- ONLY: atmosphere words, pace words, antagonist type, investigator type

GOOD EXAMPLES:
"cold methodical procedural, reluctant institutional detective, ideological antagonist, slow-burn Nordic decay"
"relentless fast-paced serial killer hunt, damaged female detective, sadistic architect antagonist, dark urban dread"
"intellectual chess match, exceptional specialist brought in, elaborate symbolic MO, claustrophobic puzzle-driven tension"
"forensic investigation, calculated predatory killer, female detective under institutional pressure, compulsive chapter pace"

BAD EXAMPLES (never do this):
"Harry Hole investigates in Oslo" — contains character name and city
"Sabine Nemez and Maarten Sneijder hunt a killer" — contains character names
"set in Munich, a profiler tracks..." — contains city name

Description:
"${description}"

Respond with the styleFingerprint phrase only. No JSON. No explanation. No quotes. Just the phrase.`

  const detectedNames = []

  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = detectedNames.length > 0
      ? `${basePrompt}\n\nIMPORTANT: Your previous attempt used character names. Do NOT use any of these: ${detectedNames.join(', ')}. Replace with role descriptions (e.g. "tenacious detective", "calculating antagonist").`
      : basePrompt

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          model,
          prompt,
          stream:  false,
          options: { temperature: 0.4, top_p: 0.9 },
        }),
      })
      if (!response.ok) throw new Error(`Ollama responded ${response.status}: ${await response.text()}`)

      const data = await response.json()
      const raw  = (data.response ?? '').trim().replace(/^["']|["']$/g, '').trim()

      if (!raw || raw.length < 10) throw new Error(`Fingerprint too short: "${raw}"`)
      if (raw.length > 300) throw new Error(`Fingerprint too long (${raw.length} chars) — model ignored word limit`)

      // Two consecutive Title-Case words (min 3 chars each = not a particle like Da/De) → retry
      const namePairs = raw.match(/[A-Z][a-z]{2,} [A-Z][a-z]{2,}/g) ?? []
      if (namePairs.length > 0) {
        detectedNames.push(...namePairs)
        throw new Error(`Fingerprint contains suspected character name(s): ${namePairs.join(', ')} — "${raw.slice(0, 80)}"`)
      }

      // Single capitalised words (nationalities, adjectives) — warn but accept
      const singleCaps = raw.match(/(?<=[a-z,\s])[A-Z][a-z]{2,}/g) ?? []
      if (singleCaps.length > 0) {
        logger.warn(`[enrich] fingerprint has capitalised words (likely nationalities): ${singleCaps.join(', ')}`)
      }

      logger.info(`[enrich] fingerprint complete (attempt ${attempt}) model=${model}`)
      return raw
    } catch (err) {
      logger.warn(`[enrich] fingerprint attempt ${attempt} failed: ${err.message}`)
      if (attempt === 2) throw err
    }
  }
}

// ------------------------------------------------------------------------------
// Fallback fingerprint — built from stored sentiment when generateFingerprint fails
// ------------------------------------------------------------------------------
export function buildFallbackFingerprint(book) {
  const parts = [
    ...(book.sentiment?.tone    ?? []).slice(0, 2),
    ...(book.sentiment?.mood    ?? []).slice(0, 2),
    book.sentiment?.pace        ?? '',
    ...(book.genres             ?? []).slice(0, 2),
  ].map(s => String(s).trim()).filter(Boolean)

  return parts.join(', ')
}

// ------------------------------------------------------------------------------
// Legacy: return top candidates for manual disambiguation (used by /enrich/author)
// ------------------------------------------------------------------------------
export async function enrichAuthor(name) {
  const docs = await fetchOLAuthor(name)
  if (!docs.length) return null

  return docs.slice(0, 3).map((doc) => ({
    name: doc.name ?? name,
    olKey: doc.key ?? null,
    birthYear: parseYear(doc.birth_date),
    deathYear: parseYear(doc.death_date),
    topSubjects: doc.top_subjects?.slice(0, 8) ?? [],
    workCount: doc.work_count ?? 0,
    photoUrl: doc.key
      ? `https://covers.openlibrary.org/a/olid/${doc.key}-M.jpg`
      : '',
    sources: { openLibrary: { authorKey: doc.key ?? null } },
  }))
}
