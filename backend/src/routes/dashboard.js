import { Router } from 'express'
import { getCluster } from '../config/couchbase.js'
import { config } from '../config/env.js'

const router = Router()

const KS = `\`${config.COUCHBASE_BUCKET}\`.\`${config.COUCHBASE_SCOPE}\`.\`books\``

router.get('/', async (req, res) => {
  const cluster = getCluster()

  // NOTE: 'read' is a reserved word in N1QL — use prefixed aliases throughout
  const [statusResult, genreResult] = await Promise.all([
    cluster.query(`
      SELECT
        COUNT(1)                                                          AS totalBooks,
        SUM(CASE WHEN b.readStatus = 'read'           THEN 1 ELSE 0 END) AS readCount,
        SUM(CASE WHEN b.readStatus = 'reading'        THEN 1 ELSE 0 END) AS readingCount,
        SUM(CASE WHEN b.readStatus = 'want-to-read'   THEN 1 ELSE 0 END) AS wantToReadCount,
        SUM(CASE WHEN b.readStatus = 'did-not-finish' THEN 1 ELSE 0 END) AS dnfCount,
        SUM(CASE WHEN b.rating IS NOT MISSING         THEN b.rating ELSE 0 END) AS ratingSum,
        SUM(CASE WHEN b.rating IS NOT MISSING         THEN 1 ELSE 0 END) AS ratingCount,
        SUM(CASE WHEN b.owned = TRUE                  THEN 1 ELSE 0 END) AS ownedCount,
        SUM(NVL(b.pageCount, 0))                                          AS totalPages
      FROM ${KS} AS b
    `),

    cluster.query(`
      SELECT g AS genre, COUNT(1) AS count
      FROM ${KS} AS b
      UNNEST b.genres AS g
      GROUP BY g
      ORDER BY count DESC
      LIMIT 12
    `),
  ])

  const s = statusResult.rows[0] ?? {}
  const avgRating = s.ratingCount > 0
    ? Math.round((s.ratingSum / s.ratingCount) * 10) / 10
    : null

  const year = new Date().getFullYear()
  const yearResult = await cluster.query(`
    SELECT COUNT(1) AS cnt
    FROM ${KS} AS b
    WHERE (b.readStatus = 'read' OR b.readStatus = 'finished')
      AND b.finishedAt >= "${year}-01-01T00:00:00.000Z"
  `)

  res.json({
    success: true,
    data: {
      total:        s.totalBooks      ?? 0,
      read:         s.readCount       ?? 0,
      reading:      s.readingCount    ?? 0,
      wantToRead:   s.wantToReadCount ?? 0,
      didNotFinish: s.dnfCount        ?? 0,
      avgRating,
      owned:        s.ownedCount      ?? 0,
      totalPages:   s.totalPages      ?? 0,
      readThisYear: yearResult.rows[0]?.cnt ?? 0,
      genres:       genreResult.rows,
    },
  })
})

export default router
