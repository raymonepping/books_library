import axios from 'axios'
import couchbase from 'couchbase'
import { getScope, getCluster } from '../config/couchbase.js'
import { logger } from '../config/logger.js'

const BUCKET = process.env.COUCHBASE_BUCKET || 'library'
const SCOPE_NAME = process.env.COUCHBASE_SCOPE || 'library_scope'
const KS_BOOKS = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`books\``
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

function col() {
  return getScope().collection('covers')
}

function booksCol() {
  return getScope().collection('books')
}

// Download an image URL and store it in the covers collection.
// Returns the local /api/covers/:bookId path on success, null on failure.
export async function downloadAndStoreCover(bookId, url) {
  if (!url || !url.startsWith('http')) return null

  let res
  try {
    res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15_000,
      maxContentLength: MAX_BYTES,
      headers: { 'User-Agent': 'Bibliotheek/1.0' },
    })
  } catch (err) {
    logger.warn('[covers] fetch failed', { bookId, url, err: err.message })
    return null
  }

  const contentType = (res.headers['content-type'] ?? 'image/jpeg').split(';')[0].trim()
  if (!contentType.startsWith('image/')) {
    logger.warn('[covers] non-image content-type', { bookId, contentType })
    return null
  }

  const data = Buffer.from(res.data).toString('base64')

  try {
    await col().upsert(bookId, {
      type: 'cover',
      bookId,
      contentType,
      data,
      storedAt: new Date().toISOString(),
      sourceUrl: url,
    })
  } catch (err) {
    logger.warn('[covers] store failed', { bookId, err: err.message })
    return null
  }

  return `/api/covers/${bookId}`
}

// Retrieve a stored cover document.
export async function getCover(bookId) {
  const result = await col().get(bookId)
  return result.content
}

// Backfill: download + store covers for all books that still have an external coverUrl.
// Concurrency-limited to avoid hammering external sources.
export async function migrateCovers() {
  const res = await getCluster().query(
    `SELECT b.id, b.coverUrl FROM ${KS_BOOKS} b WHERE b.coverUrl LIKE 'http%'`
  )

  const books = res.rows
  let stored = 0, failed = 0

  // Process in batches of 5 to be polite to external CDNs
  for (let i = 0; i < books.length; i += 5) {
    const batch = books.slice(i, i + 5)
    await Promise.allSettled(
      batch.map(async ({ id, coverUrl }) => {
        const localUrl = await downloadAndStoreCover(id, coverUrl)
        if (localUrl) {
          try {
            await booksCol().mutateIn(id, [
              couchbase.MutateInSpec.upsert('coverUrl', localUrl),
            ])
            stored++
          } catch (err) {
            logger.warn('[covers] book mutateIn failed', { id, err: err.message })
            failed++
          }
        } else {
          failed++
        }
      })
    )
  }

  logger.info('[covers] migration complete', { total: books.length, stored, failed })
  return { total: books.length, stored, failed }
}
