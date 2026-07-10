import axios    from 'axios'
import couchbase from 'couchbase'
import { getScope, getCluster } from '../config/couchbase.js'
import { getEmbedding }         from './embeddingService.js'
import { logger }               from '../config/logger.js'
import { config }               from '../config/env.js'

const BUCKET     = config.COUCHBASE_BUCKET
const SCOPE_N    = config.COUCHBASE_SCOPE
const KS_BOOKS   = `\`${BUCKET}\`.\`${SCOPE_N}\`.\`books\``
const KS_AUTHORS = `\`${BUCKET}\`.\`${SCOPE_N}\`.\`authors\``
const INDEX_NAME = 'bibliotheek-vector-index'
const CHAT_MODEL = config.OLLAMA_PROFILE_MODEL

// ── Prompts ───────────────────────────────────────────────────────────────────

const CLASSIFY_PROMPT = `You are an intent classifier for a book library assistant.
Classify the user question and extract the key entity. Return ONLY valid JSON — no explanation, no markdown.

Intent types:
- User asks which books by a specific author are in the collection → {"type":"author_books","author":"<name>"}
- User asks about an author (biography, background, writing style) → {"type":"author_info","author":"<name>"}
- User asks what a specific book is about (synopsis, plot, description) → {"type":"book_info","title":"<title>"}
- User likes a specific book and wants similar recommendations → {"type":"book_recommend","title":"<title>"}
- User is a fan of a specific series and wants similar recommendations → {"type":"series_similar","series":"<series name>"}
- User asks which authors write similarly to a specific author (style, tone, comparable) → {"type":"author_similar","author":"<name>"}
- Anything else → {"type":"general"}

Examples:
"welke boeken van Chris Carter heb ik" → {"type":"author_books","author":"Chris Carter"}
"vertel me meer over Dan Brown" → {"type":"author_info","author":"Dan Brown"}
"waar gaat doodvonnis over" → {"type":"book_info","title":"doodvonnis"}
"ik vind doodvonnis leuk, welk boek beveel je aan" → {"type":"book_recommend","title":"doodvonnis"}
"ik ben fan van de Harry Hole series, wat lijkt hierop" → {"type":"series_similar","series":"Harry Hole"}
"welke auteurs lijken op Chris Carter qua stijl" → {"type":"author_similar","author":"Chris Carter"}
"wie schrijft vergelijkbaar met Harlan Coben" → {"type":"author_similar","author":"Harlan Coben"}`

const SYSTEM_PROMPT = `You are Bibliotheek, a personal librarian assistant for a private Dutch book collection focused on crime fiction, thrillers, and literary fiction.

STRICT RULES — follow these exactly:
1. ONLY mention books and authors that explicitly appear in the context shown below. Never invent, assume, or recall any title, author name, or book detail from your training data — if it is not in the context, it does not exist in this library.
2. If no relevant books or authors are found, apologise briefly and ask the user to rephrase or try a different book or author name.
3. For recommendations, always quote the exact title and author from the context and give a concrete, specific reason why it fits the question.
4. Be warm and concise. Get to the answer quickly — no lengthy preambles, no padding, no re-stating the question.
5. Always respond in the same language as the user's message. Dutch question → Dutch answer, English question → English answer.
6. When responding in Dutch: use informal address (je/jij/jouw, nooit u/uw). Use Dutch genre terms (misdaadroman, literaire fictie; "thriller" is fine as a loanword).
7. Never speculate about whether an author "might" be in the library or what they "probably" write — only state what is in the context.
8. Never mention that you are reading from a list, catalog, or context block. Refer to the books as if you know them personally and directly.`

// ── Intent classification ─────────────────────────────────────────────────────

async function classifyIntent(message) {
  try {
    const res = await axios.post(
      `${config.OLLAMA_BASE_URL}/api/chat`,
      {
        model:   CHAT_MODEL,
        format:  'json',
        stream:  false,
        messages: [
          { role: 'system', content: CLASSIFY_PROMPT },
          { role: 'user',   content: message },
        ],
      },
      { timeout: 15_000 }
    )
    const intent = JSON.parse(res.data.message.content)
    logger.info('[librarian] classified', { type: intent.type, entity: intent.author ?? intent.title ?? intent.series ?? '' })
    return intent
  } catch (err) {
    logger.warn('[librarian] classify failed — falling back to general', { err: err.message })
    return { type: 'general' }
  }
}

