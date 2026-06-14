import { config } from './config/env.js'

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

import { connectCouchbase, getCluster, startHealthPoller } from './config/couchbase.js'
import { watchSecrets } from './utils/secretWatcher.js'
import { logger } from './config/logger.js'
import { requestId } from './middleware/requestId.js'
import { globalLimiter } from './middleware/rateLimit.js'
import requestLogger from './middleware/requestLogger.js'
import errorHandler from './middleware/errorHandler.js'
import { apiToken } from './middleware/apiToken.js'

import booksRouter from './routes/books.js'
import coversRouter from './routes/covers.js'
import authorsRouter from './routes/authors.js'
import seriesRouter from './routes/series.js'
import collectionsRouter from './routes/collections.js'
import searchRouter from './routes/search.js'
import enrichRouter from './routes/enrich.js'
import recommendRouter from './routes/recommend.js'
import dashboardRouter from './routes/dashboard.js'

const app = express()
const PORT = config.PORT

app.set('trust proxy', 1)
app.use(requestId)
app.use(globalLimiter)
app.use(helmet())
app.use(cors({ origin: config.FRONTEND_PUBLIC_URL, credentials: true }))
app.use(express.json())
app.use(requestLogger)
app.use(apiToken)

app.get('/health', async (req, res) => {
  const uptime = process.uptime()
  try {
    const cluster = getCluster()
    if (!cluster) throw new Error('not connected')
    await cluster.query('SELECT 1 AS ok', { timeout: 3_000 })
    res.json({ success: true, data: { status: 'ok', uptime, db: 'ok' } })
  } catch (err) {
    res.status(503).json({ success: false, data: { status: 'degraded', uptime, db: 'error', error: err.message } })
  }
})

app.use('/api/books', booksRouter)
app.use('/api/covers', coversRouter)
app.use('/api/authors', authorsRouter)
app.use('/api/series', seriesRouter)
app.use('/api/collections', collectionsRouter)
app.use('/api/search', searchRouter)
app.use('/api/enrich', enrichRouter)
app.use('/api/recommend', recommendRouter)
app.use('/api/dashboard', dashboardRouter)

app.use((req, res) => {
  res.status(404).json({ success: false, error: `Cannot ${req.method} ${req.path}` })
})

app.use(errorHandler)

async function start() {
  logger.info(`[app] starting in ${config.NODE_ENV} mode`)
  await connectCouchbase()
  startHealthPoller()
  watchSecrets()

  const server = app.listen(PORT, () => logger.info(`[app] listening on :${PORT}`))

  // Graceful shutdown — give in-flight requests 10s to drain
  function shutdown(signal) {
    logger.info(`[app] ${signal} received — shutting down`)
    server.close(async () => {
      logger.info('[app] HTTP server closed')
      try { await getCluster()?.close() } catch (_) {}
      logger.info('[app] Couchbase closed — exiting')
      process.exit(0)
    })
    setTimeout(() => {
      logger.warn('[app] forced exit after timeout')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch((err) => {
  logger.error('[app] startup failed', { err: err.message, stack: err.stack })
  process.exit(1)
})
