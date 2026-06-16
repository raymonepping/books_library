import { Router } from 'express'
import { getScope }           from '../config/couchbase.js'
import { logger }             from '../config/logger.js'
import { runEnrichment }      from '../embedding/enrichWorker.js'
import { findSimilarBooks, findSimilarAuthors, findSimilarToQuery } from '../embedding/similarityQuery.js'

const router = Router()

// GET /api/similarity/book/:bookId?topK=5
router.get('/book/:bookId', async (req, res, next) => {
  try {
    const topK = Math.min(parseInt(req.query.topK) || 5, 20)
    const data = await findSimilarBooks(req.params.bookId, topK)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// GET /api/similarity/author/:authorId?topK=5
router.get('/author/:authorId', async (req, res, next) => {
  try {
    const topK = Math.min(parseInt(req.query.topK) || 5, 20)
    const data = await findSimilarAuthors(req.params.authorId, topK)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// POST /api/similarity/query
// Body: { text: string, refType: 'book'|'author', topK: number }
router.post('/query', async (req, res, next) => {
  try {
    const { text, refType = 'book', topK = 5 } = req.body
    if (!text?.trim()) {
      return res.status(400).json({ success: false, error: 'text is required' })
    }
    if (!['book', 'author'].includes(refType)) {
      return res.status(400).json({ success: false, error: "refType must be 'book' or 'author'" })
    }
    const data = await findSimilarToQuery(text.trim(), refType, Math.min(parseInt(topK) || 5, 20))
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// POST /api/similarity/enrich/:authorId — trigger on-demand enrichment (non-blocking)
router.post('/enrich/:authorId', async (req, res) => {
  const { authorId } = req.params
  const force = req.query.force === 'true'

  // Fire-and-forget: do not await
  runEnrichment({ authorId, force })
    .then(stats => logger.info('[similarity/enrich] complete', { authorId, ...stats }))
    .catch(err  => logger.warn('[similarity/enrich] failed',   { authorId, err: err.message }))

  res.status(202).json({ success: true, data: { status: 'enriching', authorId } })
})

// GET /api/similarity/profile/author/:authorId
router.get('/profile/author/:authorId', async (req, res, next) => {
  try {
    const doc = await getScope().collection('authors').get(req.params.authorId)
    const profile = doc.content.profile
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' })
    }
    res.json({ success: true, data: profile })
  } catch (err) {
    if (err?.constructor?.name === 'DocumentNotFoundError') {
      return res.status(404).json({ success: false, error: 'Author not found' })
    }
    next(err)
  }
})

export default router
