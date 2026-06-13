import couchbase from 'couchbase'
import { getCluster, getScope } from '../config/couchbase.js'
import { seriesId, slugify } from '../utils/idGenerator.js'
import { NotFoundError, ValidationError } from '../utils/errors.js'
import { logger } from '../config/logger.js'

const BUCKET = process.env.COUCHBASE_BUCKET || 'library'
const SCOPE_NAME = process.env.COUCHBASE_SCOPE || 'library_scope'
const KS = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`series\``

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
  const limitN = Math.min(parseInt(limit) || 20, 100)
  const offsetN = (Math.max(parseInt(page) || 1, 1) - 1) * limitN

  const [dataRes, countRes] = await Promise.all([
    getCluster().query(
      `SELECT s.* FROM ${KS} s ORDER BY s.name ASC LIMIT ${limitN} OFFSET ${offsetN}`
    ),
    getCluster().query(`SELECT COUNT(*) AS total FROM ${KS} s`),
  ])

  const total = countRes.rows[0]?.total ?? 0
  return {
    series: dataRes.rows.map(withCompletion),
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
    books: (data.books ?? []).map((b) => ({
      seriesOrder: b.seriesOrder,
      bookId: b.bookId ?? null,
      title: b.title ?? '',
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
  return withCompletion(updated)
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
