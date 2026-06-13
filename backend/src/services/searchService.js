import couchbase from 'couchbase'
import { getCluster, getScope } from '../config/couchbase.js'
import { logger } from '../config/logger.js'

// Append ~1 fuzzy to plain terms >= 4 chars so ASCII input finds Nordic-char variants
// e.g. "nesbo" matches "Nesbø", "larsson" still matches "larsson" exactly (exact scores higher)
function buildFuzzyQuery(q) {
  const SPECIAL = /[~^"*?:()\[\]{}]/
  return q.trim().split(/\s+/).map(term =>
    term.length >= 4 && !SPECIAL.test(term) ? `${term}~1` : term
  ).join(' ')
}

async function ftsSearch(indexName, q, { limit, skip }) {
  try {
    const result = await getCluster().searchQuery(
      indexName,
      couchbase.SearchQuery.queryString(buildFuzzyQuery(q)),
      { limit, skip }
    )
    const total = result.meta?.metrics?.totalRows
      ?? result.meta?.metrics?.totalHits
      ?? result.rows.length
    return { rows: result.rows, total }
  } catch (err) {
    logger.error('[search] FTS query failed', { indexName, q, err: err.message })
    return { rows: [], total: 0 }
  }
}

async function hydrateHits(rows, collectionName, type) {
  if (!rows.length) return []
  const col = getScope().collection(collectionName)
  const hits = await Promise.all(
    rows.map(async (row) => {
      try {
        const doc = await col.get(row.id)
        return {
          type,
          score: Math.round(row.score * 1000) / 1000,
          ...doc.content,
        }
      } catch {
        // Doc deleted between FTS index refresh and now — skip it
        return null
      }
    })
  )
  return hits.filter(Boolean)
}

export async function search({ q, type, page = 1, limit = 20 }) {
  const limitN = Math.min(parseInt(limit) || 20, 50)
  const pageN = Math.max(parseInt(page) || 1, 1)

  const doBooks = !type || type === 'books'
  const doAuthors = !type || type === 'authors'

  // skip only applies to single-type queries; combined searches always start at 0
  // because merging paginated results from two independent indexes isn't deterministic
  const skip = type ? (pageN - 1) * limitN : 0

  const [booksResult, authorsResult] = await Promise.all([
    doBooks ? ftsSearch('books_fts', q, { limit: limitN, skip }) : Promise.resolve({ rows: [], total: 0 }),
    doAuthors ? ftsSearch('authors_fts', q, { limit: limitN, skip }) : Promise.resolve({ rows: [], total: 0 }),
  ])

  const [books, authors] = await Promise.all([
    hydrateHits(booksResult.rows, 'books', 'book'),
    hydrateHits(authorsResult.rows, 'authors', 'author'),
  ])

  const hits = [...books, ...authors].sort((a, b) => b.score - a.score)

  return {
    query: q,
    type: type || 'all',
    total: booksResult.total + authorsResult.total,
    hits,
    page: pageN,
    limit: limitN,
  }
}
