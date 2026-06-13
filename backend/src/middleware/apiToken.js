import { config } from '../config/env.js'

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// If API_TOKEN is not configured this middleware is a no-op — dev-friendly.
export function apiToken(req, res, next) {
  if (!config.API_TOKEN) return next()
  if (!MUTATION_METHODS.has(req.method)) return next()

  const header = req.headers['authorization'] ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (token !== config.API_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }
  next()
}
