import fs from 'fs'
import { parse } from 'dotenv'
import couchbase from 'couchbase'
import { logger } from './logger.js'
import { config } from './env.js'

const DB_SECRETS = `${config.SECRETS_DIR}/db.env`

let cluster, bucket, scope

function loadCredentials() {
  const parsed = parse(fs.readFileSync(DB_SECRETS))
  return { username: parsed.CB_USERNAME, password: parsed.CB_PASSWORD }
}

export async function connectCouchbase() {
  const { username, password } = loadCredentials()
  cluster = await couchbase.connect(config.COUCHBASE_CONNSTR, {
    username,
    password,
    timeouts: { connectTimeout: 10_000 },
  })
  bucket = cluster.bucket(config.COUCHBASE_BUCKET)
  scope = bucket.scope(config.COUCHBASE_SCOPE)
  logger.info('[couchbase] connected', { bucket: config.COUCHBASE_BUCKET, scope: config.COUCHBASE_SCOPE })
}

export async function reconnectCouchbase() {
  logger.info('[couchbase] rotating credentials — reconnecting...')
  try { await cluster?.close() } catch (_) {}
  await connectCouchbase()
}

export function getScope() { return scope }
export function getCluster() { return cluster }
