import axios from 'axios'
import { logger } from '../config/logger.js'
import { config } from '../config/env.js'

const OLLAMA_BASE_URL = config.OLLAMA_BASE_URL
const EMBED_MODEL = config.OLLAMA_EMBED_MODEL
const TIMEOUT = 10_000
const TTL_MS = 60 * 60 * 1000 // 1 hour

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

export async function getEmbedding(text) {
  if (!text?.trim()) return null

  const cached = cacheGet(text)
  if (cached) return cached

  try {
    // Try newer /api/embed first (Ollama 0.3+)
    const res = await axios.post(
      `${OLLAMA_BASE_URL}/api/embed`,
      { model: EMBED_MODEL, input: text },
      { timeout: TIMEOUT }
    )
    const vector = res.data?.embeddings?.[0] ?? res.data?.embedding ?? null
    if (!vector?.length) {
      logger.warn('[embed] Ollama returned empty embedding', { model: EMBED_MODEL })
      return null
    }
    cachePut(text, vector)
    return vector
  } catch (err) {
    // Fall back to older /api/embeddings endpoint
    try {
      const res = await axios.post(
        `${OLLAMA_BASE_URL}/api/embeddings`,
        { model: EMBED_MODEL, prompt: text },
        { timeout: TIMEOUT }
      )
      const vector = res.data?.embedding ?? null
      if (!vector?.length) return null
      cachePut(text, vector)
      return vector
    } catch (fallbackErr) {
      logger.warn('[embed] Ollama unavailable — Tier 3 disabled', { err: fallbackErr.message })
      return null
    }
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
