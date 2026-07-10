import { Router }                      from 'express'
import { streamChat }                  from '../services/librarianService.js'
import { logger }                      from '../config/logger.js'

const router = Router()

const MAX_MESSAGE_LENGTH = 2000
const MAX_HISTORY_TURNS = 6
const MAX_HISTORY_ITEM_LENGTH = 1000

// POST /api/librarian/chat  — SSE streaming
router.post('/chat', async (req, res) => {
  const { message, history } = req.body
  
  // Validation
  if (!message?.trim()) {
    return res.status(400).json({ success: false, error: 'Message is required' })
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ success: false, error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` })
  }
  if (history && !Array.isArray(history)) {
    return res.status(400).json({ success: false, error: 'History must be an array' })
  }
  
  // Sanitize history
  const sanitizedHistory = Array.isArray(history)
    ? history
        .slice(-MAX_HISTORY_TURNS * 2) // Last N turns (2 messages per turn)
        .filter(m => m?.role && m?.content && ['user', 'assistant'].includes(m.role))
        .map(m => ({
          role: m.role,
          content: String(m.content).slice(0, MAX_HISTORY_ITEM_LENGTH)
        }))
    : []

  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.flushHeaders()

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  try {
    logger.info('[librarian] stream request', { messageLength: message.length, historyTurns: sanitizedHistory.length / 2 })

    await streamChat(
      message.trim(),
      sanitizedHistory,
      (token)   => send({ type: 'token', token }),
      (sources) => send({ type: 'done',  sources }),
    )
  } catch (err) {
    logger.error('[librarian] stream failed', { err: err.message })
    
    // Map errors to user-friendly messages
    let userMessage = 'Er ging iets mis. Probeer het opnieuw.'
    if (err.message?.includes('timeout') || err.code === 'ECONNABORTED') {
      userMessage = 'De AI reageert langzamer dan verwacht. Probeer het opnieuw.'
    } else if (err.message?.includes('ECONNREFUSED') || err.message?.includes('connect')) {
      userMessage = 'De AI-service is tijdelijk niet beschikbaar. Probeer het later opnieuw.'
    }
    
    send({ type: 'error', error: userMessage })
  } finally {
    res.end()
  }
})

export default router
