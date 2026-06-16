import couchbase from 'couchbase'
import { Router } from 'express'
import { getCluster, getScope } from '../config/couchbase.js'
import { logger } from '../config/logger.js'
import { config } from '../config/env.js'
import { buildBookText, buildAuthorText, getEmbedding, persistEmbedding } from '../services/embeddingService.js'
import { enrichAuthorByName } from '../services/enrichService.js'
import { downloadAndStoreCover } from '../services/coverService.js'
import { runEnrichment } from '../embedding/enrichWorker.js'

const router = Router()

const BUCKET = config.COUCHBASE_BUCKET
const SCOPE  = config.COUCHBASE_SCOPE
const KS_BOOKS   = `\`${BUCKET}\`.\`${SCOPE}\`.\`books\``
const KS_AUTHORS = `\`${BUCKET}\`.\`${SCOPE}\`.\`authors\``

async function backfillCollection({ query, buildText, collectionName }) {
  const result = await getCluster().query(query)
  const docs = result.rows ?? []

  let processed = 0
  let errors = 0

  // Process in batches of 5 to avoid overwhelming Ollama
  for (let i = 0; i < docs.length; i += 5) {
    const batch = docs.slice(i, i + 5)
    await Promise.allSettled(
      batch.map(async doc => {
        const text = buildText(doc)
        if (!text) return
        try {
          const vec = await getEmbedding(text)
          if (vec) {
            await persistEmbedding(collectionName, doc.id, vec)
            processed++
          }
        } catch (err) {
          logger.warn(`[admin/backfill] error on ${collectionName}/${doc.id}`, { err: err.message })
          errors++
        }
      })
    )
  }

  return { total: docs.length, processed, errors }
}

// POST /api/admin/backfill-embeddings?type=books|authors|all
router.post('/backfill-embeddings', async (req, res, next) => {
  const type = req.query.type ?? 'all'

  try {
    const results = {}

    if (type === 'books' || type === 'all') {
      results.books = await backfillCollection({
        query: `SELECT META(b).id AS id, b.title, b.subtitle, b.authors, b.genres, b.description
                FROM ${KS_BOOKS} b WHERE b.embedding IS NULL OR b.embedding IS MISSING`,
        buildText: buildBookText,
        collectionName: 'books',
      })
      logger.info('[admin/backfill] books done', results.books)
    }

    if (type === 'authors' || type === 'all') {
      results.authors = await backfillCollection({
        query: `SELECT META(a).id AS id, a.name, a.nationality, a.bio
                FROM ${KS_AUTHORS} a WHERE a.embedding IS NULL OR a.embedding IS MISSING`,
        buildText: buildAuthorText,
        collectionName: 'authors',
      })
      logger.info('[admin/backfill] authors done', results.authors)
    }

    res.json({ success: true, data: results })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/enrich-authors
// Fetches bio, birth year, and photo from OpenLibrary for every author stub
// that is still missing at least one of those fields.
// After updating metadata it re-generates the embedding so vectors improve.
router.post('/enrich-authors', async (req, res, next) => {
  try {
    const result = await getCluster().query(
      `SELECT META(a).id AS id, a.name, a.bio, a.photoUrl, a.birthYear, a.nationality
       FROM ${KS_AUTHORS} a
       WHERE (a.bio IS MISSING OR a.bio = '')
          OR (a.photoUrl IS MISSING OR a.photoUrl = '')
          OR a.photoUrl LIKE 'http%'`
    )
    const authors = result.rows ?? []
    let processed = 0, skipped = 0, errors = 0

    // Batch 3 at a time — each makes 2 OL HTTP calls + a photo download
    for (let i = 0; i < authors.length; i += 3) {
      const batch = authors.slice(i, i + 3)
      await Promise.allSettled(batch.map(async (a) => {
        try {
          const enriched = await enrichAuthorByName(a.name)
          if (!enriched) { skipped++; return }

          const specs = []

          if ((!a.bio || a.bio === '') && enriched.bio) {
            specs.push(couchbase.MutateInSpec.upsert('bio', enriched.bio))
          }
          if (!a.birthYear && enriched.birthYear) {
            specs.push(couchbase.MutateInSpec.upsert('birthYear', enriched.birthYear))
          }

          // Download photo and store locally; fall back to external URL if download fails
          if (enriched.photoUrl && (!a.photoUrl || a.photoUrl === '' || a.photoUrl.startsWith('http'))) {
            const localUrl = await downloadAndStoreCover(a.id, enriched.photoUrl)
            specs.push(couchbase.MutateInSpec.upsert('photoUrl', localUrl ?? enriched.photoUrl))
          }

          if (specs.length === 0) { skipped++; return }

          await getScope().collection('authors').mutateIn(a.id, specs)

          // Re-enrich with System B (full 12-field profile embedding, not basic 3-field)
          await runEnrichment({ authorId: a.id, force: true })

          processed++
          logger.info('[admin/enrich-authors] enriched', { id: a.id, name: a.name })
        } catch (err) {
          logger.warn('[admin/enrich-authors] error', { id: a.id, name: a.name, err: err.message })
          errors++
        }
      }))
    }

    res.json({ success: true, data: { total: authors.length, processed, skipped, errors } })
  } catch (err) {
    next(err)
  }
})

export default router
