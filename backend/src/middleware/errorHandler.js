import { logger } from '../config/logger.js'

// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, next) {
  const status = err.status ?? err.statusCode ?? 500
  const logLevel = status >= 500 ? 'error' : 'warn'
  logger[logLevel]('[error]', { status, message: err.message, path: req.path, ...(status >= 500 && { stack: err.stack }) })
  res.status(status).json({
    success: false,
    error: status === 500 ? 'Internal server error' : err.message,
  })
}