// ── N1QL helpers ──────────────────────────────────────────────────────────────

const fuzzy = (text) => `%${text.toLowerCase()}%`

async function queryAuthorBooks(author) {
  const { rows } = await getCluster().query(
    `SELECT META(b).id AS _id, b.title, b.publishedYear, b.readStatus, b.rating,
            b.genres, b.series, b.authors, b.descriptionNL, b.description
     FROM ${KS_BOOKS} AS b
     WHERE ANY a IN b.authors SATISFIES LOWER(a.name) LIKE $pat END
     ORDER BY b.series["order"] ASC NULLS LAST, b.publishedYear ASC`,
    { parameters: { pat: fuzzy(author) } }
  )
  return rows
}

async function queryAuthorInfo(author) {
  const pat = fuzzy(author)
  const [{ rows: authorRows }, { rows: bookRows }] = await Promise.all([
    getCluster().query(
      `SELECT META(a).id AS _id, a.name, a.nationality, a.bio, a.genres, a.birthYear
       FROM ${KS_AUTHORS} AS a
       WHERE LOWER(a.name) LIKE $pat
       LIMIT 1`,
      { parameters: { pat } }
    ),
    getCluster().query(
      `SELECT META(b).id AS _id, b.title, b.publishedYear, b.readStatus, b.rating,
              b.genres, b.series, b.authors
       FROM ${KS_BOOKS} AS b
       WHERE ANY a IN b.authors SATISFIES LOWER(a.name) LIKE $pat END
       ORDER BY b.publishedYear ASC`,
      { parameters: { pat } }
    ),
  ])
  return { author: authorRows[0] ?? null, books: bookRows }
}

async function queryBookInfo(title) {
  const { rows } = await getCluster().query(
    `SELECT META(b).id AS _id, b.title, b.authors, b.publishedYear,
            b.descriptionNL, b.description, b.genres, b.series, b.rating, b.readStatus
     FROM ${KS_BOOKS} AS b
     WHERE LOWER(b.title) LIKE $pat
     ORDER BY CASE WHEN LOWER(b.title) = $exact THEN 0 ELSE 1 END
     LIMIT 3`,
    { parameters: { pat: fuzzy(title), exact: title.toLowerCase() } }
  )
  return rows
}

// ── Vector helpers ────────────────────────────────────────────────────────────

async function knnSearch(vec, limit = 15, excludeIds = []) {
  const request = couchbase.SearchRequest.create(
    couchbase.VectorSearch.fromVectorQuery(
      couchbase.VectorQuery.create('embedding', vec).numCandidates((limit + excludeIds.length) * 5)
    )
  )
  const result = await getCluster().search(INDEX_NAME, request, { limit: limit + excludeIds.length })
  const rows = result.rows ?? []
  return excludeIds.length
    ? rows.filter(r => !excludeIds.includes(r.id)).slice(0, limit)
    : rows.slice(0, limit)
}

const BOOK_FIELDS   = ['title', 'authors', 'genres', 'publishedYear', 'readStatus', 'rating', 'descriptionNL', 'description', 'series']
const AUTHOR_FIELDS = ['name', 'nationality', 'bio', 'genres']

async function fetchDocsByIds(bookIds, authorIds) {
  const scope = getScope()
  const [books, authors] = await Promise.all([
    Promise.allSettled(bookIds.map(id =>
      scope.collection('books').lookupIn(id, [
        couchbase.LookupInSpec.get('title'),
        couchbase.LookupInSpec.get('authors'),
        couchbase.LookupInSpec.get('genres'),
        couchbase.LookupInSpec.get('publishedYear'),
        couchbase.LookupInSpec.get('readStatus'),
        couchbase.LookupInSpec.get('rating'),
        couchbase.LookupInSpec.get('descriptionNL'),
        couchbase.LookupInSpec.get('description'),
        couchbase.LookupInSpec.get('series'),
      ]).then(res => ({ id, res }))
    )),
    Promise.allSettled(authorIds.map(id =>
      scope.collection('authors').lookupIn(id, [
        couchbase.LookupInSpec.get('name'),
        couchbase.LookupInSpec.get('nationality'),
        couchbase.LookupInSpec.get('bio'),
        couchbase.LookupInSpec.get('genres'),
      ]).then(res => ({ id, res }))
    )),
  ])

  const mapDoc = (fields) => (r) => {
    const { id, res } = r.value
    const doc = { id }
    res.content.forEach((entry, i) => {
      if (!entry.error) doc[fields[i]] = entry.value
    })
    return doc
  }

  return {
    bookDocs:   books  .filter(r => r.status === 'fulfilled').map(mapDoc(BOOK_FIELDS)),
    authorDocs: authors.filter(r => r.status === 'fulfilled').map(mapDoc(AUTHOR_FIELDS)),
  }
}

