import couchbase from 'couchbase'
import { getCluster, getScope } from '../config/couchbase.js'
import { bookId } from '../utils/idGenerator.js'
import { NotFoundError, ValidationError } from '../utils/errors.js'
import { logger } from '../config/logger.js'
import { downloadAndStoreCover } from './coverService.js'

const BUCKET = process.env.COUCHBASE_BUCKET || 'library'
const SCOPE_NAME = process.env.COUCHBASE_SCOPE || 'library_scope'
const COLL = 'books'
const KS = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`${COLL}\``

const ORDER_MAP = {
  addedAt: 'b.addedAt DESC',
  title: 'b.title ASC',
  rating: 'b.rating DESC',
  publishedYear: 'b.publishedYear DESC',
}

const READ_STATUSES = new Set([
  'want-to-read', 'reading', 'read', 'did-not-finish',
  // legacy aliases — accepted on input, stored as-is for badge backwards compat
  'to-read', 'finished', 'abandoned',
])

// When filtering, expand canonical status to include legacy aliases
const STATUS_FILTER_ALIASES = {
  'want-to-read':   ['to-read'],
  'read':           ['finished'],
  'did-not-finish': ['abandoned'],
}

function col() {
  return getScope().collection(COLL)
}

async function kvGet(id) {
  try {
    return await col().get(id)
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) throw new NotFoundError('Book', id)
    throw err
  }
}

// ------------------------------------------------------------------------------
// List + filter
// ------------------------------------------------------------------------------
export async function listBooks({ genre, status, owned, author, series, sort, page = 1, limit = 20 }) {
  const limitN = Math.min(parseInt(limit) || 20, 100)
  const offsetN = (Math.max(parseInt(page) || 1, 1) - 1) * limitN
  const orderBy = ORDER_MAP[sort] || ORDER_MAP.addedAt

  const conditions = []
  const params = {}

  if (owned !== undefined && owned !== '') {
    conditions.push('b.owned = $owned')
    params.owned = owned === 'true' || owned === true
  }
  if (status && READ_STATUSES.has(status)) {
    const aliases = STATUS_FILTER_ALIASES[status] ?? []
    if (aliases.length) {
      conditions.push('b.readStatus IN $statuses')
      params.statuses = [status, ...aliases]
    } else {
      conditions.push('b.readStatus = $status')
      params.status = status
    }
  }
  if (series) {
    conditions.push('b.seriesId = $series')
    params.series = series
  }
  if (author) {
    conditions.push('ANY a IN b.authors SATISFIES a = $author END')
    params.author = author
  }
  if (genre) {
    conditions.push('ANY g IN b.genres SATISFIES g = $genre END')
    params.genre = genre
  }

  const where = conditions.length ? conditions.join(' AND ') : '1=1'
  // LIMIT/OFFSET are validated integers — safe to inline
  const dataStmt = `SELECT b.* FROM ${KS} b WHERE ${where} ORDER BY ${orderBy} LIMIT ${limitN} OFFSET ${offsetN}`
  const countStmt = `SELECT COUNT(*) AS total FROM ${KS} b WHERE ${where}`
  const opts = Object.keys(params).length ? { parameters: params } : {}

  const [dataRes, countRes] = await Promise.all([
    getCluster().query(dataStmt, opts),
    getCluster().query(countStmt, opts),
  ])

  const total = countRes.rows[0]?.total ?? 0
  return {
    books: dataRes.rows,
    total,
    page: Math.max(parseInt(page) || 1, 1),
    limit: limitN,
    pages: Math.ceil(total / limitN),
  }
}

// ------------------------------------------------------------------------------
// Single-document operations (KV)
// ------------------------------------------------------------------------------
export async function getBook(id) {
  const result = await kvGet(id)
  return result.content
}

