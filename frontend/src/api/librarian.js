const API_BASE = import.meta.env.VITE_API_URL || ''
const API_TOKEN = import.meta.env.VITE_API_TOKEN || ''

/**
 * Stream chat with the librarian using Server-Sent Events
 * @param {string} message - User message
 * @param {Array} history - Conversation history
 * @param {Function} onToken - Callback for each token
 * @param {Function} onDone - Callback when done with sources
 * @param {Function} onError - Callback for errors
 * @param {AbortSignal} signal - Abort signal for cancellation
 */
export async function streamLibrarianChat(message, history, onToken, onDone, onError, signal) {
  const response = await fetch(`${API_BASE}/api/librarian/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
    },
    body: JSON.stringify({ message, history }),
    signal,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue
        
        try {
          const data = JSON.parse(line.slice(6))
          
          if (data.type === 'token' && data.token) {
            onToken(data.token)
          } else if (data.type === 'done' && data.sources) {
            onDone(data.sources)
          } else if (data.type === 'error') {
            onError(new Error(data.error || 'Unknown error'))
          }
        } catch (err) {
          console.warn('Failed to parse SSE message:', line, err)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// Made with Bob
