import couchbase from 'couchbase'
import { getCluster, getScope } from '../config/couchbase.js'
import { bookId } from '../utils/idGenerator.js'
import { NotFoundError, ValidationError } from '../utils/errors.js'
import { logger } from '../config/logger.js'
import { analyseDescription } from './enrichService.js'
import { downloadAndStoreCover } from './coverService.js'
import { ensureAuthors } from './authorService.js'
import { buildBookText, getEmbedding, persistEmbedding } from './embeddingService.js'
import { runBookEnrichment } from '../embedding/enrichWorker.js'
import { recalculateProfile } from './profileService.js'
import { invalidateSeriesVector } from './seriesService.js'

function scheduleBookEmbedding(id, doc) {
  // Don't overwrite a rich System B embedding with a basic System A one
  if (doc.embeddingSource === 'enriched') return
  const text = buildBookText(doc)
  if (!text) return
  getEmbedding(text)
    .then(vec => {
      if (vec) return persistEmbedding('books', id, vec)
      logger.warn('[books] embedding returned null — Ollama unavailable?', { id })
    })
    .catch(err => logger.warn('[books] scheduleBookEmbedding failed', { id, err: err.message }))
}

async function runDescriptionAnalysis(description, bookId) {
  try {
    const result = await analyseDescription(description)
    logger.info('[books] genre analysis complete', { bookId, genres: result.genres.join(', ') })
    return result
  } catch (err) {
    logger.error('[books] genre analysis failed — saving with empty genres', { bookId, err: err.message })
    return { genres: [], sentiment: null, styleFingerprint: '' }
  }
}

function scheduleBookReEnrichment(id) {
  logger.info('[books] background re-enrichment triggered', { id })
  runBookEnrichment({ bookId: id, force: true })
    .then(stats => logger.info('[books] background re-enrichment done', { id, ...stats }))
    .catch(err  => logger.warn('[books] background re-enrichment failed', { id, err: err.message }))
}

const BUCKET = process.env.COUCHBASE_BUCKET || 'library'
const SCOPE_NAME = process.env.COUCHBASE_SCOPE || 'library_scope'
const COLL = 'books'
const KS = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`${COLL}\``
const KS_SERIES = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`series\``

