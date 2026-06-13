import axios from 'axios'
import couchbase from 'couchbase'
import { getScope, getCluster } from '../config/couchbase.js'
import { logger } from '../config/logger.js'
import { URL } from 'url'
import dns from 'dns/promises'
import net from 'net'

const BUCKET = process.env.COUCHBASE_BUCKET || 'library'
const SCOPE_NAME = process.env.COUCHBASE_SCOPE || 'library_scope'
const KS_BOOKS = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`books\``
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

// RFC-1918 + loopback + link-local ranges — never fetch from these
const PRIVATE_CIDRS = [
  [0x7f000000, 0xff000000],   // 127.0.0.0/8   loopback
  [0x0a000000, 0xff000000],   // 10.0.0.0/8
  [0xac100000, 0xfff00000],   // 172.16.0.0/12
  [0xc0a80000, 0xffff0000],   // 192.168.0.0/16
  [0xa9fe0000, 0xffff0000],   // 169.254.0.0/16 link-local
  [0x00000000, 0xff000000],   // 0.0.0.0/8
]

function isPrivateIp(ip) {
  if (!net.isIPv4(ip)) return true // block IPv6 — not needed for cover images
  const n = ip.split('.').reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0
  return PRIVATE_CIDRS.some(([base, mask]) => (n & mask) === (base & mask))
}

async function isSafeUrl(rawUrl) {
  let parsed
  try { parsed = new URL(rawUrl) } catch { return false }
  if (parsed.protocol !== 'https:') return false

  const addresses = await dns.resolve4(parsed.hostname).catch(() => [])
  if (!addresses.length) return false
  if (addresses.some(isPrivateIp)) return false
  return true
}

function col() {
  return getScope().collection('covers')
}

function booksCol() {
  return getScope().collection('books')
}

// Download an image URL and store it in the covers collection.
// Returns the local /api/covers/:bookId path on success, null on failure.
export async function downloadAndStoreCover(bookId, url) {
  if (!url || !url.startsWith('https://')) return null

  if (!await isSafeUrl(url)) {
    logger.warn('[covers] blocked unsafe URL', { bookId, url })
    return null
  }

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
