import couchbase from 'couchbase'
import { getScope } from '../config/couchbase.js'
import { logger }               from '../config/logger.js'
import { config }               from '../config/env.js'
import { embed }                from './embed.js'
import { generateAuthorProfile } from './profileGenerator.js'
import { buildBookEmbedText, buildAuthorEmbedText } from './bookProfileBuilder.js'

const BATCH_SIZE   = config.EMBED_BATCH_SIZE
const CONCURRENCY  = config.EMBED_CONCURRENCY

// ── Embedding document key helpers ───────────────────────────────────────────

/**
 * Build the Couchbase key for an embedding document.
 * Author id: "author::jo-nesbo"  → emb::author::jo-nesbo
 * Book id:   "book::isbn-..."    → emb::book::isbn-...
 */
function embKey(docId) {
  // docId already contains type prefix: author:: or book::
  return `emb::${docId}`
}

// ── Couchbase helpers ─────────────────────────────────────────────────────────

async function upsertEmbedding(docId, refType, vector, profileText) {
  const key = embKey(docId)
  const doc = {
    refType,
    refId:       docId,
    vector,
    profileText,
    generatedAt: new Date().toISOString(),
    modelUsed:   config.OLLAMA_EMBED_MODEL,
    dims:        vector.length,
  }
  try {
    await getScope().collection('embeddings').upsert(key, doc)
  } catch (err) {
    logger.warn('[enrichWorker] failed to upsert embedding', { key, err: err.message })
    throw err
  }
}

// Patch the embedding vector and metadata directly onto the source document.
// embeddingSource: 'enriched' prevents System A from overwriting this vector on save.
async function patchDocEmbedding(collectionName, docId, vector) {
  try {
    await getScope().collection(collectionName).mutateIn(docId, [
      couchbase.MutateInSpec.upsert('embedding', vector),
      couchbase.MutateInSpec.upsert('embeddingSource', 'enriched'),
      couchbase.MutateInSpec.upsert('embeddingModel', config.OLLAMA_EMBED_MODEL),
      couchbase.MutateInSpec.upsert('embeddedAt', new Date().toISOString()),
    ])
  } catch (err) {
    logger.warn('[enrichWorker] failed to patch embedding onto doc', { collectionName, docId, err: err.message })
    throw err
  }
}

async function upsertProfile(authorId, profile) {
  const profileDoc = {
    ...profile,
    generatedAt: new Date().toISOString(),
    modelUsed:   config.OLLAMA_PROFILE_MODEL,
  }
  try {
    await getScope().collection('authors').mutateIn(authorId, [
      couchbase.MutateInSpec.upsert('profile', profileDoc),
    ])
  } catch (err) {
    logger.warn('[enrichWorker] failed to upsert profile', { authorId, err: err.message })
    throw err
  }
}

async function embeddingExists(docId) {
  const result = await getScope().collection('embeddings').exists(embKey(docId))
  return result.exists
}

async function scanDocuments(collectionName) {
  const rows = await getScope()
    .collection(collectionName)
    .scan(new couchbase.RangeScan())

  return rows.map(row => ({ id: row.id, ...row.content }))
}

/**
 * Load one consistent in-memory view for a CLI or admin enrichment run.
 * KV range scans suit this offline, low-concurrency batch workflow and avoid
 * repeating one SQL++ book lookup for every author.
 */
export async function createEnrichmentContext({
  authorId = null,
  includeAuthors = true,
  includeBooks = true,
} = {}) {
  const authorsPromise = !includeAuthors
    ? Promise.resolve([])
    : authorId
      ? getScope().collection('authors').get(authorId)
          .then(result => [{ id: authorId, ...result.content }])
      : scanDocuments('authors')
  const booksPromise = includeBooks
    ? scanDocuments('books')
    : Promise.resolve([])

  const [authors, books] = await Promise.all([authorsPromise, booksPromise])

  authors.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  books.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))

  return { authors, books }
}

