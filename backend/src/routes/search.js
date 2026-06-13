import { Router } from 'express'
import { search } from '../services/searchService.js'
import { ValidationError } from '../utils/errors.js'

const router = Router()

// GET /api/search?q=crime&type=books&page=1&limit=20
router.get('/', async (req, res) => {
  const { q, type, page, limit } = req.query
  if (!q?.trim()) throw new ValidationError('q query parameter is required')
  if (type && !['books', 'authors'].includes(type)) {
    throw new ValidationError("type must be 'books' or 'authors'")
  }
  const data = await search({ q: q.trim(), type, page, limit })
  res.json({ success: true, data })
})

export default router
