import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV:             z.string().default('development'),
  PORT:                 z.coerce.number().default(3000),

  // Vault Agent writes rendered secrets here; override for local dev
  SECRETS_DIR:          z.string().default('/vault/secrets'),
  VAULT_ADDR:           z.string().default('http://haproxy:8210'),
  VAULT_NAMESPACE:      z.string().default(''),

  // Couchbase — credentials come from Vault Agent, not here
  COUCHBASE_CONNSTR:    z.string().default('couchbase://couchbase'),
  COUCHBASE_BUCKET:     z.string().default('library'),
  COUCHBASE_SCOPE:      z.string().default('library_scope'),

  // Ollama
  OLLAMA_BASE_URL:      z.string().url().default('http://ollama:11434'),
  OLLAMA_EMBED_MODEL:   z.string().default('nomic-embed-text'),
  OLLAMA_EMBED_DIMS:    z.coerce.number().default(768),
  OLLAMA_PROFILE_MODEL: z.string().default('llama3.2'),

  // Embedding pipeline
  EMBED_BATCH_SIZE:     z.coerce.number().default(10),
  EMBED_CONCURRENCY:    z.coerce.number().default(2),

  // Public URLs
  BACKEND_PUBLIC_URL:   z.string().default('http://localhost:3002'),
  FRONTEND_PUBLIC_URL:  z.string().default('http://localhost:8080'),

  // Logging
  LOG_LEVEL:            z.enum(['error','warn','info','http','verbose','debug','silly']).default('info'),
  CONTAINER_NAME:       z.string().default('bibliotheek-backend'),

  // API token — if set, all mutation requests (POST/PUT/PATCH/DELETE) require
  // Authorization: Bearer <token>. Leave empty to disable (local dev default).
  API_TOKEN:            z.string().default(''),
})

export const config = schema.parse(process.env)
export const isProduction = config.NODE_ENV === 'production'