export async function createBook(data) {
  const id = bookId()
  const now = new Date().toISOString()
  const doc = {
    id,
    type: 'book',
    isbn: data.isbn ?? '',
    isbn13: data.isbn13 ?? '',
    title: data.title,
    subtitle: data.subtitle ?? '',
    seriesId: data.seriesId ?? null,
    seriesOrder: data.seriesOrder ?? null,
    authors: data.authors ?? [],
    genres: data.genres ?? [],
    tags: data.tags ?? [],
    language: data.language ?? '',
    publishedYear: data.publishedYear ?? null,
    pageCount: data.pageCount ?? null,
    coverUrl: data.coverUrl ?? '',
    description: data.description ?? '',
    owned: data.owned ?? false,
    readStatus: READ_STATUSES.has(data.readStatus) ? data.readStatus : 'want-to-read',
    finishedAt: null,
    progress: null,
    rating: data.rating ?? null,
    addedAt: now,
    updatedAt: now,
    notes: data.notes ?? '',
    embedding: null,
  }
  await col().insert(id, doc)
  logger.info('[books] created', { id })

  // Fire-and-forget: download cover and swap coverUrl to local path
  if (doc.coverUrl?.startsWith('http')) {
    downloadAndStoreCover(id, doc.coverUrl)
      .then(localUrl => {
        if (localUrl) {
          col().mutateIn(id, [couchbase.MutateInSpec.upsert('coverUrl', localUrl)]).catch(() => {})
        }
      })
      .catch(() => {})
  }

  return doc
}

export async function updateBook(id, data) {
  const existing = await kvGet(id)
  // Strip immutable fields from caller-supplied data
  const { id: _id, type: _type, addedAt: _addedAt, embedding: _emb, ...updates } = data
  const updated = {
    ...existing.content,
    ...updates,
    id,
    type: 'book',
    addedAt: existing.content.addedAt,
    embedding: existing.content.embedding,
    // Normalise readStatus if provided
    readStatus: updates.readStatus && READ_STATUSES.has(updates.readStatus)
      ? updates.readStatus
      : existing.content.readStatus,
  }
  updated.updatedAt = new Date().toISOString()
  await col().replace(id, updated)
  logger.info('[books] updated', { id })

  // If caller supplied a new external cover URL, download it in the background
  if (updates.coverUrl?.startsWith('http')) {
    downloadAndStoreCover(id, updates.coverUrl)
      .then(localUrl => {
        if (localUrl) {
          col().mutateIn(id, [couchbase.MutateInSpec.upsert('coverUrl', localUrl)]).catch(() => {})
        }
      })
      .catch(() => {})
  }

  return updated
}

export async function deleteBook(id) {
  try {
    await col().remove(id)
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) throw new NotFoundError('Book', id)
    throw err
  }
  logger.info('[books] deleted', { id })
}

// Targeted status patch — avoids fetching + replacing the whole doc (skips embedding round-trip)
export async function updateBookStatus(id, { readStatus, progress, rating }) {
  const specs = []

  if (readStatus !== undefined) {
    if (!READ_STATUSES.has(readStatus)) throw new ValidationError(`Invalid readStatus: ${readStatus}`)
    specs.push(couchbase.MutateInSpec.upsert('readStatus', readStatus))
    // Record when a book is finished; clear if moved back to an unfinished state
    specs.push(couchbase.MutateInSpec.upsert('finishedAt',
      readStatus === 'read' ? new Date().toISOString() : null
    ))
    specs.push(couchbase.MutateInSpec.upsert('updatedAt', new Date().toISOString()))
  }
  if (progress !== undefined) {
    specs.push(couchbase.MutateInSpec.upsert('progress', Math.min(Math.max(parseInt(progress) || 0, 0), 100)))
  }
  if (rating !== undefined) {
    if (rating === null) {
      specs.push(couchbase.MutateInSpec.upsert('rating', null))
    } else {
      const r = parseInt(rating)
      if (!Number.isNaN(r)) {
        specs.push(couchbase.MutateInSpec.upsert('rating', Math.min(Math.max(r, 1), 5)))
      }
    }
  }

  if (!specs.length) return getBook(id)

  try {
    await col().mutateIn(id, specs)
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) throw new NotFoundError('Book', id)
    throw err
  }

  return getBook(id)
}
