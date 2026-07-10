import { Router } from 'express'
import { getProfile, recalculateProfile } from '../services/profileService.js'
import { logger } from '../config/logger.js'

const router = Router()

// Rate limiting for recalculation (max 1 per 60 seconds)
const recalcLastCall = { timestamp: 0 }
const RECALC_COOLDOWN_MS = 60_000

// GET /api/profile
router.get('/', async (req, res) => {
  const profile = await getProfile()
  res.json({ success: true, data: profile })
})

// POST /api/profile/recalculate
router.post('/recalculate', async (req, res) => {
  // Rate limit check
  const now = Date.now()
  if (now - recalcLastCall.timestamp < RECALC_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((RECALC_COOLDOWN_MS - (now - recalcLastCall.timestamp)) / 1000)
    return res.status(429).json({
      success: false,
      error: `Profile recalculation in progress or rate limited. Try again in ${remainingSeconds}s.`
    })
  }
  
  recalcLastCall.timestamp = now
  
  try {
    const profile = await recalculateProfile({ trigger: 'manual' })
    res.json({ success: true, data: profile })
  } catch (err) {
    logger.error('[profile] recalculation request failed', { err: err.message })
    // Reset rate limit on error so user can retry
    recalcLastCall.timestamp = 0
    throw err
  }
})

export default router

// Made with Bob
