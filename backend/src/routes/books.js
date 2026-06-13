import { Router } from 'express'
import * as bookService from '../services/bookService.js'
import { ValidationError } from '../utils/errors.js'

const router = Router()

// GET /api/books?genre=&status=&owned=&author=&series=&sort=&page=&limit=
router.get('/', async (req, res) => {
  const { genre, status, owned, author, series, sort, page, limit } = req.query
  const data = await bookService.listBooks({ genre, status, owned, author, series, sort, page, limit })
  res.json({ success: true, data })
})

// POST /api/books
router.post('/', async (req, res) => {
  const { title } = req.body
  if (!title?.trim()) throw new ValidationError('title is required')
  const book = await bookService.createBook(req.body)
  res.status(201).json({ success: true, data: book })
})

// GET /api/books/:id
router.get('/:id', async (req, res) => {
  const book = await bookService.getBook(req.params.id)
  res.json({ success: true, data: book })
})

// PUT /api/books/:id
router.put('/:id', async (req, res) => {
  const book = await bookService.updateBook(req.params.id, req.body)
  res.json({ success: true, data: book })
})

// DELETE /api/books/:id
router.delete('/:id', async (req, res) => {
  await bookService.deleteBook(req.params.id)
  res.json({ success: true, data: null })
})

// PATCH /api/books/:id/status  (also accepts PUT for compatibility)
router.patch('/:id/status', async (req, res) => {
  const { readStatus, progress, rating } = req.body
  const book = await bookService.updateBookStatus(req.params.id, { readStatus, progress, rating })
  res.json({ success: true, data: book })
})
router.put('/:id/status', async (req, res) => {
  const { readStatus, progress, rating } = req.body
  const book = await bookService.updateBookStatus(req.params.id, { readStatus, progress, rating })
  res.json({ success: true, data: book })
})

export default router
