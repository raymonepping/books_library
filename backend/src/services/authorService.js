import couchbase from 'couchbase'
import { getCluster, getScope } from '../config/couchbase.js'
import { authorId, slugify } from '../utils/idGenerator.js'
import { NotFoundError, ValidationError } from '../utils/errors.js'
import { logger } from '../config/logger.js'
import { buildAuthorText, getEmbedding, persistEmbedding } from './embeddingService.js'

function scheduleAuthorEmbedding(id, doc) {
  const text = buildAuthorText(doc)
  if (!text) return
  getEmbedding(text)
    .then(vec => vec ? persistEmbedding('authors', id, vec) : null)
    .catch(() => {})
}

const BUCKET = process.env.COUCHBASE_BUCKET || 'library'
const SCOPE_NAME = process.env.COUCHBASE_SCOPE || 'library_scope'
const KS = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`authors\``
const KS_SERIES = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`series\``

function col() {
  return getScope().collection('authors')
}

async function kvGet(id) {
  try {
    return await col().get(id)
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) throw new NotFoundError('Author', id)
    throw err
  }
}

// ------------------------------------------------------------------------------
// List
// ------------------------------------------------------------------------------
export async function listAuthors({ page = 1, limit = 20, genre, nationality, q } = {}) {
  const limitN = Math.min(parseInt(limit) || 20, 100)
  const offsetN = (Math.max(parseInt(page) || 1, 1) - 1) * limitN

  const conditions = []
  const params = {}

  if (q) {
    conditions.push('LOWER(a.name) LIKE $namePattern')
    params.namePattern = `%${q.toLowerCase()}%`
  }
  if (genre) {
    conditions.push('ANY g IN a.genres SATISFIES g = $genre END')
    params.genre = genre
  }
  if (nationality) {
    conditions.push('a.nationality = $nationality')
    params.nationality = nationality
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const opts = Object.keys(params).length ? { parameters: params } : {}

  const [dataRes, countRes] = await Promise.all([
    getCluster().query(
      `SELECT a.* FROM ${KS} a ${where} ORDER BY a.name ASC LIMIT ${limitN} OFFSET ${offsetN}`,
      opts
    ),
    getCluster().query(`SELECT COUNT(*) AS total FROM ${KS} a ${where}`, opts),
  ])

  const total = countRes.rows[0]?.total ?? 0
  return {
    authors: dataRes.rows,
    total,
    page: Math.max(parseInt(page) || 1, 1),
    limit: limitN,
    pages: Math.ceil(total / limitN),
  }
}

// ------------------------------------------------------------------------------
// Get single — enriched with series summaries
// ------------------------------------------------------------------------------
export async function getAuthor(id) {
  const result = await kvGet(id)
  const author = result.content

  // Fetch series this author belongs to (single IN-clause query, no N+1)
  let series = []
  if (author.seriesIds?.length) {
    const ids = author.seriesIds.map((s) => `"${s}"`).join(',')
    const res = await getCluster().query(
      `SELECT s.id, s.name, s.totalBooks, s.completedAt,
              ARRAY_COUNT(ARRAY b FOR b IN s.books WHEN b.owned = true END) AS ownedCount
       FROM ${KS_SERIES} s
       USE KEYS [${ids}]`
    )
    series = res.rows.map((s) => ({
      ...s,
      completionPct: s.totalBooks > 0
        ? Math.round((s.ownedCount / s.totalBooks) * 1000) / 10
        : 0,
    }))
  }

  return { ...author, series }
}

// ------------------------------------------------------------------------------
// Create
// ------------------------------------------------------------------------------
export async function createAuthor(data) {
  const slug = data.slug ?? slugify(data.name)
  const id = authorId(slug)
  const doc = {
    id,
    type: 'author',
    name: data.name,
    slug,
    bio: data.bio ?? '',
    birthYear: data.birthYear ?? null,
    nationality: data.nationality ?? '',
    photoUrl: data.photoUrl ?? '',
    website: data.website ?? '',
    genres: data.genres ?? [],
    seriesIds: data.seriesIds ?? [],
    embedding: null,
  }
  try {
    await col().insert(id, doc)
  } catch (err) {
    if (err instanceof couchbase.DocumentExistsError) {
      throw new ValidationError(`Author slug '${slug}' already exists — provide a unique slug`)
    }
    throw err
  }
  logger.info('[authors] created', { id })

  scheduleAuthorEmbedding(id, doc)

  return doc
}

// ------------------------------------------------------------------------------
// Ensure author stubs exist and return [{id, name}] for embedding in book docs.
// Accepts strings, {name} objects, or {id, name} objects — idempotent.
// ------------------------------------------------------------------------------
export async function ensureAuthors(input = []) {
  const names = input
    .map(a => (typeof a === 'string' ? a : a?.name ?? '').trim())
    .filter(Boolean)

  const results = await Promise.all(names.map(async (name) => {
    const slug = slugify(name)
    const id = authorId(slug)
    const doc = {
      id, type: 'author', name, slug,
      bio: '', birthYear: null, nationality: '',
      photoUrl: '', website: '', genres: [], seriesIds: [],
      embedding: null,
    }
    try {
      await col().insert(id, doc)
      logger.info('[authors] auto-created stub', { id, name })
      scheduleAuthorEmbedding(id, doc)
    } catch (err) {
      if (!(err instanceof couchbase.DocumentExistsError)) throw err
    }
    return { id, name }
  }))

  return results
}

// ------------------------------------------------------------------------------
// Sync: scan all books and create missing author stubs (idempotent backfill)
// ------------------------------------------------------------------------------
const KS_BOOKS = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`books\``

export async function syncAuthorsFromBooks() {
  // books.authors is now [{id, name}] — unnest and extract names
  const res = await getCluster().query(
    `SELECT DISTINCT RAW a.name FROM ${KS_BOOKS} AS b UNNEST b.authors AS a WHERE a.name IS NOT NULL`
  )
  const names = res.rows.filter(Boolean)
  await ensureAuthors(names)
  return { synced: names.length, names }
}
