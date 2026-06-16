# Bibliotheek

Personal Dutch book library — track your reading collection and discover books and authors by tone, atmosphere, and subgenre using semantic embeddings.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router, Zustand, Vite |
| Backend | Node.js ESM, Express 5 |
| Database | Couchbase 8.x Enterprise — KV, SQL++, FTS |
| Embeddings | Ollama `nomic-embed-text` (768 dims) |
| Profile + chat | Ollama `llama3.2` |
| Secrets | HashiCorp Vault Agent (file-based, `/vault/secrets/`) |
| Reverse proxy | Nginx :8080 → Express :3000 |
| Network | Shared `malware_scan_default` Docker network |

---

## Architecture

```
Browser
  └─ Nginx :8080            (SPA + /api proxy)
       └─ Express :3000      (REST API)
            ├─ Vault Agent sidecar   → malware_scan_default / haproxy:8210
            ├─ Couchbase             → malware_scan_default / couchbase
            └─ Ollama                → malware_scan_default / ollama:11434
```

The backend joins the `malware_scan_default` Docker network — no private copies of Vault, Couchbase, or Ollama are needed.

---

## Prerequisites

- Docker + Compose v2
- `malware_scan_default` network running (shared infra stack up)
- `library` bucket in Couchbase — run `scripts/cb-init.sh` once
- Vault AppRole credentials — run `vault-setup/vault-setup.sh` once
- Both Ollama models pulled:

```bash
docker exec malware_scan-ollama-1 ollama pull nomic-embed-text
docker exec malware_scan-ollama-1 ollama pull llama3.2
```

---

## First-time setup

### 1. Vault

```bash
export VAULT_ADDR=http://localhost:8210
export VAULT_TOKEN=<your-root-or-admin-token>
export COUCHBASE_ADMIN_PASSWORD=<couchbase-admin-password>
export GOOGLE_BOOKS_API_KEY=<your-key-or-PLACEHOLDER>

bash vault-setup/vault-setup.sh
```

Copy the printed `role-id` and `secret-id` into:

```
backend/vault/config/role-id
backend/vault/config/secret-id
```

These files are gitignored — never commit them.

### 2. Couchbase

```bash
CB_PASS='<your-couchbase-admin-password>' bash scripts/cb-init.sh
```

Creates the `library` bucket, `library_scope`, all collections, GSI indexes, and the FTS vector index. Safe to re-run.

### 3. Start

```bash
docker compose up -d
```

