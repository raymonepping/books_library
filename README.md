# Bibliotheek

Personal book library. Spine view, smart recommendations, ISBN enrichment.

**Stack:** React 19 + Vite 8 + Tailwind 4 · Express 5 · Couchbase 8 · Vault Agent · Ollama (nomic-embed-text)

---

## Architecture

```
Browser
  └─ Nginx :8080          (SPA + /api proxy)
       └─ Express :3000   (REST API)
            ├─ Vault Agent sidecar   → malware_scan_default / haproxy:8210
            ├─ Couchbase             → malware_scan_default / couchbase
            └─ Ollama embeddings     → malware_scan_default / ollama:11434
```

The backend joins the `malware_scan_default` Docker network so it can reach the shared Vault, Couchbase, and Ollama instances without running its own copies.

---

## Prerequisites

- Docker + Compose v2
- `malware_scan_default` network running (vault_reference + shared infra up)
- `library` bucket in Couchbase — run `scripts/cb-init.sh` once
- Vault AppRole credentials — run `vault-setup/vault-setup.sh` once
- `nomic-embed-text` pulled in Ollama — run once:
  ```bash
  docker exec malware_scan-ollama-1 ollama pull nomic-embed-text
  ```

---

## First-time setup

### 1. Vault

```bash
export VAULT_ADDR=http://localhost:8210
export VAULT_TOKEN=<your-root-or-admin-token>
export COUCHBASE_ADMIN_PASSWORD=<vault-admin-CB-password>
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
CB_PASS='&lt;your-couchbase-admin-password&gt;' bash scripts/cb-init.sh
```

This creates the `library` bucket, `library_scope`, all five collections, GSI indexes, and FTS indexes. Safe to re-run.

### 3. Start the stack

```bash
docker compose up -d
```

Open [http://localhost:8080](http://localhost:8080).

---

## Local development (no Docker)

```bash
# Terminal 1 — backend
cd backend
SECRETS_DIR=/tmp/bibliotheek-dev-secrets \
COUCHBASE_CONNSTR=couchbase://localhost \
OLLAMA_BASE_URL=http://localhost:11434 \
/opt/homebrew/bin/node src/app.js

# Terminal 2 — frontend
cd frontend
npm run dev        # http://localhost:5173, proxies /api → :3002
```

Create dev secrets:
```bash
mkdir -p /tmp/bibliotheek-dev-secrets
printf 'CB_USERNAME=Administrator\nCB_PASSWORD=&lt;your-couchbase-admin-password&gt;\n' \
  > /tmp/bibliotheek-dev-secrets/db.env
printf 'GOOGLE_BOOKS_API_KEY=PLACEHOLDER\n' \
  > /tmp/bibliotheek-dev-secrets/external.env
```

---

## API summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/books` | List with filters: `genre`, `status`, `sort`, `page`, `limit` |
| POST | `/api/books` | Create book |
| GET | `/api/books/:id` | Get book |
| PUT | `/api/books/:id` | Update book |
| PATCH | `/api/books/:id/status` | Update status + rating |
| DELETE | `/api/books/:id` | Delete book |
| GET | `/api/authors` | List authors |
| GET | `/api/authors/:id` | Author + series + book count |
| GET | `/api/series` | List series with completion % |
| PUT | `/api/series/:id/books/:order` | Toggle owned |
| GET | `/api/search?q=` | FTS across books + authors |
| GET | `/api/enrich?isbn=` | ISBN → Open Library + Google Books |
| GET | `/api/recommend/book/:id` | Similar books (genre + Ollama) |
| GET | `/api/recommend/author/:id` | Similar authors |
| GET | `/api/dashboard` | Aggregate stats |

---

## Colour palette

| Name | Hex | Use |
|------|-----|-----|
| Noir | `#0d0d0d` | App background |
| Smoke | `#2a2a2a` | Sidebar, cards |
| Blood | `#c0392b` | Add button, "Reading" status |
| Amber | `#e8a020` | Active nav, ratings, selection |
| Steel | `#4a6fa5` | Secondary actions, "Want to read" |
| Ice | `#e8eef2` | Primary text |