const ORDER_MAP = {
  addedAt:      'b.addedAt DESC',
  title:        'b.title ASC',
  rating:       'b.rating DESC',
  publishedYear:'b.publishedYear DESC',
  author:       'b.authors[0].name ASC',
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

function seriesCol() {
  return getScope().collection('series')
}

// When a book's seriesId/seriesOrder changes, keep the series document's
// books[].bookId slot in sync so the series page reflects the link.
async function syncSeriesLink(bookId, oldSeriesId, newSeriesId, seriesOrder, book) {
  // Unlink from the old series if the series changed
  if (oldSeriesId && oldSeriesId !== newSeriesId) {
    try {
      const doc = await seriesCol().get(oldSeriesId)
      const books = doc.content.books ?? []
      const idx = books.findIndex(b => b.bookId === bookId)
      if (idx !== -1) {
        books[idx] = { ...books[idx], bookId: null }
        await seriesCol().replace(oldSeriesId, { ...doc.content, books })
        logger.info('[books] unlinked from old series', { bookId, oldSeriesId })
      }
    } catch (err) {
      if (!(err instanceof couchbase.DocumentNotFoundError)) {
        logger.warn('[books] failed to unlink from old series', { bookId, oldSeriesId, err: err.message })
      }
    }
  }

  // Link into the new series at the matching seriesOrder slot
  if (newSeriesId && seriesOrder != null) {
    try {
      const doc = await seriesCol().get(newSeriesId)
      const books = doc.content.books ?? []
      const idx = books.findIndex(b => b.seriesOrder === Number(seriesOrder))
      if (idx !== -1) {
        books[idx] = {
          ...books[idx],
          bookId,
          owned:         Boolean(book.owned),
          title:         book.title         || books[idx].title         || '',
          originalTitle: book.originalTitle || books[idx].originalTitle || '',
          altTitles:     book.altTitles?.length ? book.altTitles : (books[idx].altTitles ?? []),
          isbn:          book.isbn13 || book.isbn || books[idx].isbn    || '',
          publishedYear: book.publishedYear  ?? books[idx].publishedYear ?? null,
          coverUrl:      book.coverUrl       || books[idx].coverUrl,
        }
        // Populate series.authorId from the book's first author if not yet set
        const seriesDoc = { ...doc.content, books }
        if (!seriesDoc.authorId) {
          const firstAuthorId = book.authors?.[0]?.id ?? null
          if (firstAuthorId) seriesDoc.authorId = firstAuthorId
        }
        await seriesCol().replace(newSeriesId, seriesDoc)
        logger.info('[books] linked into series', { bookId, newSeriesId, seriesOrder })
      } else {
        logger.warn('[books] no slot found for seriesOrder — series may need that entry added manually', { bookId, newSeriesId, seriesOrder })
      }
    } catch (err) {
      if (!(err instanceof couchbase.DocumentNotFoundError)) {
        logger.warn('[books] failed to link into new series', { bookId, newSeriesId, err: err.message })
      }
    }
  }
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
    conditions.push(`b.seriesId IN (SELECT RAW META(s).id FROM ${KS_SERIES} s WHERE LOWER(s.name) LIKE $seriesPattern)`)
    params.seriesPattern = `%${series.toLowerCase()}%`
  }
  if (author) {
    conditions.push('ANY a IN b.authors SATISFIES LOWER(a.name) LIKE $authorPattern END')
    params.authorPattern = `%${author.toLowerCase()}%`
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
  const authorObjs = await ensureAuthors(data.authors ?? [])
  const doc = {
    id,
    type: 'book',
    isbn: data.isbn ?? '',
    isbn13: data.isbn13 ?? '',
    title: data.title,
    subtitle: data.subtitle ?? '',
    seriesId: data.seriesId ?? null,
    seriesOrder: data.seriesOrder ?? null,
    authors: authorObjs,
    genres: data.genres ?? [],
    sentiment: null,
    styleFingerprint: '',
    tags: data.tags ?? [],
    language: data.language ?? '',
    publishedYear: data.publishedYear ?? null,
    pageCount: data.pageCount ?? null,
    coverUrl: data.coverUrl ?? '',
    description: data.description ?? '',
    owned:  data.owned  ?? false,
    wanted: data.wanted ?? false,
    readStatus: READ_STATUSES.has(data.readStatus) ? data.readStatus : 'want-to-read',
    finishedAt: null,
    progress: null,
    rating: data.rating ?? null,
    addedAt: now,
    updatedAt: now,
    notes: data.notes ?? '',
    embedding: null,
  }
  if (doc.description?.trim()) {
    const analysis = await runDescriptionAnalysis(doc.description, id)
    doc.genres           = analysis.genres
    doc.sentiment        = analysis.sentiment
    doc.styleFingerprint = analysis.styleFingerprint
  }

  await col().insert(id, doc)
  logger.info('[books] created', { id })

  scheduleBookEmbedding(id, doc)
  
  // Trigger profile recalculation if book is part of a series
  if (doc.seriesId) {
    recalculateProfile({ trigger: 'book_change' }).catch(err =>
      logger.warn('[books] background profile recalculation failed', { err: err.message })
    )
    // Invalidate series vector cache
    invalidateSeriesVector(doc.seriesId)
  }

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
  const { id: _id, type: _type, addedAt: _addedAt, embedding: _emb,
          embeddingSource: _embSrc, embeddingModel: _embModel, embeddedAt: _embAt,
          ...updates } = data
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
    // Normalize authors to [{id, name}] objects if caller sent strings
    authors: updates.authors !== undefined
      ? await ensureAuthors(updates.authors)
      : existing.content.authors,
  }
  updated.updatedAt = new Date().toISOString()

  const oldDesc = existing.content.description?.trim() ?? ''
  const newDesc = updated.description?.trim() ?? ''
  if (updates.description !== undefined && newDesc && newDesc !== oldDesc) {
    const analysis = await runDescriptionAnalysis(newDesc, id)
    updated.genres           = analysis.genres
    updated.sentiment        = analysis.sentiment
    updated.styleFingerprint = analysis.styleFingerprint
  }

  await col().replace(id, updated)
  logger.info('[books] updated', { id })
  
  // Trigger profile recalculation if rating or readStatus changed, or if book has seriesId
  const PROFILE_TRIGGER_FIELDS = ['rating', 'readStatus']
  if (updated.seriesId && PROFILE_TRIGGER_FIELDS.some(f => updates[f] !== undefined)) {
    recalculateProfile({ trigger: 'book_change' }).catch(err =>
      logger.warn('[books] background profile recalculation failed', { err: err.message })
    )
  }
  
  // Invalidate series vector cache if book changed series or if semantic fields changed
  const oldSeriesId = existing.content.seriesId
  const newSeriesId = updated.seriesId
  const SEMANTIC_FIELDS_FOR_EMBEDDING = ['title', 'subtitle', 'authors', 'genres', 'description', 'language']
  const SEMANTIC_FIELDS_FOR_CACHE = [...SEMANTIC_FIELDS_FOR_EMBEDDING, 'rating', 'readStatus']
  const semanticChanged = SEMANTIC_FIELDS_FOR_CACHE.some(f => updates[f] !== undefined)
  
  if (oldSeriesId && (oldSeriesId !== newSeriesId || semanticChanged)) {
    invalidateSeriesVector(oldSeriesId)
  }
  if (newSeriesId && (oldSeriesId !== newSeriesId || semanticChanged)) {
    invalidateSeriesVector(newSeriesId)
  }

  // Regenerate embedding if any semantic field changed
  if (SEMANTIC_FIELDS_FOR_EMBEDDING.some(f => updates[f] !== undefined)) {
    if (updated.embeddingSource === 'enriched') {
      // Book has a System B vector — re-enrich with the full pipeline so the
      // 14-field embed text stays current after the edit.
      scheduleBookReEnrichment(id)
    } else {
      scheduleBookEmbedding(id, updated)
    }
  }

  // Sync series link when seriesId or seriesOrder changed
  if (updates.seriesId !== undefined || updates.seriesOrder !== undefined) {
    syncSeriesLink(
      id,
      existing.content.seriesId ?? null,
      updated.seriesId ?? null,
      updated.seriesOrder ?? null,
      updated,
    ).catch(err => logger.warn('[books] series sync failed', { id, err: err.message }))
  }

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
  // Get book before deleting to check if it has seriesId
  let hadSeriesId = null
  try {
    const existing = await kvGet(id)
    hadSeriesId = existing.content.seriesId ?? null
  } catch (err) {
    // Book doesn't exist, will throw below
  }
  
  try {
    await col().remove(id)
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) throw new NotFoundError('Book', id)
    throw err
  }
  logger.info('[books] deleted', { id })
  
  // Trigger profile recalculation if deleted book was part of a series
  if (hadSeriesId) {
    recalculateProfile({ trigger: 'book_change' }).catch(err =>
      logger.warn('[books] background profile recalculation failed', { err: err.message })
    )
    // Invalidate series vector cache
    invalidateSeriesVector(hadSeriesId)
  }
}