// ── Simple semaphore ──────────────────────────────────────────────────────────

function createSemaphore(concurrency) {
  let running = 0
  const queue = []

  return function acquire() {
    return new Promise(resolve => {
      function tryRun() {
        if (running < concurrency) {
          running++
          resolve(() => {
            running--
            if (queue.length) queue.shift()()
          })
        } else {
          queue.push(tryRun)
        }
      }
      tryRun()
    })
  }
}

// ── Core per-author logic ─────────────────────────────────────────────────────

async function processAuthor(authorDoc, books, force, sem, stats, skipBooks = false) {
  const authorId   = authorDoc.id
  const authorName = authorDoc.name

  if (!authorId || !authorName) {
    logger.warn('[enrichWorker] skipping author without id/name', { authorDoc })
    stats.skipped++
    return
  }

  const authorBooks = books.filter(book =>
    book.authors?.some(author => author.id === authorId)
  )
  const knownTitles = authorBooks.map(book => book.title).filter(Boolean)

  // 2. Load or generate author profile (profile field lives on the author doc itself)
  let profile
  if (!force && authorDoc.profile) {
    profile = authorDoc.profile
    stats.profilesSkipped++
  }

  if (!profile) {
    const acquire = sem()
    const release = await acquire
    try {
      profile = await generateAuthorProfile(
        { id: authorId, name: authorName, nationality: authorDoc.nationality },
        knownTitles.length ? knownTitles : [authorName]
      )
    } catch (err) {
      // Write placeholder so this author isn't retried endlessly
      const placeholder = { error: 'profile_generation_failed', raw: err.message.slice(0, 500) }
      await getScope().collection('authors').mutateIn(authorId, [
        couchbase.MutateInSpec.upsert('profile', {
          ...placeholder,
          generatedAt: new Date().toISOString(), modelUsed: config.OLLAMA_PROFILE_MODEL,
        }),
      ]).catch(() => {})
      logger.warn('[enrichWorker] profile generation failed — placeholder written', { authorId, err: err.message })
      stats.errors++
      return
    } finally {
      release()
    }

    try {
      await upsertProfile(authorId, profile)
      stats.profiles++
    } catch (err) {
      logger.warn('[enrichWorker] profile upsert failed', { authorId, err: err.message })
      stats.errors++
    }
  }

  // 3. Author embedding
  if (force || !await embeddingExists(authorId)) {
    const authorText = buildAuthorEmbedText(authorDoc, profile)
    if (authorText) {
      const acquire = sem()
      const release = await acquire
      try {
        const vec = await embed(authorText)
        await upsertEmbedding(authorId, 'author', vec, authorText)
        await patchDocEmbedding('authors', authorId, vec)
        stats.authorEmbeddings++
      } catch (err) {
        logger.warn('[enrichWorker] author embedding failed', { authorId, err: err.message })
        stats.errors++
      } finally {
        release()
      }
    }
  }

  // 4. Book embeddings
  if (!skipBooks) {
    for (const book of authorBooks) {
      if (!force && await embeddingExists(book.id)) continue

      const bookText = buildBookEmbedText(book, authorDoc, profile)
      if (!bookText) continue

      const acquire = sem()
      const release = await acquire
      try {
        const vec = await embed(bookText)
        await upsertEmbedding(book.id, 'book', vec, bookText)
        await patchDocEmbedding('books', book.id, vec)
        stats.bookEmbeddings++
      } catch (err) {
        logger.warn('[enrichWorker] book embedding failed', { bookId: book.id, err: err.message })
        stats.errors++
      } finally {
        release()
      }
    }
  }

  logger.debug(`[enrichWorker] author: ${authorName} — profile ✓ — embedding ✓ — books: ${authorBooks.length}`, { authorId })
  stats.authors++
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the enrichment pipeline.
 * @param {{ force?: boolean, authorId?: string, skipBooks?: boolean, context?: object }} options
 */
export async function runEnrichment({ force = false, authorId = null, skipBooks = false, context = null } = {}) {
  const stats = {
    authors: 0, profiles: 0, profilesSkipped: 0,
    authorEmbeddings: 0, bookEmbeddings: 0, errors: 0, skipped: 0,
  }

  const sem = createSemaphore(CONCURRENCY)

  let runContext = context
  let authorDocs = []
  if (authorId) {
    if (runContext) {
      const author = runContext.authors.find(item => item.id === authorId)
      if (!author) throw new Error(`[enrichWorker] author not found: ${authorId}`)
      authorDocs = [author]
    } else {
      try {
        const doc = await getScope().collection('authors').get(authorId)
        authorDocs = [{ id: authorId, ...doc.content }]
      } catch (err) {
        throw new Error(`[enrichWorker] author not found: ${authorId} — ${err.message}`)
      }
      runContext = { authors: authorDocs, books: await scanDocuments('books') }
    }
  } else {
    runContext ??= await createEnrichmentContext()
    authorDocs = runContext.authors
  }

  // Process in batches
  for (let i = 0; i < authorDocs.length; i += BATCH_SIZE) {
    const batch = authorDocs.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(
      batch.map(a => processAuthor(a, runContext.books, force, () => sem, stats, skipBooks))
    )
  }

  return stats
}

// ── Public: book-only enrichment ──────────────────────────────────────────────

/**
 * Embed books independently of author processing. Author profiles must exist.
 * @param {{ force?: boolean, bookId?: string, authorId?: string, onProgress?: Function, context?: object }} options
 * onProgress is called with { bookId, title, lang, success, error? } for each processed book.
 */
export async function runBookEnrichment({ force = false, bookId = null, authorId = null, onProgress = null, context = null } = {}) {
  const stats = { books: 0, embeddings: 0, errors: 0 }
  const sem = createSemaphore(CONCURRENCY)

  let books = []

  if (bookId) {
    const doc = await getScope().collection('books').get(bookId)
    books = [{ id: bookId, ...doc.content }]
  } else {
    const sourceBooks = context?.books ?? await scanDocuments('books')
    books = sourceBooks.filter(book => {
      const needsEmbedding = force || !Array.isArray(book.embedding) || book.embedding.length === 0
      const matchesAuthor = !authorId || book.authors?.some(author => author.id === authorId)
      return needsEmbedding && matchesAuthor
    })
  }

  for (const book of books) {
    stats.books++
    const bookTitle = book.title ?? book.id

    const authorRef = book.authors?.[0]
    let authorDoc = { id: authorRef?.id, name: authorRef?.name }
    let profile = null

    if (authorRef?.id) {
      try {
        const aResult = await getScope().collection('authors').get(authorRef.id)
        authorDoc = { ...authorDoc, ...aResult.content }
        profile = authorDoc.profile ?? null
      } catch { /* proceed with stub — name is still available */ }

      if (!profile) {
        logger.warn('[runBookEnrichment] no profile for author — embedding will lack profile fields', { authorId: authorRef.id })
      }
    }

    const bookText = buildBookEmbedText(book, authorDoc, profile)
    if (!bookText) continue

    const acquire = sem()
    const release = await acquire
    try {
      const vec = await embed(bookText)
      await upsertEmbedding(book.id, 'book', vec, bookText)
      await patchDocEmbedding('books', book.id, vec)
      stats.embeddings++
      onProgress?.({ bookId: book.id, title: bookTitle, lang: book.language, success: true })
    } catch (err) {
      logger.warn('[runBookEnrichment] book embedding failed', { bookId: book.id, err: err.message })
      stats.errors++
      onProgress?.({ bookId: book.id, title: bookTitle, lang: book.language, success: false, error: err.message })
    } finally {
      release()
    }
  }

  return stats
}
