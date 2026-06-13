import { Router } from 'express'
import couchbase from 'couchbase'
import { getCover, migrateCovers } from '../services/coverService.js'
import { NotFoundError } from '../utils/errors.js'

const router = Router()

// POST /api/covers/migrate — must be before /:bookId to avoid Express treating "migrate" as an id
router.post('/migrate', async (req, res) => {
  const data = await migrateCovers()
  res.json({ success: true, data })
})

// GET /api/covers/:bookId
router.get('/:bookId', async (req, res) => {
  let cover
  try {
    cover = await getCover(req.params.bookId)
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) {
      throw new NotFoundError('Cover', req.params.bookId)
    }
    throw err
  }

  const img = Buffer.from(cover.data, 'base64')
  res.set('Content-Type', cover.contentType)
  res.set('Cache-Control', 'public, max-age=31536000, immutable')
  res.set('Content-Length', img.length)
  res.send(img)
})

export default router
