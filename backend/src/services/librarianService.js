import axios    from 'axios'
import couchbase from 'couchbase'
import { getScope, getCluster } from '../config/couchbase.js'
import { getEmbedding }         from './embeddingService.js'
import { logger }               from '../config/logger.js'
import { config }               from '../config/env.js'

const INDEX_NAME = 'bibliotheek-vector-index'
const CHAT_MODEL = config.OLLAMA_PROFILE_MODEL  // llama3.2
const TIMEOUT    = 120_000

const SYSTEM_PROMPT = `You are Bibliotheek, a personal librarian assistant for a private Dutch book collection focused on crime fiction, thrillers, and literary fiction.

STRICT RULES — follow these exactly:
1. ONLY mention books and authors that explicitly appear in the CATALOG CONTEXT below. Never invent, assume, or recall any title, author name, or book detail from your training data — if it is not listed in CATALOG CONTEXT, it does not exist in this library.
2. If no CATALOG CONTEXT is provided, apologise briefly and ask the user to rephrase or try a different search term.
3. For recommendations, always quote the exact title and author from CATALOG CONTEXT and give a concrete, specific reason why it fits the question.
4. Be warm and concise. Get to the answer quickly — no lengthy preambles, no padding, no re-stating the question.
5. Always respond in the same language as the user's message. Dutch question → Dutch answer, English question → English answer. Never switch languages unless the user does.
6. When responding in Dutch: use informal address (je/jij/jouw, nooit u/uw/uzelf). Use Dutch genre terms (misdaadroman, literaire fictie; "thriller" is fine as a loanword).
7. Never speculate about whether an author "might" be in the library or what they "probably" write — only state what is shown in CATALOG CONTEXT.`

// ── Vector search ─────────────────────────────────────────────────────────────

async function knnSearch(queryVec, limit = 20) {
  const cluster = getCluster()
  const request = couchbase.SearchRequest.create(
    couchbase.VectorSearch.fromVectorQuery(
      couchbase.VectorQuery.create('embedding', queryVec).numCandidates(limit * 5)
    )
  )
  const result = await cluster.search(INDEX_NAME, request, { limit })
  return result.rows ?? []
}

// ── Context builder ───────────────────────────────────────────────────────────

async function buildContext(queryVec) {
  const scope = getScope()
  const rows  = await knnSearch(queryVec, 20)
  logger.info('[librarian] knn search', { hits: rows.length })

  const bookIds   = rows.filter(r => r.id.startsWith('book::'))  .slice(0, 10).map(r => r.id)
  const authorIds = rows.filter(r => r.id.startsWith('author::')).slice(0, 5) .map(r => r.id)

  const [books, authors] = await Promise.all([
    Promise.allSettled(bookIds.map(id => scope.collection('books').get(id))),
    Promise.allSettled(authorIds.map(id => scope.collection('authors').get(id))),
  ])

  const bookDocs   = books  .filter(r => r.status === 'fulfilled').map(r => ({ id: r.value.id,  ...r.value.content }))
  const authorDocs = authors.filter(r => r.status === 'fulfilled').map(r => ({ id: r.value.id,  ...r.value.content }))

  let ctx = ''

  if (bookDocs.length) {
    ctx += 'BOOKS IN THE CATALOG (most relevant first):\n'
    for (const b of bookDocs) {
      const authorNames = b.authors?.map(a => a.name).join(', ') || 'unknown'
      const genres      = b.genres?.join(', ') || ''
      const status      = b.readStatus ? ` [${b.readStatus}]` : ''
      const rating      = b.rating    ? ` ★${b.rating}/5`    : ''
      const desc        = b.description ? `\n  "${b.description.slice(0, 200)}${b.description.length > 200 ? '…' : ''}"` : ''
      ctx += `- "${b.title}"${b.publishedYear ? ` (${b.publishedYear})` : ''} by ${authorNames}${genres ? ` — ${genres}` : ''}${status}${rating}${desc}\n`
    }
    ctx += '\n'
  }

  if (authorDocs.length) {
    ctx += 'AUTHORS IN THE CATALOG:\n'
    for (const a of authorDocs) {
      const bio = a.bio ? ` — ${a.bio.slice(0, 150)}${a.bio.length > 150 ? '…' : ''}` : ''
      ctx += `- ${a.name}${a.nationality ? ` (${a.nationality})` : ''}${bio}\n`
    }
    ctx += '\n'
  }

  const sources = [
    ...bookDocs.map(b => ({
      type:   'book',
      id:     b.id,
      title:  b.title,
      author: b.authors?.[0]?.name ?? '',
    })),
    ...authorDocs.map(a => ({
      type: 'author',
      id:   a.id,
      name: a.name,
    })),
  ]

  return { ctx, sources }
}

// ── Ollama chat ───────────────────────────────────────────────────────────────

async function ollamaChat(messages) {
  const res = await axios.post(
    `${config.OLLAMA_BASE_URL}/api/chat`,
    { model: CHAT_MODEL, messages, stream: false },
    { timeout: TIMEOUT }
  )
  return res.data?.message?.content ?? ''
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Chat with the librarian.
 * @param {string} message — latest user message
 * @param {{ role: string, content: string }[]} history — prior turns (user+assistant)
 * @returns {{ reply: string, sources: object[] }}
 */
export async function chat(message, history = []) {
  // 1. Embed the user's message to find relevant catalog items
  const queryVec = await getEmbedding(message)
  logger.info('[librarian] query embedded', { dims: queryVec?.length ?? 0 })

  let ctx     = ''
  let sources = []

  if (queryVec?.length) {
    try {
      ;({ ctx, sources } = await buildContext(queryVec))
      logger.info('[librarian] catalog context built', { books: sources.filter(s => s.type === 'book').length, authors: sources.filter(s => s.type === 'author').length })
    } catch (err) {
      logger.warn('[librarian] context build failed — answering without catalog', { err: err.message })
    }
  } else {
    logger.warn('[librarian] embedding returned empty — Ollama unreachable or model not loaded?')
  }

  // 2. Build message list for Ollama
  const systemContent = ctx
    ? `${SYSTEM_PROMPT}\n\nCATALOG CONTEXT (use ONLY these items):\n${ctx}`
    : `${SYSTEM_PROMPT}\n\nCATALOG CONTEXT: [empty — no relevant books or authors found for this query. Apologise briefly and ask the user to rephrase or try a different book or author name.]`

  const messages = [
    { role: 'system', content: systemContent },
    ...history.slice(-10),  // keep last 10 turns to avoid blowing context
    { role: 'user', content: message },
  ]

  // 3. Generate reply
  const reply = await ollamaChat(messages)

  logger.info('[librarian] chat complete', { messageLen: message.length, sources: sources.length, hadContext: ctx.length > 0 })
  return { reply, sources }
}