// Manual re-analyse — called by POST /api/books/:id/analyse
export async function analyseBook(id) {
  const existing = await kvGet(id)
  const description = existing.content.description?.trim()
  if (!description) throw new ValidationError('Book has no description to analyse')
  const analysis = await analyseDescription(description)
  await col().mutateIn(id, [
    couchbase.MutateInSpec.upsert('genres',           analysis.genres),
    couchbase.MutateInSpec.upsert('sentiment',        analysis.sentiment),
    couchbase.MutateInSpec.upsert('styleFingerprint', analysis.styleFingerprint),
    couchbase.MutateInSpec.upsert('updatedAt',        new Date().toISOString()),
  ])
  logger.info('[books] re-analysed', { id, genres: analysis.genres.join(', ') })
  return getBook(id)
}

// Targeted status patch — avoids fetching + replacing the whole doc (skips embedding round-trip)
export async function updateBookStatus(id, { readStatus, progress, rating }) {
  const specs = []

  if (readStatus !== undefined) {
    if (!READ_STATUSES.has(readStatus)) throw new ValidationError(`Invalid readStatus: ${readStatus}`)
    specs.push(couchbase.MutateInSpec.upsert('readStatus', readStatus))
    if (readStatus === 'read') {
      // Only stamp finishedAt if it isn't already set — preserves historical date
      // when the user re-selects "read" after temporarily switching status
      const lookup = await col().lookupIn(id, [couchbase.LookupInSpec.get('finishedAt')])
      const existingFinishedAt = lookup.content[0]?.value
      if (!existingFinishedAt) {
        specs.push(couchbase.MutateInSpec.upsert('finishedAt', new Date().toISOString()))
      }
    } else {
      specs.push(couchbase.MutateInSpec.upsert('finishedAt', null))
    }
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

// ------------------------------------------------------------------------------
// Facets — autocomplete suggestions for filter fields
// ------------------------------------------------------------------------------
export async function getBookFacets({ type, q = '' }) {
  const pattern = `%${q.toLowerCase()}%`
  const cluster = getCluster()

  if (type === 'genre') {
    const r = await cluster.query(
      `SELECT DISTINCT RAW g FROM ${KS} b UNNEST b.genres AS g
       WHERE LOWER(g) LIKE $pattern ORDER BY g LIMIT 15`,
      { parameters: { pattern } }
    )
    return r.rows.filter(Boolean)
  }

  if (type === 'author') {
    const r = await cluster.query(
      `SELECT DISTINCT RAW a.name FROM ${KS} b UNNEST b.authors AS a
       WHERE LOWER(a.name) LIKE $pattern ORDER BY a.name LIMIT 15`,
      { parameters: { pattern } }
    )
    return r.rows.filter(Boolean)
  }

  if (type === 'series') {
    const r = await cluster.query(
      `SELECT RAW s.name FROM ${KS_SERIES} s
       WHERE LOWER(s.name) LIKE $pattern ORDER BY s.name LIMIT 15`,
      { parameters: { pattern } }
    )
    return r.rows.filter(Boolean)
  }

  return []
}
