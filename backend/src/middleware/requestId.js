import crypto from 'node:crypto'

export function requestId(req, res, next) {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID()
  res.setHeader('x-request-id', req.requestId)
  next()
}
