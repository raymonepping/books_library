import couchbase from 'couchbase'
import { getCluster, getScope } from '../config/couchbase.js'
import { collectionId } from '../utils/idGenerator.js'
import { NotFoundError, ValidationError } from '../utils/errors.js'
import { logger } from '../config/logger.js'

const BUCKET = process.env.COUCHBASE_BUCKET || 'library'
const SCOPE_NAME = process.env.COUCHBASE_SCOPE || 'library_scope'
const KS = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`collections\``
const KS_BOOKS = `\`${BUCKET}\`.\`${SCOPE_NAME}\`.\`books\``

function col() {
  return getScope().collection('collections')
}

async function kvGet(id) {
  try {
    return await col().get(id)
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) throw new NotFoundError('Collection', id)
    throw err
  }
}

// ------------------------------------------------------------------------------
// List
// ------------------------------------------------------------------------------
export async function listCollections({ page = 1, limit = 50 } = {}) {
  const limitN = Math.min(parseInt(limit) || 50, 200)
  const offsetN = (Math.max(parseInt(page) || 1, 1) - 1) * limitN

  const [dataRes, countRes] = await Promise.all([
    getCluster().query(
      `SELECT c.*, ARRAY_COUNT(c.bookIds) AS bookCount
       FROM ${KS} c ORDER BY c.createdAt DESC LIMIT ${limitN} OFFSET ${offsetN}`
    ),
    getCluster().query(`SELECT COUNT(*) AS total FROM ${KS} c`),
  ])

  return {
    collections: dataRes.rows,
    total: countRes.rows[0]?.total ?? 0,
    page: Math.max(parseInt(page) || 1, 1),
    limit: limitN,
  }
}

// ------------------------------------------------------------------------------
// Get single — with book summaries
// ------------------------------------------------------------------------------
export async function getCollection(id) {
  const result = await kvGet(id)
  const c = result.content

  let books = []
  if (c.bookIds?.length) {
    const ids = c.bookIds.map(bid => `"${bid}"`).join(',')
    const res = await getCluster().query(
      `SELECT b.id, b.title, b.authors, b.coverUrl, b.readStatus, b.rating, b.publishedYear
       FROM ${KS_BOOKS} b USE KEYS [${ids}]`
    )
    books = res.rows
  }

  return { ...c, books }
}

// ------------------------------------------------------------------------------
// Create
// ------------------------------------------------------------------------------
export async function createCollection(data) {
  const id = collectionId()
  const now = new Date().toISOString()
  const doc = {
    id,
    type: 'collection',
    name: data.name.trim(),
    description: data.description?.trim() ?? '',
    bookIds: [],
    createdAt: now,
    updatedAt: now,
  }
  await col().insert(id, doc)
  logger.info('[collections] created', { id })
  return doc
}

// ------------------------------------------------------------------------------
// Update name / description
// ------------------------------------------------------------------------------
export async function updateCollection(id, data) {
  const existing = await kvGet(id)
  const updated = {
    ...existing.content,
    name: data.name?.trim() ?? existing.content.name,
    description: data.description?.trim() ?? existing.content.description,
    updatedAt: new Date().toISOString(),
  }
  await col().replace(id, updated)
  logger.info('[collections] updated', { id })
  return updated
}

// ------------------------------------------------------------------------------
// Delete
// ------------------------------------------------------------------------------
export async function deleteCollection(id) {
  try {
    await col().remove(id)
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) throw new NotFoundError('Collection', id)
    throw err
  }
  logger.info('[collections] deleted', { id })
}

// ------------------------------------------------------------------------------
// Toggle book membership — adds if absent, removes if present
// ------------------------------------------------------------------------------
export async function toggleBook(id, bookId) {
  const result = await kvGet(id)
  const c = result.content

  const idx = c.bookIds.indexOf(bookId)
  const added = idx === -1
  if (added) {
    c.bookIds.push(bookId)
  } else {
    c.bookIds.splice(idx, 1)
  }
  c.updatedAt = new Date().toISOString()

  await col().replace(id, c)
  logger.info('[collections] toggled book', { id, bookId, added })
  return { ...c, added }
}

// ------------------------------------------------------------------------------
// Replace book list wholesale
// ------------------------------------------------------------------------------
export async function setBooks(id, bookIds) {
  if (!Array.isArray(bookIds)) throw new ValidationError('bookIds must be an array')
  const result = await kvGet(id)
  const c = {
    ...result.content,
    bookIds: [...new Set(bookIds)],
    updatedAt: new Date().toISOString(),
  }
  await col().replace(id, c)
  logger.info('[collections] set books', { id, count: c.bookIds.length })
  return c
}
