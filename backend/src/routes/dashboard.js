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
        SUM(CASE WHEN b.readStatus IN ['read','finished']                         THEN 1 ELSE 0 END) AS readCount,
        SUM(CASE WHEN b.readStatus = 'reading'                                    THEN 1 ELSE 0 END) AS readingCount,
        SUM(CASE WHEN b.readStatus IN ['want-to-read','to-read']                  THEN 1 ELSE 0 END) AS wantToReadCount,
        SUM(CASE WHEN b.readStatus IN ['did-not-finish','abandoned']               THEN 1 ELSE 0 END) AS dnfCount,
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

// GET /api/dashboard/charts?months=3|12|all — time-series + rating distribution
router.get('/charts', async (req, res) => {
  const cluster = getCluster()

  // months param: 3, 12 (default), or 'all' (no cutoff)
  const rawMonths = req.query.months
  const allTime   = rawMonths === 'all' || rawMonths === '0'
  const numMonths = allTime ? null : Math.max(1, Math.min(120, parseInt(rawMonths) || 12))

  let cutoffStr = null
  if (!allTime) {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - (numMonths - 1))
    cutoff.setDate(1)
    cutoffStr = cutoff.toISOString().slice(0, 10)
  }

  const whereClause = cutoffStr
    ? `AND b.finishedAt >= "${cutoffStr}"`
    : ''

  const [monthlyResult, ratingResult] = await Promise.all([
    cluster.query(`
      SELECT
        SUBSTR(b.finishedAt, 0, 7) AS month,
        COUNT(1)                    AS booksRead,
        SUM(NVL(b.pageCount, 0))   AS pagesRead
      FROM ${KS} AS b
      WHERE (b.readStatus = 'read' OR b.readStatus = 'finished')
        AND b.finishedAt IS NOT NULL
        ${whereClause}
      GROUP BY SUBSTR(b.finishedAt, 0, 7)
      ORDER BY month
    `),

    cluster.query(`
      SELECT b.rating, COUNT(1) AS count
      FROM ${KS} AS b
      WHERE b.rating IS NOT NULL AND b.rating IS NOT MISSING
        AND b.rating >= 1 AND b.rating <= 5
      GROUP BY b.rating
      ORDER BY b.rating
    `),
  ])

  const monthlyMap = new Map(monthlyResult.rows.map(r => [r.month, r]))
  const monthly = []

  if (allTime) {
    // Return only months that have data, sorted
    for (const [key, row] of [...monthlyMap.entries()].sort()) {
      const d = new Date(`${key}-01`)
      monthly.push({
        ...row,
        label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      })
    }
  } else {
    // Fill missing months in the requested window
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const row = monthlyMap.get(key) ?? { month: key, booksRead: 0, pagesRead: 0 }
      monthly.push({
        ...row,
        // Include year to avoid ambiguity when the window spans >1 calendar year
        label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      })
    }
  }

  const ratingMap = new Map(ratingResult.rows.map(r => [r.rating, r.count]))
  const ratings = [1, 2, 3, 4, 5].map(star => ({
    star,
    count: ratingMap.get(star) ?? 0,
    label: '★'.repeat(star),
  }))

  res.json({ success: true, data: { monthly, ratings } })
})

export default router
