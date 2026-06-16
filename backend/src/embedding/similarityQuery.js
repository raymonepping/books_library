import couchbase from 'couchbase'
import { getScope, getCluster } from '../config/couchbase.js'
import { logger }               from '../config/logger.js'
import { embed }                from './embed.js'

const INDEX_NAME = 'bibliotheek-vector-index'

// ── kNN search ────────────────────────────────────────────────────────────────

async function vectorSearch(queryVector, topK) {
  const cluster = getCluster()
  const request = couchbase.SearchRequest.create(
    couchbase.VectorSearch.fromVectorQuery(
      couchbase.VectorQuery.create('embedding', queryVector)
        .numCandidates(topK * 10)
    )
  )
  const result = await cluster.search(INDEX_NAME, request, {
    limit: topK * 4,
  })
  return result.rows ?? []
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function findSimilarBooks(bookId, topK = 5) {
  const scope = getScope()

  let sourceVec
  try {
    const doc = await scope.collection('books').get(bookId)
    sourceVec = doc.content.embedding
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) {
      return { bookId, results: [], reason: 'no-embedding' }
    }
    throw err
  }

  if (!sourceVec?.length) return { bookId, results: [], reason: 'no-embedding' }

  const rows = await vectorSearch(sourceVec, topK)

  const bookRows = rows
    .filter(r => r.id.startsWith('book::') && r.id !== bookId)
    .slice(0, topK)

  const results = await Promise.all(
    bookRows.map(async row => {
      try {
        const doc = await scope.collection('books').get(row.id)
        const b   = doc.content
        return {
          bookId:     row.id,
          score:      Math.round(row.score * 1000) / 1000,
          title:      b.title ?? '',
          author:     b.authors?.[0]?.name ?? '',
          coverUrl:   b.coverUrl ?? '',
          readStatus: b.readStatus ?? null,
          rating:     b.rating ?? null,
        }
      } catch {
        return { bookId: row.id, score: Math.round(row.score * 1000) / 1000, title: '', author: '' }
      }
    })
  )

  logger.info('[similarity] findSimilarBooks', { bookId, count: results.length })
  return { bookId, results }
}

export async function findSimilarAuthors(authorId, topK = 5) {
  const scope = getScope()

  let sourceVec
  try {
    const doc = await scope.collection('authors').get(authorId)
    sourceVec = doc.content.embedding
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) {
      return { authorId, results: [], reason: 'no-embedding' }
    }
    throw err
  }

  if (!sourceVec?.length) return { authorId, results: [], reason: 'no-embedding' }

  const rows = await vectorSearch(sourceVec, topK)

  const authorRows = rows
    .filter(r => r.id.startsWith('author::') && r.id !== authorId)
    .slice(0, topK)

  const results = await Promise.all(
    authorRows.map(async row => {
      try {
        const authorDoc = await scope.collection('authors').get(row.id)
        const a = authorDoc.content
        const p = a.profile ?? {}
        return {
          authorId:    row.id,
          score:       Math.round(row.score * 1000) / 1000,
          name:        a.name ?? '',
          nationality: p.nationality ?? a.nationality ?? null,
          subgenre:    p.subgenre ?? null,
          photoUrl:    a.photoUrl ?? '',
        }
      } catch {
        return { authorId: row.id, score: Math.round(row.score * 1000) / 1000, name: '' }
      }
    })
  )

  logger.info('[similarity] findSimilarAuthors', { authorId, count: results.length })
  return { authorId, results }
}

export async function findSimilarToQuery(queryText, refType = 'book', topK = 5) {
  let queryVec
  try {
    queryVec = await embed(queryText)
  } catch (err) {
    throw new Error(`[similarity] failed to embed query: ${err.message}`)
  }

  const rows = await vectorSearch(queryVec, topK)
  const prefix = `${refType}::`

  const filtered = rows
    .filter(r => r.id.startsWith(prefix))
    .slice(0, topK)

  const scope = getScope()
  const results = await Promise.all(
    filtered.map(async row => {
      try {
        if (refType === 'book') {
          const doc = await scope.collection('books').get(row.id)
          const b   = doc.content
          return { id: row.id, score: Math.round(row.score * 1000) / 1000, title: b.title ?? '', author: b.authors?.[0]?.name ?? '' }
        } else {
          const doc = await scope.collection('authors').get(row.id)
          const a   = doc.content
          return { id: row.id, score: Math.round(row.score * 1000) / 1000, name: a.name ?? '' }
        }
      } catch {
        return { id: row.id, score: Math.round(row.score * 1000) / 1000 }
      }
    })
  )

  logger.info('[similarity] findSimilarToQuery', { refType, count: results.length })
  return { query: queryText, refType, results }
}
