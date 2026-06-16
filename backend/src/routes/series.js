import { Router } from 'express'
import * as seriesService from '../services/seriesService.js'
import { ValidationError } from '../utils/errors.js'

const router = Router()

// GET /api/series?page=&limit=
router.get('/', async (req, res) => {
  const { page, limit } = req.query
  const data = await seriesService.listSeries({ page, limit })
  res.json({ success: true, data })
})

// POST /api/series
router.post('/', async (req, res) => {
  const { name, totalBooks } = req.body
  if (!name?.trim()) throw new ValidationError('name is required')
  if (totalBooks === undefined || isNaN(parseInt(totalBooks))) {
    throw new ValidationError('totalBooks must be a number')
  }
  const series = await seriesService.createSeries(req.body)
  res.status(201).json({ success: true, data: series })
})

// GET /api/series/:id
router.get('/:id', async (req, res) => {
  const data = await seriesService.getSeries(req.params.id)
  res.json({ success: true, data })
})

// PUT /api/series/:id
router.put('/:id', async (req, res) => {
  if (!req.body.name?.trim()) throw new ValidationError('name is required')
  const data = await seriesService.updateSeries(req.params.id, req.body)
  res.json({ success: true, data })
})

// GET /api/series/:id/missing
router.get('/:id/missing', async (req, res) => {
  const data = await seriesService.getMissingBooks(req.params.id)
  res.json({ success: true, data })
})

// DELETE /api/series/:id
router.delete('/:id', async (req, res) => {
  await seriesService.deleteSeries(req.params.id)
  res.json({ success: true })
})

// PUT /api/series/:id/books/:order  — body: { owned: bool }
router.put('/:id/books/:order', async (req, res) => {
  if (req.body.owned === undefined) throw new ValidationError('owned is required')
  const data = await seriesService.markBookOwned(req.params.id, req.params.order, req.body)
  res.json({ success: true, data })
})

export default router