async function vectorFromBook(title) {
  // Find the anchor book and use its existing embedding for KNN — avoids re-embedding Dutch prose
  const { rows } = await getCluster().query(
    `SELECT META(b).id AS _id, b.embedding
     FROM ${KS_BOOKS} AS b
     WHERE LOWER(b.title) LIKE $pat AND b.embedding IS NOT MISSING
     ORDER BY CASE WHEN LOWER(b.title) = $exact THEN 0 ELSE 1 END
     LIMIT 1`,
    { parameters: { pat: fuzzy(title), exact: title.toLowerCase() } }
  )

  const anchor = rows[0]
  if (!anchor?.embedding?.length) {
    logger.info('[librarian] anchor book has no embedding, falling back to text embed', { title })
    return vectorFromText(title)
  }

  const knnRows   = await knnSearch(anchor.embedding, 12, [anchor._id])
  const bookIds   = knnRows.filter(r => r.id.startsWith('book::'))  .slice(0, 8).map(r => r.id)
  const authorIds = knnRows.filter(r => r.id.startsWith('author::')).slice(0, 2).map(r => r.id)
  return fetchDocsByIds(bookIds, authorIds)
}

function averageVectors(vecs) {
  const dim = vecs[0].length
  const avg = new Array(dim).fill(0)
  for (const v of vecs) for (let i = 0; i < dim; i++) avg[i] += v[i]
  return avg.map(x => x / vecs.length)
}

async function vectorFromSeries(series) {
  // Average the embeddings of books in this series, then find similar books outside it
  const { rows } = await getCluster().query(
    `SELECT META(b).id AS _id, b.embedding
     FROM ${KS_BOOKS} AS b
     WHERE LOWER(b.series.name) LIKE $pat AND b.embedding IS NOT MISSING
     LIMIT 5`,
    { parameters: { pat: fuzzy(series) } }
  )

  const valid = rows.filter(r => r.embedding?.length)
  if (!valid.length) {
    logger.info('[librarian] no series embeddings found, falling back to text embed', { series })
    return vectorFromText(series)
  }

  const avgVec    = averageVectors(valid.map(r => r.embedding))
  const excludeIds = valid.map(r => r._id)
  const knnRows   = await knnSearch(avgVec, 12, excludeIds)
  const bookIds   = knnRows.filter(r => r.id.startsWith('book::'))  .slice(0, 8).map(r => r.id)
  const authorIds = knnRows.filter(r => r.id.startsWith('author::')).slice(0, 2).map(r => r.id)
  return fetchDocsByIds(bookIds, authorIds)
}

async function vectorFromAuthor(author) {
  // Prefer the author document's own embedding — it captures writing style profile directly.
  // Fall back to averaging book embeddings when the author doc has no embedding yet.
  const [{ rows: authorRows }, { rows: bookRows }] = await Promise.all([
    getCluster().query(
      `SELECT META(a).id AS _id, a.embedding
       FROM ${KS_AUTHORS} AS a
       WHERE LOWER(a.name) LIKE $pat AND a.embedding IS NOT MISSING
       LIMIT 1`,
      { parameters: { pat: fuzzy(author) } }
    ),
    getCluster().query(
      `SELECT META(b).id AS _id, b.embedding
       FROM ${KS_BOOKS} AS b
       WHERE ANY a IN b.authors SATISFIES LOWER(a.name) LIKE $pat END
         AND b.embedding IS NOT MISSING`,
      { parameters: { pat: fuzzy(author) } }
    ),
  ])

  const excludeIds = [
    ...authorRows.map(r => r._id),
    ...bookRows.map(r => r._id),
  ]

  let vec
  if (authorRows[0]?.embedding?.length) {
    vec = authorRows[0].embedding
  } else {
    const valid = bookRows.filter(r => r.embedding?.length)
    if (!valid.length) return vectorFromText(author)
    vec = averageVectors(valid.map(r => r.embedding))
  }

  const knnRows   = await knnSearch(vec, 16, excludeIds)
  const bookIds   = knnRows.filter(r => r.id.startsWith('book::'))  .slice(0, 6).map(r => r.id)
  const authorIds = knnRows.filter(r => r.id.startsWith('author::')).slice(0, 5).map(r => r.id)
  return fetchDocsByIds(bookIds, authorIds)
}

