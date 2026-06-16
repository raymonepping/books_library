# Bibliotheek — Architecture & Functionality Reference

Personal Dutch book library application. Core goal: track a reading collection and discover books and authors by tone, atmosphere, and subgenre using semantic embeddings.

---

## Stack

| Layer | Technology |
|---|---|
| Database | Couchbase 8.x Enterprise — KV, SQL++, FTS Search |
| Embeddings | Ollama `nomic-embed-text` (768 dims) |
| Profile generation | Ollama `llama3.2` |
| Backend | Node.js ESM, Express 5 |
| Frontend | React 18, React Router, Zustand, Vite |
| Secrets | HashiCorp Vault Agent (renders credentials to `/vault/secrets/`) |
| Containerisation | Docker Compose, shared `malware_scan_default` network |

---

## Couchbase Schema

**Bucket:** `library` / **Scope:** `library_scope`

### Collections

| Collection | Key pattern | Purpose |
|---|---|---|
| `books` | `book::{uuid}` | Book documents |
| `authors` | `author::{slug}` | Author documents — LLM profile stored as `author.profile` sub-object |
| `series` | `series::{slug}` | Series documents |
| `embeddings` | `emb::book::{id}` / `emb::author::{id}` | Shadow embedding records (metadata + profileText) |

> `author_profiles` (previously `profile::author::{slug}`) was dropped. Profile data now lives directly on the author document as `author.profile`.

### Book document shape (key fields)

```json
{
  "id": "book::{uuid}",
  "type": "book",
  "title": "Doodvonnis",
  "language": "nl",
  "description": "...",
  "authors": [{ "id": "author::andreas-gruber", "name": "Andreas Gruber" }],
  "genres": ["thrillers", "spanning"],
  "seriesId": null,
  "readStatus": "read",
  "rating": 5,
  "embedding": [/* 768 floats */],
  "embeddingSource": "enriched",
  "embeddingModel": "nomic-embed-text",
  "embeddedAt": "2026-06-15T..."
}
```

### Author document shape (key fields)

```json
{
  "id": "author::{slug}",
  "type": "author",
  "name": "Jo Nesbø",
  "nationality": "Norwegian",
  "bio": "...",
  "profile": {
    "subgenre": "Nordic noir",
    "tone": ["Dark", "Gritty", "Atmospheric"],
    "protagonistType": "Detective",
    "protagonistName": "Harry Hole",
    "themes": ["Addiction", "Corruption", "Redemption"],
    "pacing": "fast-paced",
    "violenceLevel": "graphic",
    "seriesType": "long-running series",
    "comparableAuthors": ["Stieg Larsson", "Jussi Adler-Olsen"],
    "generatedAt": "2026-06-15T...",
    "modelUsed": "llama3.2"
  },
  "embedding": [/* 768 floats */],
  "embeddingSource": "enriched",
  "embeddingModel": "nomic-embed-text",
  "embeddedAt": "2026-06-15T..."
}
```

### FTS Vector Index

- **Name:** `bibliotheek-vector-index` (global, cluster-level)
- **Field:** `embedding` on both `library_scope.books` and `library_scope.authors`
- **Dimensions:** 768 (`nomic-embed-text`)
- **Similarity:** `dot_product`
- **doc_config mode:** `scope.collection.type_field` (uses `type: "book"` / `type: "author"` field)
- **Query via:** `cluster.search()` — not `scope.search()`

### Data Access Strategy

Use the narrowest Couchbase API that matches the access pattern:

| Access pattern | API | Current examples |
|---|---|---|
| Document ID is known | KV `get`, `exists`, `insert`, `upsert`, `remove` | Book/author/profile lookup, embedding shadow records |
| A few document paths must change | KV sub-document `mutateIn` | Embedding vector and metadata patches |
| An offline job must enumerate a small collection | KV `RangeScan` | Enrichment CLI scans `authors` and `books` once per run |
| Filtering, sorting, aggregation, joins, pagination | SQL++ | Library lists, dashboard statistics, recommendation candidate selection |
| Semantic nearest-neighbour search | FTS vector search | Similar books/authors and Librarian retrieval |

