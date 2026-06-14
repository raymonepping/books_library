import { logger } from '../config/logger.js'

// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, next) {
  const status = err.status ?? err.statusCode ?? 500
  const logLevel = status >= 500 ? 'error' : 'warn'
  // Avoid 'message' as a meta key — Winston merges it into the log label, hiding the real error
  logger[logLevel]('[error]', {
    status,
    err:  err.message,
    type: err.constructor?.name,
    path: req.path,
    ...(status >= 500 && err.stack && { stack: err.stack }),
  })
  res.status(status).json({
    success: false,
    error: status === 500 ? 'Internal server error' : err.message,
  })
}
