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
// Public: enrich author by name
// ------------------------------------------------------------------------------
export async function enrichAuthor(name) {
  const docs = await fetchOLAuthor(name)
  if (!docs.length) return null

  // Return top 3 candidates so the client can pick the right one
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
