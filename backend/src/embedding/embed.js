import axios from 'axios'
import { config } from '../config/env.js'

const BASE_URL = config.OLLAMA_BASE_URL
const MODEL    = config.OLLAMA_EMBED_MODEL
const TIMEOUT  = 60_000

/**
 * Call Ollama to embed text. Returns a vector matching OLLAMA_EMBED_MODEL's dimensions.
 * Tries the newer /api/embed endpoint first; falls back to /api/embeddings.
 * Throws on failure — caller is responsible for retry/skip logic.
 */
export async function embed(text) {
  if (!text?.trim()) throw new Error('[embed] empty text supplied')

  // Try Ollama 0.3+ endpoint first
  try {
    const res = await axios.post(
      `${BASE_URL}/api/embed`,
      { model: MODEL, input: text },
      { timeout: TIMEOUT }
    )
    const vector = res.data?.embeddings?.[0] ?? null
    if (!vector?.length) throw new Error('empty embeddings array in /api/embed response')
    return vector
  } catch (primaryErr) {
    // Fall back to legacy endpoint
    try {
      const res = await axios.post(
        `${BASE_URL}/api/embeddings`,
        { model: MODEL, prompt: text },
        { timeout: TIMEOUT }
      )
      if (res.status !== 200) {
        const snippet = JSON.stringify(res.data).slice(0, 200)
        throw new Error(`/api/embeddings returned HTTP ${res.status}: ${snippet}`)
      }
      const vector = res.data?.embedding ?? null
      if (!vector?.length) throw new Error('empty embedding in /api/embeddings response')
      return vector
    } catch (fallbackErr) {
      const msg = fallbackErr.message ?? String(fallbackErr)
      throw new Error(`[embed] model=${MODEL} — ${msg}`)
    }
  }
}
