import { getCluster } from '../config/couchbase.js'
import { logger } from '../config/logger.js'
import { PCA } from 'ml-pca'

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
let cache = null
let cacheAt = 0

function normalizeAxis(values) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  // Map to [-4, 4] — good scale for Three.js scene
  return values.map(v => ((v - min) / range) * 8 - 4)
}

export async function getBooksForViz() {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache

  const cluster = getCluster()

  const result = await cluster.query(
    `SELECT META(b).id AS id,
            b.title,
            b.authors,
            b.genres,
            b.coverUrl,
            b.readStatus,
            b.rating,
            b.styleFingerprint,
            b.sentiment,
            b.embedding
     FROM \`library\`.\`library_scope\`.\`books\` b
     WHERE b.type = 'book'
       AND b.embedding IS NOT MISSING
       AND ARRAY_LENGTH(b.embedding) > 0
     ORDER BY b.title`
  )

  const rows = result.rows ?? []
  if (rows.length < 3) {
    logger.warn('[vectors] not enough books with embeddings for PCA', { count: rows.length })
    return []
  }

  // Build embedding matrix (n × d)
  const matrix = rows.map(r => r.embedding)
  const dims = matrix[0].length
  logger.info(`[vectors] running PCA on ${rows.length} books × ${dims} dims`)

  const pca = new PCA(matrix)
  const projected = pca.predict(matrix, { nComponents: 3 }).to2DArray()

  // Normalize each axis independently to [-4, 4]
  const xs = projected.map(p => p[0])
  const ys = projected.map(p => p[1])
  const zs = projected.map(p => p[2])
  const normXs = normalizeAxis(xs)
  const normYs = normalizeAxis(ys)
  const normZs = normalizeAxis(zs)

  const books = rows.map((row, i) => ({
    id:               row.id,
    title:            row.title ?? '',
    authors:          row.authors ?? [],
    genres:           row.genres ?? [],
    coverUrl:         row.coverUrl ?? '',
    readStatus:       row.readStatus ?? 'unread',
    rating:           row.rating ?? null,
    styleFingerprint: row.styleFingerprint ?? '',
    sentiment:        row.sentiment ?? null,
    x: normXs[i],
    y: normYs[i],
    z: normZs[i],
  }))

  cache = books
  cacheAt = Date.now()
  logger.info(`[vectors] PCA complete — ${books.length} books projected to 3D`)
  return books
}

export function clearVectorCache() {
  cache = null
  cacheAt = 0
}
