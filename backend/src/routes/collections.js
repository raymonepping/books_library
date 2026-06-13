import { Router } from 'express'
import * as collectionService from '../services/collectionService.js'
import { ValidationError } from '../utils/errors.js'

const router = Router()

// GET /api/collections
router.get('/', async (req, res) => {
  const { page, limit } = req.query
  const data = await collectionService.listCollections({ page, limit })
  res.json({ success: true, data })
})

// POST /api/collections
router.post('/', async (req, res) => {
  if (!req.body.name?.trim()) throw new ValidationError('name is required')
  const data = await collectionService.createCollection(req.body)
  res.status(201).json({ success: true, data })
})

// GET /api/collections/:id
router.get('/:id', async (req, res) => {
  const data = await collectionService.getCollection(req.params.id)
  res.json({ success: true, data })
})

// PUT /api/collections/:id
router.put('/:id', async (req, res) => {
  if (!req.body.name?.trim()) throw new ValidationError('name is required')
  const data = await collectionService.updateCollection(req.params.id, req.body)
  res.json({ success: true, data })
})

// DELETE /api/collections/:id
router.delete('/:id', async (req, res) => {
  await collectionService.deleteCollection(req.params.id)
  res.json({ success: true, data: null })
})

// PUT /api/collections/:id/books/:bookId — toggle single book
router.put('/:id/books/:bookId', async (req, res) => {
  const data = await collectionService.toggleBook(req.params.id, req.params.bookId)
  res.json({ success: true, data })
})

// PUT /api/collections/:id/books — replace entire book list
router.put('/:id/books', async (req, res) => {
  if (!Array.isArray(req.body.bookIds)) throw new ValidationError('bookIds must be an array')
  const data = await collectionService.setBooks(req.params.id, req.body.bookIds)
  res.json({ success: true, data })
})

export default router
