import morgan from 'morgan'
import { logger } from '../config/logger.js'
import { isProduction } from '../config/env.js'

morgan.token('requestId', (req) => req.requestId)

const DEV_FORMAT = ':method :url :status :response-time ms — :requestId'

const SILENT = new Set(['/health', '/api/health'])

export default morgan(isProduction ? 'combined' : DEV_FORMAT, {
  stream: logger.stream,
  skip: (req) => SILENT.has(req.path),
})
