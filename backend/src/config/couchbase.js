import fs from 'fs'
import { parse } from 'dotenv'
import couchbase from 'couchbase'
import { logger } from './logger.js'
import { config } from './env.js'

const DB_SECRETS = `${config.SECRETS_DIR}/db.env`

let cluster = null
let bucket  = null
let scope   = null
let reconnecting = false

function loadCredentials() {
  // Env vars take priority (local dev / CI)
  if (process.env.COUCHBASE_USERNAME && process.env.COUCHBASE_PASSWORD) {
    return { username: process.env.COUCHBASE_USERNAME, password: process.env.COUCHBASE_PASSWORD }
  }
  // Vault Agent secrets file (Docker / production)
  const parsed = parse(fs.readFileSync(DB_SECRETS))
  return { username: parsed.CB_USERNAME, password: parsed.CB_PASSWORD }
}

async function connect() {
  const { username, password } = loadCredentials()
  let lastError
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const c = await couchbase.connect(config.COUCHBASE_CONNSTR, {
        username,
        password,
        timeouts: {
          connectTimeout: 15_000,
          kvTimeout:      10_000,
          queryTimeout:   15_000,
        },
      })
      // Verify the connection is actually usable before accepting it
      await c.query('SELECT 1 AS ok')
      cluster = c
      bucket  = cluster.bucket(config.COUCHBASE_BUCKET)
      scope   = bucket.scope(config.COUCHBASE_SCOPE)
      logger.info('[couchbase] connected', {
        bucket: config.COUCHBASE_BUCKET,
        scope:  config.COUCHBASE_SCOPE,
        attempt,
      })
      return
    } catch (err) {
      lastError = err
      logger.warn('[couchbase] connection attempt failed', { attempt, err: err.message })
      await new Promise(r => setTimeout(r, Math.min(1_000 * attempt, 5_000)))
    }
  }
  throw lastError
}

export async function connectCouchbase() {
  await connect()
}

export async function reconnectCouchbase() {
  if (reconnecting) return
  reconnecting = true
  logger.info('[couchbase] rotating credentials — reconnecting...')
  try {
    try { await cluster?.close() } catch (_) {}
    cluster = null
    bucket  = null
    scope   = null
    await connect()
  } finally {
    reconnecting = false
  }
}

// Periodic health check — detects stale connections the SDK doesn't self-heal
export function startHealthPoller(intervalMs = 30_000) {
  const timer = setInterval(async () => {
    if (reconnecting) return
    try {
      if (!cluster) throw new Error('no cluster object')
      await cluster.query('SELECT 1 AS ok', { timeout: 5_000 })
    } catch (err) {
      logger.warn('[couchbase] health check failed — attempting reconnect', { err: err.message })
      try {
        await reconnectCouchbase()
        logger.info('[couchbase] reconnected after health check failure')
      } catch (reconnErr) {
        logger.error('[couchbase] reconnect failed', { err: reconnErr.message })
      }
    }
  }, intervalMs)
  // Don't keep the process alive just for the poller
  timer.unref()
}

export function getScope() {
  if (!scope) throw new Error('Couchbase not connected')
  return scope
}

export function getCluster() {
  if (!cluster) throw new Error('Couchbase not connected')
  return cluster
}
