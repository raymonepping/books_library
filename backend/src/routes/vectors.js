import { Router } from 'express'
import { getBooksForViz, clearVectorCache } from '../services/vectorService.js'
import { logger } from '../config/logger.js'

const router = Router()

// GET /api/vectors/books
// Returns all books with PCA-reduced 3D coordinates for the explore view.
router.get('/books', async (req, res, next) => {
  try {
    const books = await getBooksForViz()
    res.json({ success: true, data: books })
  } catch (err) {
    next(err)
  }
})

// POST /api/vectors/books/refresh — bust the PCA cache (e.g. after embedding re-run)
router.post('/books/refresh', (req, res) => {
  clearVectorCache()
  logger.info('[vectors] cache cleared by refresh request')
  res.json({ success: true, data: { message: 'cache cleared' } })
})

export default router
