import { Router } from 'express'
import * as authorService from '../services/authorService.js'
import { ValidationError } from '../utils/errors.js'

const router = Router()

// GET /api/authors?page=&limit=&genre=&nationality=
router.get('/', async (req, res) => {
  const { page, limit, genre, nationality } = req.query
  const data = await authorService.listAuthors({ page, limit, genre, nationality })
  res.json({ success: true, data })
})

// POST /api/authors/sync — backfill author stubs from all existing books
router.post('/sync', async (req, res) => {
  const data = await authorService.syncAuthorsFromBooks()
  res.json({ success: true, data })
})

// GET /api/authors/:id
router.get('/:id', async (req, res) => {
  const data = await authorService.getAuthor(req.params.id)
  res.json({ success: true, data })
})

// POST /api/authors
router.post('/', async (req, res) => {
  if (!req.body.name?.trim()) throw new ValidationError('name is required')
  const data = await authorService.createAuthor(req.body)
  res.status(201).json({ success: true, data })
})

export default router
