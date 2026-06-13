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

// GET /api/dashboard/charts — time-series + distribution data for chart panels
router.get('/charts', async (req, res) => {
  const cluster = getCluster()
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 11)
  cutoff.setDate(1)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const [monthlyResult, ratingResult] = await Promise.all([
    // Books finished + pages read per month (last 12 months)
    cluster.query(`
      SELECT
        SUBSTR(b.finishedAt, 0, 7) AS month,
        COUNT(1)                    AS booksRead,
        SUM(NVL(b.pageCount, 0))   AS pagesRead
      FROM ${KS} AS b
      WHERE (b.readStatus = 'read' OR b.readStatus = 'finished')
        AND b.finishedAt IS NOT NULL
        AND b.finishedAt >= "${cutoffStr}"
      GROUP BY SUBSTR(b.finishedAt, 0, 7)
      ORDER BY month
    `),

    // Rating distribution 1–5
    cluster.query(`
      SELECT b.rating, COUNT(1) AS count
      FROM ${KS} AS b
      WHERE b.rating IS NOT NULL AND b.rating IS NOT MISSING
        AND b.rating >= 1 AND b.rating <= 5
      GROUP BY b.rating
      ORDER BY b.rating
    `),
  ])

  // Fill in any missing months so the chart always shows 12 bars
  const monthlyMap = new Map(monthlyResult.rows.map(r => [r.month, r]))
  const monthly = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const row = monthlyMap.get(key) ?? { month: key, booksRead: 0, pagesRead: 0 }
    monthly.push({ ...row, label: d.toLocaleString('default', { month: 'short' }) })
  }

  // Fill in missing star ratings
  const ratingMap = new Map(ratingResult.rows.map(r => [r.rating, r.count]))
  const ratings = [1, 2, 3, 4, 5].map(star => ({
    star,
    count: ratingMap.get(star) ?? 0,
    label: '★'.repeat(star),
  }))

  res.json({ success: true, data: { monthly, ratings } })
})

export default router
