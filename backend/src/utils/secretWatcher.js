import fs from 'fs'
import { reconnectCouchbase } from '../config/couchbase.js'
import { clearSecretsCache } from '../config/secrets.js'
import { logger } from '../config/logger.js'

const secretsDir = process.env.SECRETS_DIR || '/vault/secrets'

export function watchSecrets() {
  let debounce = null

  fs.watch(`${secretsDir}/db.env`, () => {
    clearTimeout(debounce)
    debounce = setTimeout(async () => {
      logger.info('[secrets] db.env changed — rotating Couchbase credentials')
      try {
        await reconnectCouchbase()
      } catch (err) {
        logger.error('[secrets] Couchbase reconnect failed', { err: err.message })
      }
    }, 500)
  })

  fs.watch(`${secretsDir}/external.env`, () => {
    logger.info('[secrets] external.env changed — clearing API key cache')
    clearSecretsCache()
  })

  logger.info('[secrets] watching for credential rotation', { dir: secretsDir })
}
