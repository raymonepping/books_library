import couchbase from 'couchbase'
import { Router } from 'express'
import * as authorService from '../services/authorService.js'
import { ValidationError, NotFoundError } from '../utils/errors.js'
import { enrichAuthorByName } from '../services/enrichService.js'
import { downloadAndStoreCover } from '../services/coverService.js'
import { buildAuthorText, getEmbedding, persistEmbedding } from '../services/embeddingService.js'
import { getScope } from '../config/couchbase.js'

const router = Router()

// GET /api/authors?page=&limit=&genre=&nationality=
router.get('/', async (req, res) => {
  const { page, limit, genre, nationality, q } = req.query
  const data = await authorService.listAuthors({ page, limit, genre, nationality, q })
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

// POST /api/authors/:id/enrich — fetch metadata from OpenLibrary for a single author
router.post('/:id/enrich', async (req, res, next) => {
  try {
    const author = await authorService.getAuthor(req.params.id)
    const enriched = await enrichAuthorByName(author.name)
    if (!enriched) return res.json({ success: true, data: null, reason: 'not-found-on-openlibrary' })

    const specs = []

    if (enriched.bio && (!author.bio || author.bio === '')) {
      specs.push(couchbase.MutateInSpec.upsert('bio', enriched.bio))
    }
    if (enriched.birthYear && !author.birthYear) {
      specs.push(couchbase.MutateInSpec.upsert('birthYear', enriched.birthYear))
    }
    if (enriched.photoUrl && (!author.photoUrl || author.photoUrl === '' || author.photoUrl.startsWith('http'))) {
      const localUrl = await downloadAndStoreCover(author.id, enriched.photoUrl)
      specs.push(couchbase.MutateInSpec.upsert('photoUrl', localUrl ?? enriched.photoUrl))
    }

    if (specs.length) {
      await getScope().collection('authors').mutateIn(author.id, specs)

      const enrichedDoc = { name: author.name, nationality: author.nationality ?? '', bio: enriched.bio || author.bio || '' }
      const text = buildAuthorText(enrichedDoc)
      if (text) {
        const vec = await getEmbedding(text)
        if (vec) await persistEmbedding('authors', author.id, vec)
      }
    }

    const updated = await authorService.getAuthor(author.id)
    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

export default router