The enrichment pipeline is intentionally KV-first:

- Full runs create one in-memory enrichment context from one `RangeScan` of `authors` and one of `books`.
- Books are grouped or filtered by author in memory, avoiding one SQL++ query per author.
- `--author <id>` resolves the author with a direct KV `get`; books are scanned once because their IDs are not known in advance.
- `--book <id>` uses direct KV reads only.
- Books-only mode scans only `books`.
- Range scans are appropriate here because this is an offline, low-concurrency job over a small collection. User-facing filtered and paginated routes remain SQL++.

SQL++ reserved identifiers must be escaped with backticks when explicitly projected. For example, the book field is `b.\`language\``. KV reads do not have this parser concern because they return the JSON document directly.

Reference: [Couchbase Node.js SDK Data Operations](https://docs.couchbase.com/nodejs-sdk/current/howtos/kv-operations.html).

---

## Backend

### Service Map

```
backend/src/
├── app.js                    Entry point — Express setup, route wiring
├── config/
│   ├── env.js                Zod-validated env schema (OLLAMA_EMBED_MODEL, OLLAMA_EMBED_DIMS, etc.)
│   ├── couchbase.js          Couchbase connection singleton
│   └── logger.js             Winston structured logger
├── routes/
│   ├── books.js              CRUD + status patch + facets
│   ├── authors.js            CRUD + OpenLibrary enrichment trigger
│   ├── series.js             Series CRUD
│   ├── search.js             Full-text search (N1QL LIKE)
│   ├── recommend.js          Book + author + "For You" recommendations
│   ├── similarity.js         kNN vector similarity (FTS), on-demand enrichment trigger
│   ├── librarian.js          AI chat endpoint
│   ├── admin.js              Backfill embeddings, batch author enrichment
│   ├── enrich.js             ISBN + author metadata lookup (OpenLibrary)
│   ├── covers.js             Cover image proxy + local storage
│   ├── collections.js        Genre / tag facets
│   └── dashboard.js          Stats, charts, heatmap
└── services/
    ├── bookService.js         Book CRUD + series sync + on-save embedding trigger
    ├── authorService.js       Author CRUD + ensureAuthors helper
    ├── seriesService.js       Series management
    ├── searchService.js       N1QL full-text search across books + authors
    ├── recommendService.js    Tiered recommendation engine (see below)
    ├── librarianService.js    RAG pipeline: embed query → kNN → Ollama chat
    ├── embeddingService.js    System A embedding (on-save, simple text)
    ├── enrichService.js       OpenLibrary API client (ISBN, author metadata)
    └── coverService.js        Cover download + local storage
└── embedding/
    ├── embed.js               Single Ollama embed implementation (throws on failure)
    ├── bookProfileBuilder.js  System B text builders (12-field, profile-enriched)
    ├── profileGenerator.js    LLM author profile generation via llama3.2
    └── enrichWorker.js        System B orchestrator: profiles → author.profile, embeddings CLI pipeline
```

### Two Embedding Systems

#### System A — On-Save (simple)
- Triggered by: `bookService.js::scheduleBookEmbedding()` on every create/update of semantic fields (`title`, `subtitle`, `authors`, `genres`, `description`)
- Text builder: `embeddingService.js::buildBookText()` — title, language, subtitle, author names, genres, description (joined with `. `)
- Writes: `embedding`, `embeddingSource: 'basic'`, `embeddingModel`, `embeddedAt` via `mutateIn`
- **Guard:** skips if `doc.embeddingSource === 'enriched'` — never overwrites a System B vector
- Also triggered by: `admin.js::backfill-embeddings` HTTP endpoint

#### System B — CLI Enrichment (rich)
- Triggered by: `npm run enrich:local` / `node scripts/enrich.js`
- Text builders: `bookProfileBuilder.js::buildBookEmbedText()` (14 fields including profile) and `buildAuthorEmbedText()` (12 fields)
- Profile: `profileGenerator.js` generates structured JSON via `llama3.2` (subgenre, tone, themes, pacing, violenceLevel, comparableAuthors, etc.)
- Reads: direct KV operations for known IDs and one-time KV range scans for full collection enumeration
- Writes: `embedding`, `embeddingSource: 'enriched'`, `embeddingModel`, `embeddedAt` via `mutateIn` — **both** on source doc and in `embeddings` shadow collection
- Also writes: `profile` sub-object directly onto the author document via `mutateIn` — no separate collection

**Key rule:** `embeddingSource: 'enriched'` is the guard that keeps System B vectors safe after a book edit.

### Recommendation Engine (`recommendService.js`)

Three-tier scoring for books:

| Tier | Signal | Weight |
|---|---|---|
| Tier 1 | Genre overlap (N1QL count) | 35% when embedding available, 100% otherwise |
| Tier 3 | Embedding cosine similarity (in-memory, using stored `doc.embedding`) | 65% |

Flow:
1. N1QL fetches up to 30 genre-overlapping candidates (embedding field included inline)
2. For each candidate, uses stored `doc.embedding` directly — no cache warming (stored vector is System B, key-based cache would map it to System A text, which is a semantic mismatch)
3. Falls back to on-demand System A embed only when no stored vector exists
4. Blends genre score + cosine similarity → sorts → trims to `limit`

For You (`/recommend/for-you`):
1. Queries up to 5 highest-rated read books as seeds
2. Runs `recommendBooks` for each seed in parallel
3. Deduplicates (each book in at most one section), filters already-read/reading
4. Returns sections: `{ seed, recommendations[], tier }`

Author recommendations:
1. Collects seed author's genres from their books (N1QL)
2. Scores all other authors: nationality match (2pts, requires non-empty nationality on both sides) + genre-book overlap count
3. Blends with embedding cosine similarity if available

### Librarian / RAG Pipeline (`librarianService.js`)

1. User message is embedded via `embeddingService.js::getEmbedding()` (→ `embed.js::embed()`)
2. kNN search on `bibliotheek-vector-index` via `cluster.search()` — returns up to 20 candidates
3. Top 10 books + top 5 authors fetched by KV
4. Context block injected into Ollama system prompt:
   ```
   CATALOG CONTEXT (use ONLY these items):
   BOOKS IN THE CATALOG (most relevant first):
   - "Title" (year) by Author — genres [status] ★rating/5
     "description excerpt..."
   AUTHORS IN THE CATALOG:
   - Name (nationality) — bio excerpt
   ```
5. Multi-turn chat via `/api/chat` with `llama3.2`, last 10 turns of history
6. Returns `{ reply, sources[] }` — sources are real catalog items surfaced in context
7. System prompt enforces: Dutch response for Dutch input, English for English, never invent catalog content

---

## Frontend

### Pages

| Page | Route | Purpose |
|---|---|---|
| BooksPage | `/books` | Main library with spine/grid/list views, filters, bulk actions |
| AuthorsPage | `/authors` | Paginated author grid with autocomplete filter |
| AuthorProfilePage | `/authors/:id` | Author bio, library books, similar authors |
| SeriesPage | `/series` | Series cards with completion tracking, bol.com shopping links |
| DiscoverPage | `/discover` | Search + "For You" seeded recommendations + similarity panel |
| DashboardPage | `/dashboard` | Stats, charts (monthly reading, rating histogram, genre breakdown), heatmap |
| LibrarianPage | `/librarian` | AI chat with source attribution |

### State Architecture

**Zustand store — `useLibraryStore`** (data):
- `books[]`, `totalBooks`, pagination, filters, loading states
- `fetchBooks()`, `upsertBook()`, `removeBook()`, `scheduleDelete()` (5s undo)
- `authors[]`, `fetchAuthors()`

**Zustand store — `useUIStore`** (transient + persisted):
- `booksView` ('spine'|'grid'|'list'), `booksDensity` — persisted to `localStorage`
- `sidebarCollapsed`, `mobileDrawerOpen`, `addBookOpen`, `searchOpen`
- `toasts[]` — notification queue with auto-dismiss

### API Client Pattern

All API calls go through a typed service layer. Components never call `fetch` directly.

```
frontend/src/api/
├── client.js     Base fetch wrapper (Bearer token, error handling, AbortController support)
├── books.js      booksApi — list, get, create, update, updateStatus, delete, recommend, forYou
├── authors.js    authorsApi — list, get, update, recommend
├── series.js     seriesApi — list, create, update, delete, markOwned
├── search.js     searchApi — search (q, type, page, limit)
└── dashboard.js  dashboardApi — getStats, getCharts, getHeatmap
```

Exception: `LibrarianPage` calls `/api/librarian/chat` directly with `fetch`.

### Discovery Flow

```
DiscoverPage
  ├── Search tab
  │     └── GET /api/search?q={query}&type={books|authors}
  └── For You tab
        ├── GET /api/recommend/for-you?seeds=5&perSeed=4
        │     → sections: [{ seed, recommendations[], tier }]
        └── On "Find similar" click → slide-in panel
              └── GET /api/recommend/book/{id}?limit=8
                    → { tier, recommendations[], seedTitle }

AuthorProfilePage
  └── GET /api/recommend/author/{id}?limit=4
```

---

## Enrichment CLI (`backend/scripts/enrich.js`)

### What it does

1. **Ollama health check** — verifies `nomic-embed-text` and `llama3.2` are pulled before starting
2. **KV context load** — scans the required collections once and sorts the results in memory
3. **Pass 1 — Authors** (🤓): for each author, generates an LLM profile (if missing) then embeds 12-field text
4. **Pass 2 — Books** (📕): for each book, loads the author's document and profile by key and embeds 14-field text including language and Dutch description

Both passes write `embedding`, `embeddingSource: 'enriched'`, `embeddingModel`, `embeddedAt` directly to the source document via `mutateIn`.

### Couchbase operations

| Operation | Implementation |
|---|---|
| Enumerate authors/books | `collection.scan(new couchbase.RangeScan())` |
| Resolve one author/book/profile | `collection.get(key)` |
| Check embedding shadow record | `collection.exists(key)` |
| Store profile or shadow embedding | `collection.upsert(key, document)` |
| Patch source embedding fields | `collection.mutateIn(key, specs)` |

The CLI no longer uses SQL++ to retrieve enrichment documents. The connection layer still uses `SELECT 1 AS ok` as a query-service health check; this is not part of document retrieval.

### Flags

| Flag | Effect |
|---|---|
| _(none)_ | Enrich all missing embeddings (skip already-enriched) |
| `--force` | Re-enrich everything, overwrite all vectors |
| `--author <id>` | Single author + their books |
| `--name <str>` | Author by name substring (fails on multiple matches) |
| `--book <id>` | Single book (requires author profile to already exist) |
| `--authors-only` | Authors only, skip books |
| `--books-only` | Books only, skip authors |
| `--dry-run` | Show counts + list, write nothing |
| `--help` | Usage |

### npm scripts (from `backend/`)

```bash
npm run enrich:local           # missing only, localhost endpoints
npm run enrich:local:force     # force all, localhost endpoints
npm run enrich                 # Docker (uses couchbase/ollama service names)
npm run enrich:force           # Docker force
npm run enrich:dry             # Docker dry-run
```

### Progress output format

```
Bibliotheek enrichment
──────────────────────
Mode    : all missing
Authors : 39 total — 12 to process, 27 skipped
Books   : 123 total — 34 to process, 89 skipped

🤓 [1/12]  Jo Nesbø          profile ✓  embedding ✓
🤓 [2/12]  M.J. Arlidge      profile —  embedding ✓  (profile skipped — exists)
...
📕 [1/34]  Doodvonnis        embedding ✓  lang: nl
📕 [2/34]  Harry Hole        embedding ✓  lang: nl
...

──────────────────────
Done in 4m 12s
Authors : 12 processed (0 errors)
Profiles: 8 generated, 4 skipped
Books   : 34 embedded (0 errors)
```

---

## Data Flow — Book Added

```
User adds book via UI
  → POST /api/books
  → bookService.createBook()
  → col().insert(id, doc)  [embedding: null]
  → scheduleBookEmbedding(id, doc)  [fire-and-forget]
      → if doc.embeddingSource === 'enriched': skip
      → buildBookText(doc)  [System A: 5 fields]
      → getEmbedding(text) → embed.js::embed() → Ollama
      → persistEmbedding('books', id, vec, 'basic')
          → mutateIn: embedding, embeddingSource: 'basic', embeddingModel, embeddedAt
```

## Data Flow — Enrichment CLI (System B)

```
npm run enrich:local:force
  → checkOllama()
  → connectCouchbase()
  → createEnrichmentContext()
      → KV RangeScan authors (once)
      → KV RangeScan books (once)
      → sort authors/books in memory
  → Pass 1: for each author
      → filter context.books by authors[].id in memory
      → generateAuthorProfile(authorDoc, knownTitles) → llama3.2 → profile JSON
      → mutateIn('authors', id, upsert('profile', profileDoc))  ← stored on author doc
      → buildAuthorEmbedText(author, profile)  [12 fields, truncated to 6000 chars]
      → embed() → nomic-embed-text → 768-dim vector
      → patchDocEmbedding('authors', id, vec)
          → mutateIn: embedding, embeddingSource: 'enriched', embeddingModel, embeddedAt
      → upsertEmbedding() → embeddings shadow collection
  → Pass 2: for each book
      → KV get author doc + profile from author_profiles
      → buildBookEmbedText(book, author, profile)  [14 fields, Dutch description last]
      → embed() → nomic-embed-text → 768-dim vector
      → patchDocEmbedding('books', id, vec)
      → upsertEmbedding() → embeddings shadow collection
```

## Data Flow — Similarity Search

```
GET /api/similarity/book/:id
  → similarityQuery.findSimilarBooks(bookId)
  → scope.collection('books').get(bookId)  → doc.embedding (source vector)
  → cluster.search('bibliotheek-vector-index', VectorQuery on 'embedding')
  → filter rows by r.id.startsWith('book::')
  → KV get each result for title/author/cover
  → return [{ bookId, score, title, author, coverUrl, readStatus, rating }]
```

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `COUCHBASE_CONNSTR` | `couchbase://couchbase` | Couchbase connection string |
| `COUCHBASE_BUCKET` | `library` | Bucket name |
| `COUCHBASE_SCOPE` | `library_scope` | Scope name |
| `OLLAMA_BASE_URL` | `http://ollama:11434` | Ollama service URL |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model |
| `OLLAMA_EMBED_DIMS` | `768` | Embedding dimensions (must match FTS index) |
| `OLLAMA_PROFILE_MODEL` | `llama3.2` | Profile generation model |
| `EMBED_BATCH_SIZE` | `10` | Authors per batch in enrichment pipeline |
| `EMBED_CONCURRENCY` | `2` | Parallel Ollama requests |
| `API_TOKEN` | _(empty)_ | Bearer token for mutation endpoints (optional) |

Local dev: credentials in root `.env`. Docker: rendered from Vault Agent into `/vault/secrets/db.env`.