async function vectorFromText(text) {
  const vec = await getEmbedding(text)
  if (!vec?.length) return { bookDocs: [], authorDocs: [] }
  const knnRows   = await knnSearch(vec, 15)
  const bookIds   = knnRows.filter(r => r.id.startsWith('book::'))  .slice(0, 7).map(r => r.id)
  const authorIds = knnRows.filter(r => r.id.startsWith('author::')).slice(0, 3).map(r => r.id)
  return fetchDocsByIds(bookIds, authorIds)
}

// ── Context formatting ────────────────────────────────────────────────────────

function fmtBook(b) {
  const authorName = b.authors?.map(a => a.name).join(', ') || 'unknown'
  const genres     = b.genres?.join(', ')
  const status     = b.readStatus ? ` [${b.readStatus}]`  : ''
  const rating     = b.rating    ? ` ★${b.rating}/5`     : ''
  const seriesInfo = b.series?.name
    ? ` [${b.series.name}${b.series.order ? ` #${b.series.order}` : ''}]`
    : ''
  const rawDesc    = b.descriptionNL || b.description || ''
  const desc       = rawDesc ? `\n  "${rawDesc.slice(0, 200)}${rawDesc.length > 200 ? '…' : ''}"` : ''
  return `- "${b.title}"${b.publishedYear ? ` (${b.publishedYear})` : ''} by ${authorName}${genres ? ` — ${genres}` : ''}${seriesInfo}${status}${rating}${desc}`
}

function bookSource(b) {
  return { type: 'book', id: b._id ?? b.id ?? '', title: b.title, author: b.authors?.[0]?.name ?? '' }
}

function buildContextFromN1ql(intentType, data) {
  let ctx = ''
  const sources = []

  if (intentType === 'author_books') {
    if (!data.length) return { ctx: '', sources: [] }
    ctx += 'Books by this author in the library:\n'
    data.forEach(b => { ctx += fmtBook(b) + '\n'; sources.push(bookSource(b)) })
    return { ctx, sources }
  }

  if (intentType === 'author_info') {
    const { author, books } = data
    if (!author && !books.length) return { ctx: '', sources: [] }
    if (author) {
      const bio    = author.bio    ? ` — ${author.bio.slice(0, 300)}${author.bio.length > 300 ? '…' : ''}` : ''
      const genres = author.genres?.length ? ` [${author.genres.join(', ')}]` : ''
      ctx += `Author: ${author.name}${author.nationality ? ` (${author.nationality})` : ''}${genres}${bio}\n\n`
      sources.push({ type: 'author', id: author._id ?? '', name: author.name })
    }
    if (books.length) {
      ctx += 'Their books in this library:\n'
      books.forEach(b => { ctx += fmtBook(b) + '\n'; sources.push(bookSource(b)) })
    }
    return { ctx, sources }
  }

  if (intentType === 'book_info') {
    if (!data.length) return { ctx: '', sources: [] }
    ctx += 'Book details:\n'
    data.forEach(b => { ctx += fmtBook(b) + '\n'; sources.push(bookSource(b)) })
    return { ctx, sources }
  }

  return { ctx: '', sources: [] }
}

function buildContextFromDocs({ bookDocs, authorDocs }) {
  let ctx = ''
  const sources = []

  if (bookDocs.length) {
    ctx += 'Books:\n'
    bookDocs.forEach(b => { ctx += fmtBook(b) + '\n'; sources.push(bookSource(b)) })
    ctx += '\n'
  }
  if (authorDocs.length) {
    ctx += 'Authors:\n'
    authorDocs.forEach(a => {
      const bio    = a.bio    ? ` — ${a.bio.slice(0, 150)}${a.bio.length > 150 ? '…' : ''}` : ''
      const genres = a.genres?.length ? ` [${a.genres.join(', ')}]` : ''
      ctx += `- ${a.name}${a.nationality ? ` (${a.nationality})` : ''}${genres}${bio}\n`
      sources.push({ type: 'author', id: a.id ?? '', name: a.name })
    })
    ctx += '\n'
  }
  return { ctx, sources }
}

