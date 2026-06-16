import { Router } from 'express'
import couchbase from 'couchbase'
import * as bookService from '../services/bookService.js'
import { enrichByIsbn, fetchCoverByTitleAuthor } from '../services/enrichService.js'
import { downloadAndStoreCover } from '../services/coverService.js'
import { getScope } from '../config/couchbase.js'
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

// GET /api/books/facets?type=genre|author|series&q=...
router.get('/facets', async (req, res) => {
  const { type, q = '' } = req.query
  if (!['genre', 'author', 'series'].includes(type)) {
    throw new ValidationError("type must be 'genre', 'author', or 'series'")
  }
  const data = await bookService.getBookFacets({ type, q })
  res.json({ success: true, data })
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

// POST /api/books/:id/fetch-cover — find + store a cover image via OpenLibrary
router.post('/:id/fetch-cover', async (req, res) => {
  const book = await bookService.getBook(req.params.id)

  let externalUrl = null

  // 1. Try by ISBN (most reliable match)
  const isbn = book.isbn13 || book.isbn
  if (isbn) {
    const enriched = await enrichByIsbn(isbn)
    externalUrl = enriched?.coverUrl || null
  }

  // 2. Fall back to title + author search on OpenLibrary
  if (!externalUrl) {
    externalUrl = await fetchCoverByTitleAuthor(book.title, book.authors)
  }

  if (!externalUrl) {
    return res.json({ success: true, data: null })
  }

  // 3. Download and store locally; fall back to external URL if download fails
  const localUrl = await downloadAndStoreCover(book.id, externalUrl)
  const finalUrl = localUrl ?? externalUrl

  await getScope()
    .collection('books')
    .mutateIn(book.id, [couchbase.MutateInSpec.upsert('coverUrl', finalUrl)])

  res.json({ success: true, data: { coverUrl: finalUrl } })
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
