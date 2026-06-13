import rateLimit from 'express-rate-limit'
import { isProduction } from '../config/env.js'

// Skip localhost and Docker bridge IPs to avoid false positives in dev/Docker environments.
// Covers: loopback, Docker Linux bridge (10.x / 172.x), Docker Desktop host gateway (192.168.65.x).
function skipInternal(req) {
  if (!isProduction) return true
  const ip = (req.ip ?? '').replace(/^::ffff:/, '')
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('172.') ||
    ip.startsWith('192.168.65.')
  )
}

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInternal,
})
