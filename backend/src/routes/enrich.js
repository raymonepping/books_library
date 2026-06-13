import { Router } from 'express'
import { enrichByIsbn, enrichAuthor } from '../services/enrichService.js'
import { ValidationError } from '../utils/errors.js'

const router = Router()

// GET /api/enrich?isbn=9780099450025
router.get('/', async (req, res) => {
  const isbn = req.query.isbn?.trim()
  if (!isbn) throw new ValidationError('isbn query parameter is required')
  const data = await enrichByIsbn(isbn)
  res.json({ success: true, data })
})

// GET /api/enrich/author?name=Jo+Nesbo
router.get('/author', async (req, res) => {
  const name = req.query.name?.trim()
  if (!name) throw new ValidationError('name query parameter is required')
  const data = await enrichAuthor(name)
  res.json({ success: true, data })
})

export default router