function buildContextForAuthorSimilar(author, { bookDocs, authorDocs }) {
  const sources = []
  if (!authorDocs.length && !bookDocs.length) return { ctx: '', sources: [] }

  let ctx = `Authors in this library with a writing style similar to ${author}:\n`

  if (authorDocs.length) {
    authorDocs.forEach(a => {
      const bio    = a.bio    ? ` — ${a.bio.slice(0, 150)}${a.bio.length > 150 ? '…' : ''}` : ''
      const genres = a.genres?.length ? ` [${a.genres.join(', ')}]` : ''
      ctx += `- ${a.name}${a.nationality ? ` (${a.nationality})` : ''}${genres}${bio}\n`
      sources.push({ type: 'author', id: a.id ?? '', name: a.name })
    })
    ctx += '\n'
  }

  if (bookDocs.length) {
    ctx += 'Representative books from these similar authors:\n'
    bookDocs.forEach(b => { ctx += fmtBook(b) + '\n'; sources.push(bookSource(b)) })
    ctx += '\n'
  }

  return { ctx, sources }
}

// ── Context resolver ──────────────────────────────────────────────────────────

async function resolveContext(intent, message) {
  const { type } = intent
  try {
    if (type === 'author_books') {
      const rows = await queryAuthorBooks(intent.author)
      logger.info('[librarian] author_books', { author: intent.author, found: rows.length })
      return buildContextFromN1ql('author_books', rows)
    }
    if (type === 'author_info') {
      const data = await queryAuthorInfo(intent.author)
      logger.info('[librarian] author_info', { author: intent.author, books: data.books.length })
      return buildContextFromN1ql('author_info', data)
    }
    if (type === 'book_info') {
      const rows = await queryBookInfo(intent.title)
      logger.info('[librarian] book_info', { title: intent.title, found: rows.length })
      return buildContextFromN1ql('book_info', rows)
    }
    if (type === 'book_recommend') {
      const docs = await vectorFromBook(intent.title)
      logger.info('[librarian] book_recommend', { title: intent.title, books: docs.bookDocs?.length })
      return buildContextFromDocs(docs)
    }
    if (type === 'series_similar') {
      const docs = await vectorFromSeries(intent.series)
      logger.info('[librarian] series_similar', { series: intent.series, books: docs.bookDocs?.length })
      return buildContextFromDocs(docs)
    }
    if (type === 'author_similar') {
      const docs = await vectorFromAuthor(intent.author)
      logger.info('[librarian] author_similar', { author: intent.author, books: docs.bookDocs?.length, authors: docs.authorDocs?.length })
      return buildContextForAuthorSimilar(intent.author, docs)
    }
    // general fallback
    const docs = await vectorFromText(message)
    logger.info('[librarian] general vector', { books: docs.bookDocs?.length })
    return buildContextFromDocs(docs)
  } catch (err) {
    logger.warn('[librarian] resolveContext failed', { type, err: err.message })
    return { ctx: '', sources: [] }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function streamChat(message, history = [], onToken, onDone) {
  const intent          = await classifyIntent(message)
  const { ctx, sources } = await resolveContext(intent, message)

  logger.info('[librarian] context ready', {
    type:    intent.type,
    hasCtx:  ctx.length > 0,
    sources: sources.length,
  })

  const systemContent = ctx
    ? `${SYSTEM_PROMPT}\n\n<library>\n${ctx}</library>`
    : `${SYSTEM_PROMPT}\n\n<library>empty — no relevant books or authors found. Apologise briefly and ask the user to rephrase or try a different book or author name.</library>`

  const msgs = [
    { role: 'system', content: systemContent },
    ...history.slice(-12),
    { role: 'user', content: message },
  ]

  const res = await axios.post(
    `${config.OLLAMA_BASE_URL}/api/chat`,
    { model: CHAT_MODEL, messages: msgs, stream: true },
    { responseType: 'stream', timeout: 60_000 }
  )

  await new Promise((resolve, reject) => {
    let buf = ''
    let doneFired = false

    const finish = () => {
      if (doneFired) return
      doneFired = true
      onDone(sources)
      resolve()
    }

    res.data.on('data', chunk => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const data = JSON.parse(line)
          if (data.message?.content) onToken(data.message.content)
          if (data.done) finish()
        } catch {}
      }
    })
    res.data.on('end', finish)
    res.data.on('error', reject)
  })

  logger.info('[librarian] stream complete', { sources: sources.length })
}

export async function warmupLibrarian() {
  try {
    await getEmbedding('warmup')
    logger.info('[librarian] embedding model warmed up')
  } catch {}
}