Open [http://localhost:8080](http://localhost:8080).

---

## Local development (no Docker)

```bash
# Terminal 1 — backend
cd backend
npm run enrich:local    # or start the API:
COUCHBASE_CONNSTR=couchbase://localhost OLLAMA_BASE_URL=http://localhost:11434 \
  node --env-file=../.env src/app.js

# Terminal 2 — frontend
cd frontend
npm run dev   # http://localhost:5173, proxies /api → :3000
```

Dev secrets file (`../.env` relative to `backend/`):

```env
COUCHBASE_CONNSTR=couchbase://localhost
COUCHBASE_USERNAME=Administrator
COUCHBASE_PASSWORD=<your-password>
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_EMBED_DIMS=768
OLLAMA_PROFILE_MODEL=llama3.2
```

---

## Enrichment pipeline

The enrichment CLI builds rich semantic embeddings for all books and authors using LLM-generated author profiles.

### What it does

1. **Ollama health check** — verifies both models are pulled
2. **Pass 1 — Authors** (🤓): generates a structured profile per author (`llama3.2`) then embeds 12-field text (`nomic-embed-text`). Profile is stored as `author.profile` on the author document.
3. **Pass 2 — Books** (📕): loads the author profile and embeds 14-field text per book including language, subgenre, tone, themes, and Dutch description

Both passes write `embedding`, `embeddingSource: 'enriched'`, `embeddingModel`, and `embeddedAt` directly onto the source document. Books with `embeddingSource: 'enriched'` are never overwritten by the on-save (System A) embedder.

### npm scripts (run from `backend/`)

```bash
npm run enrich:local              # enrich missing only — localhost endpoints
npm run enrich:local:force        # re-enrich everything — localhost endpoints
npm run enrich                    # Docker (couchbase/ollama service names)
npm run enrich:force              # Docker force
npm run enrich:dry                # Docker dry-run
```

### CLI flags (all combinable)

```bash
node scripts/enrich.js                     # missing embeddings only
node scripts/enrich.js --force             # re-enrich everything
node scripts/enrich.js --author <id>       # one author + their books
node scripts/enrich.js --name "nesbo"      # author by name substring
node scripts/enrich.js --book <id>         # one book (author profile must exist)
node scripts/enrich.js --authors-only      # skip books
node scripts/enrich.js --books-only        # skip authors
node scripts/enrich.js --dry-run           # show what would run, no writes
```

---

## API reference

### Books

| Method | Path | Description |
|---|---|---|
| GET | `/api/books` | List — filters: `genre`, `status`, `sort`, `page`, `limit` |
| POST | `/api/books` | Create book |
| GET | `/api/books/:id` | Get book |
| PUT | `/api/books/:id` | Update book |
| PATCH | `/api/books/:id/status` | Update read status + rating |
| DELETE | `/api/books/:id` | Delete book |
| GET | `/api/books/facets` | Available genre + status facets |

### Authors

| Method | Path | Description |
|---|---|---|
| GET | `/api/authors` | List authors |
| GET | `/api/authors/:id` | Author + book count |
| PUT | `/api/authors/:id` | Update author |

### Series

| Method | Path | Description |
|---|---|---|
| GET | `/api/series` | List series with completion % |
| POST | `/api/series` | Create series |
| PUT | `/api/series/:id` | Update series |
| DELETE | `/api/series/:id` | Delete series |
| PUT | `/api/series/:id/books/:order` | Toggle book owned |

### Discovery

| Method | Path | Description |
|---|---|---|
| GET | `/api/search?q=&type=` | Full-text search across books + authors |
| GET | `/api/recommend/book/:id` | Similar books (genre overlap + embedding cosine) |
| GET | `/api/recommend/author/:id` | Similar authors (nationality + genre + embedding) |
| GET | `/api/recommend/for-you` | Personalised sections from top-rated seeds |
| GET | `/api/similarity/book/:id` | kNN vector search — similar books (FTS index) |
| GET | `/api/similarity/author/:id` | kNN vector search — similar authors (FTS index) |
| POST | `/api/similarity/query` | kNN from free-text query |
| GET | `/api/similarity/profile/author/:id` | LLM-generated author profile |

### Librarian

| Method | Path | Description |
|---|---|---|
| POST | `/api/librarian/chat` | RAG chat — embeds query → kNN → `llama3.2` response in input language |

### Enrichment + metadata

| Method | Path | Description |
|---|---|---|
| GET | `/api/enrich?isbn=` | ISBN → Open Library + Google Books metadata |
| GET | `/api/covers/:id` | Serve cached cover image |
| GET | `/api/collections` | Genre + tag collections |

### Dashboard

| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard` | Aggregate stats |
| GET | `/api/dashboard/charts` | Monthly reading + genre breakdown |
| GET | `/api/dashboard/heatmap` | Reading activity heatmap |

### Admin

| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/backfill-embeddings` | System A backfill for missing embeddings |
| POST | `/api/admin/enrich-authors` | OpenLibrary metadata fetch + System B re-embed |

---

## Colour palette

| Name | Hex | Use |
|---|---|---|
| Noir | `#0d0d0d` | App background |
| Smoke | `#2a2a2a` | Sidebar, cards |
| Blood | `#c0392b` | Add button, "Reading" status |
| Amber | `#e8a020` | Active nav, ratings, selection |
| Steel | `#4a6fa5` | Secondary actions, "Want to read" |
| Ice | `#e8eef2` | Primary text |
