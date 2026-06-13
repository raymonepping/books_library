import fs from 'fs'
import { parse } from 'dotenv'
import { config } from './env.js'

const EXTERNAL_SECRETS = `${config.SECRETS_DIR}/external.env`

let cache = null

function load() {
  if (!cache) {
    cache = parse(fs.readFileSync(EXTERNAL_SECRETS))
  }
  return cache
}

export function getGoogleBooksApiKey() {
  return load().GOOGLE_BOOKS_API_KEY
}

export function clearSecretsCache() {
  cache = null
}
