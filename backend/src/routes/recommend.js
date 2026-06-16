import { Router } from 'express'
import { recommendBooks, recommendAuthors, forYouRecommendations } from '../services/recommendService.js'
import { ValidationError } from '../utils/errors.js'

const router = Router()

// GET /api/recommend/for-you?seeds=5&perSeed=4
router.get('/for-you', async (req, res) => {
  const maxSeeds = Math.min(parseInt(req.query.seeds)   || 5, 8)
  const perSeed  = Math.min(parseInt(req.query.perSeed) || 4, 8)
  const data = await forYouRecommendations({ maxSeeds, perSeed })
  res.json({ success: true, data })
})

// GET /api/recommend/book/:id?limit=10
router.get('/book/:id', async (req, res) => {
  const { id } = req.params
  const limit = Math.min(parseInt(req.query.limit) || 10, 50)
  if (!id?.startsWith('book::')) throw new ValidationError('id must be a book id (book::...)')
  const data = await recommendBooks(id, { limit })
  res.json({ success: true, data })
})

// GET /api/recommend/author/:id?limit=5
router.get('/author/:id', async (req, res) => {
  const { id } = req.params
  const limit = Math.min(parseInt(req.query.limit) || 5, 20)
  if (!id?.startsWith('author::')) throw new ValidationError('id must be an author id (author::...)')
  const data = await recommendAuthors(id, { limit })
  res.json({ success: true, data })
})

export default router
