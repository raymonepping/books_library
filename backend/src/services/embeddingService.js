import couchbase from 'couchbase'
import { getScope } from '../config/couchbase.js'
import { logger } from '../config/logger.js'
import { config } from '../config/env.js'
import { embed as embedFn } from '../embedding/embed.js'

const EMBED_MODEL = config.OLLAMA_EMBED_MODEL
const TTL_MS = 60 * 60 * 1000 // 1 hour

const MAX_EMBED_CHARS = 6000

function truncateText(text) {
  if (!text) return ''
  return text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS).trimEnd() + '…' : text
}

// In-memory embedding cache — fine for a personal library (<1000 items)
const cache = new Map()

function cacheKey(text) {
  return `${EMBED_MODEL}:${text}`
}

function cacheGet(text) {
  const entry = cache.get(cacheKey(text))
  if (!entry) return null
  if (Date.now() - entry.ts > TTL_MS) {
    cache.delete(cacheKey(text))
    return null
  }
  return entry.vector
}

function cachePut(text, vector) {
  cache.set(cacheKey(text), { vector, ts: Date.now() })
}

// Consistent text representations used both when generating and when looking up
export function buildBookText(doc) {
  const parts = [
    doc.title,
    doc.language ? `Language: ${doc.language}` : null,
    doc.subtitle,
    doc.authors?.length ? doc.authors.map(a => a.name).join(', ') : null,
    doc.genres?.length  ? doc.genres.join(', ')                    : null,
    doc.description,
  ]
  return truncateText(parts.filter(Boolean).join('. '))
}

export function buildAuthorText(doc) {
  const parts = [
    doc.name,
    doc.nationality ? `${doc.nationality} author` : null,
    doc.bio,
  ]
  return truncateText(parts.filter(Boolean).join('. '))
}

// Warm the in-memory cache from a vector already loaded from Couchbase
export function warmCache(text, vector) {
  cachePut(text, vector)
}

// Persist an embedding to a doc's `embedding` field via sub-document upsert.
// source: 'basic' (System A on-save) | 'enriched' (System B CLI pipeline)
export async function persistEmbedding(collectionName, docId, vector, source = 'basic') {
  try {
    await getScope()
      .collection(collectionName)
      .mutateIn(docId, [
        couchbase.MutateInSpec.upsert('embedding', vector),
        couchbase.MutateInSpec.upsert('embeddingSource', source),
        couchbase.MutateInSpec.upsert('embeddingModel', config.OLLAMA_EMBED_MODEL),
        couchbase.MutateInSpec.upsert('embeddedAt', new Date().toISOString()),
      ])
  } catch (err) {
    logger.warn('[embed] failed to persist embedding', { collectionName, docId, err: err.message })
  }
}

export async function getEmbedding(text) {
  if (!text?.trim()) return null

  const cached = cacheGet(text)
  if (cached) return cached

  try {
    const vector = await embedFn(text)  // delegates to embed.js — single implementation
    if (!vector?.length) {
      logger.warn('[embed] Ollama returned empty embedding', { model: EMBED_MODEL })
      return null
    }
    cachePut(text, vector)
    return vector
  } catch (err) {
    logger.warn('[embed] Ollama unavailable', { err: err.message })
    return null
  }
}

export function cosineSim(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0
}

export function clearEmbeddingCache() {
  cache.clear()
}
