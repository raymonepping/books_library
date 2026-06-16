import { Router } from 'express'
import { chat }   from '../services/librarianService.js'

const router = Router()

// POST /api/librarian/chat
router.post('/chat', async (req, res) => {
  const { message, history } = req.body
  if (!message?.trim()) {
    return res.status(400).json({ success: false, error: 'message is required' })
  }
  const result = await chat(message.trim(), Array.isArray(history) ? history : [])
  res.json({ success: true, data: result })
})

export default router
