# Bibliotheek — Optimization Roadmap

Based on full codebase review (backend + frontend + enrichment pipeline) as of 2026-06-15.

Items are grouped by subsystem and ordered by impact within each group.

---

## 1. Recommendation Engine (`recommendService.js`) — HIGH IMPACT

### 1.1 Book recommend uses System A text to key the cache (BUG-LEVEL) — COMPLETED 2026-06-15

**Problem:** After System B enrichment, `doc.embedding` on book documents contains a 768-dim vector built from 14-field profile-enriched text. `recommendBooks()` correctly uses this stored vector for cosine similarity. But when computing the **seed** book's embedding, it called `buildBookText(seed)` (System A, 5-field) to warm the in-memory cache — mapping a System B vector to a System A text key, a semantic mismatch.

**Fix applied:** Stored vectors (`seed.embedding`, `c.embedding`) are now used directly without cache warming. Falls back to on-demand `getEmbedding(buildBookText(...))` only when no stored embedding exists. Same fix applied to candidate books and to `recommendAuthors`. `warmCache` is no longer called from `recommendService.js`.

### 1.2 Genre filter blocks cross-genre similar books

**Problem:** `recommendBooks()` requires `ANY g IN b.genres SATISFIES g IN $seedGenres END`. A book with no overlapping genres is never considered, even if its embedding is semantically similar (e.g., a psychological thriller and a literary crime novel may be in different genre tags but very close in embedding space).

**Impact:** On a small library (<200 books), the genre filter can reduce the candidate pool to <5 books, making recommendations feel repetitive.

**Fix:** Add a fallback path when the genre-filtered candidate count is low:

```js
if (candidates.length < 5 && seedVec) {
  // Fall back to pure kNN via FTS vector index
  const knnResults = await cluster.search('bibliotheek-vector-index', ...)
  // merge, deduplicate
}
```

### 1.3 Author nationality empty string scores 2 pts — COMPLETED 2026-06-15

**Problem:** `recommendAuthors()` awarded `natScore = 2` for nationality match. Authors with `nationality: ""` all matched each other, inflating their score.

**Fix applied:**

```sql
CASE WHEN a.nationality = $nationality AND $nationality != '' AND a.nationality != '' THEN 2 ELSE 0 END
```

### 1.4 N1QL candidate query fetches 768 floats × 30 rows inline

**Problem:** The genre candidate query selects `b.embedding` — 768 floats per row × 30 candidates = ~87KB per request, returned as JSON. This is a significant over-fetch since most candidates already have stored embeddings.

**Fix:** Fetch embedding field only if cosine similarity will be computed. Since all enriched books have stored embeddings, restructure to:
1. N1QL query: select book metadata fields only (no embedding), order by genre overlap
2. Batch KV `lookupIn` on `embedding` field only for top candidates
3. Compute cosine

This reduces N1QL response size significantly and allows N1QL projection to be cached more easily by the query service.

### 1.5 No caching for `forYouRecommendations`

**Problem:** Every Discover page load triggers `/recommend/for-you` → N1QL seed query + 5× `recommendBooks()` (each with its own N1QL). This is 6–11 queries per page load.

**Fix:** Add a short TTL in-process cache (5–10 min) keyed on nothing (personal library doesn't change often). A simple module-level `{ data, ts }` object is sufficient.

---

## 2. Embedding Alignment (`recommendService.js` + `similarityQuery.js`) — MEDIUM IMPACT

### 2.1 Two similarity systems with different semantics

**Problem:** 
- `/api/recommend/*` — in-memory cosine similarity (uses N1QL, no FTS index)
- `/api/similarity/*` — FTS vector index kNN search

Both answer "find similar books/authors" but via different mechanisms. The `recommendService` only considers books with genre overlap; `similarityQuery` considers all indexed documents with any proximity in embedding space. They return different results for the same query.

**Recommendation:** Keep both — they serve different UX needs. But make their semantics explicit:
- `/recommend` = "books you might want to add to your library" (genre-filtered, recommendation-focused)
- `/similarity` = "books with similar semantic fingerprint" (pure vector, no genre filter)

Currently the Discover page uses `/recommend` and the AuthorProfile page also uses `/recommend/author`. The similarity routes are not surfaced in the frontend at all. Consider exposing similarity on book detail panels.

### 2.2 `librarianService` uses `getEmbedding` (System A) for query embedding

**Problem:** The librarian embeds user queries with `getEmbedding()` (which calls `embed.js` with the raw user text). The FTS index contains System B embeddings (built from 14-field structured text). Query and index are both produced by `nomic-embed-text` so model alignment is correct, but the query semantics are informal text while indexed documents are structured.

**Status:** This is inherent to RAG — user queries are always informal. The dot product similarity still works. No change needed, but adding a query expansion step (rewrite query as structured fields before embedding) would improve recall for vague queries like "een spannende thriller".

---

## 3. Enrichment Pipeline — MEDIUM IMPACT

### 3.1 No `embeddedAt` staleness check

**Problem:** Books enriched before a description was added, or before the FTS index was rebuilt at 768 dims, have vectors that may not reflect current document state. There is no automatic detection of stale embeddings.

**Fix:** Add a background route or CLI flag `--stale-check` that queries:

```sql
SELECT META(b).id FROM books b
WHERE b.embeddedAt IS NOT MISSING
  AND b.updatedAt > b.embeddedAt
```

Books updated after their embedding was generated are candidates for re-enrichment.

### 3.2 KV-first enrichment data loading — COMPLETED 2026-06-15

**Previous problem:** Full enrichment used SQL++ to enumerate authors, query books once per author, count books, and query all books again for pass 2. This created an N+1 query pattern and exposed the worker to SQL++ reserved-word parsing failures around `language`.

**Implemented:**

- Full runs load `authors` and `books` once with KV `RangeScan`.
- `processAuthor` filters the in-memory book set by `authors[].id`.
- Single-book mode uses direct KV `get`.
- Exact-author mode uses direct KV `get` for the author and one book scan.
- Books-only mode scans only the books collection.
- Profiles and source documents use KV `get`, `exists`, `upsert`, and `mutateIn`.
- The `language` field is now read directly from the full JSON document, so no SQL++ projection or reserved-word alias is required.

**Validation:** Full force dry-run returned 39 authors and 123 books; books-only returned 123 books; targeted Victoria Selman returned one author and one book.

### 3.3 Author `nationality` empty string in embed text

**Problem:** `buildAuthorEmbedText` correctly omits `Nationality:` when `profile.nationality` is falsy. But System A's `buildAuthorText` includes `"${doc.nationality} author"` — which produces `" author"` when nationality is empty string, since `doc.nationality ? ...` is falsy for empty string.

Wait — this is correct. `doc.nationality ? ...` evaluates to null for `""`. So empty nationality is already handled. No action needed.

### 3.4 Single run cannot be resumed

**Problem:** If enrichment is interrupted mid-run (Ollama crash, network blip), the next run without `--force` re-skips the embedding check against the `embeddings` collection. Authors that completed before the crash won't be re-processed. But books for those authors may not have been embedded. There's no per-book skip check in the author pass (step 4 checks `embeddingExists(book.id)` against the `embeddings` collection, which is correct).

**Status:** Resumability already works for books via `embeddingExists`. No change needed unless the `embeddings` collection is cleaned between runs.

### 3.5 Range-scan scalability boundary

**Current status:** KV range scans are a good fit for the current personal-library dataset and offline CLI workload. The worker materializes scanned documents in memory to avoid repeated SQL++ queries.

**Revisit when:** Collections grow into tens of thousands of documents, enrichment runs overlap, or memory becomes material. At that point, use paged SQL++ projections, key-prefix scans, or a persisted work queue rather than loading the full collections.

---

## 4. Frontend — LOW-MEDIUM IMPACT

### 4.1 Discover "For You" has no loading skeleton

**Problem:** `forYouRecommendations` takes 2–5s on first load (multiple N1QL queries). The Discover page shows a spinner until data arrives, rather than skeleton cards that match the eventual layout.

**Fix:** Add `SkeletonCard` rows in the For You section while loading.

### 4.2 Book recommend re-fetches on every hover

**Problem:** In `DiscoverPage`, clicking "Find similar" on any book fires `GET /api/recommend/book/:id`. There is no client-side cache for recommendation results. Clicking the same seed book twice makes two identical API calls.

**Fix:** Cache results in a `useRef` or Zustand slice keyed on `bookId`. TTL 5 min.

### 4.3 Librarian sources link to `/books?highlight={id}` but that param is not handled

**Problem:** Librarian source badges link to `/books?highlight=book::uuid`. `BooksPage` has no logic to highlight or scroll to a specific book.

**Fix:** Read `highlight` from URL params in BooksPage. After load, scroll to and briefly flash the matched book card.

### 4.4 No embedding status indicator

**Problem:** Books and authors that haven't been enriched yet (`embeddingSource !== 'enriched'`) produce lower-quality recommendations and won't appear in similarity searches. There is no UI indication of enrichment status.

**Fix (light):** Small indicator badge on book/author cards when `embeddingSource === 'basic'` or `embedding` is null. Could be as subtle as a dim sparkle icon. Add to `BookDetailPanel` and `AuthorProfilePage`.

---

## 5. Architecture — LOW IMPACT

### 5.1 `embeddingSource: 'enriched'` guard not applied to author embeddings

**Problem:** `bookService.js::scheduleBookEmbedding()` guards against overwriting enriched book embeddings. There is no equivalent guard for authors. `authorService.js` may call `persistEmbedding('authors', ...)` via admin routes after metadata updates, which now writes `embeddingSource: 'basic'` and could downgrade an enriched author embedding.

Check: `admin.js::enrich-authors` was fixed to call `runEnrichment({ authorId, force: true })` instead of `persistEmbedding` directly. So the HTTP-triggered author re-embed now goes through System B and writes `'enriched'`. However, `authorService.js` CRUD operations don't call `persistEmbedding` at all — only `bookService.js` has the on-save trigger. So author embeddings are only generated via explicit enrichment, not on-save. No immediate risk, but worth noting.

### 5.2 `embeddings` shadow collection and source doc are separate writes

**Problem:** `enrichWorker.js` writes the embedding twice per document: once to `embeddings` collection (via `upsertEmbedding`) and once to the source doc (via `patchDocEmbedding`). If the first write succeeds and the second fails, they are out of sync. The FTS index only reads from the source doc; author-pass skip logic uses KV `exists()` against the shadow collection, while books-only filtering uses the scanned source document's `embedding` field.

**Risk:** Low — both writes are to the same Couchbase cluster and both use KV (fast). A crash between the two would just mean the source doc has a stale vector (or null) while the shadow collection says it's done. The `--force` flag fixes this.

**Fix (optional):** Use a single `mutateIn` to write to the source doc only. Remove `upsertEmbedding` and check skip logic directly on `doc.embedding` length. Phase 3 of the build prompt considered this but preserved the shadow collection for CLI skip logic (O(1) per-document check without loading embeddings). Acceptable as-is.

---

## Priority Order

| # | Item | Effort | Impact |
|---|---|---|---|
| ~~1~~ | ~~Fix `warmCache` key mismatch in `recommendService.js`~~ | ~~30min~~ | ~~High~~ — **done** |
| ~~2~~ | ~~Fix empty-string nationality giving 2pts in author recommend~~ | ~~15min~~ | ~~Medium~~ — **done** |
| 1 | SQL++ candidate query: remove inline `embedding` field | 1hr | Medium — reduces response payload 30× for genre candidates |
| 2 | Add genre-fallback kNN for small candidate pools | 2hr | Medium — improves recommendations on small libraries |
| 3 | Cache `forYouRecommendations` (5min in-memory TTL) | 30min | Medium — eliminates 6–11 queries per Discover load |
| 4 | Cache `recommendBooks` results client-side | 1hr | Low-medium — avoids duplicate API calls on repeat clicks |
| 5 | Fix librarian source badge link (`highlight` param in BooksPage) | 1hr | Low-medium — currently broken navigation |
| 6 | `embeddedAt` staleness check CLI flag | 2hr | Low — useful after description edits, not critical |
| 7 | Embedding status indicator in UI | 2hr | Low — visibility improvement |

---

## Quick Wins (under 30 min each)

1. **Add `forYouRecommendations` in-memory cache** — add a 10-line module-level cache wrapper (item #3 above)

### Completed

1. **Fix `warmCache` key mismatch** — stored `doc.embedding` (System B) now used directly; no cache warming in `recommendService.js`. Avoids semantic mismatch where a System B vector was stored under a System A text key.
2. **Fix nationality empty-string scoring** — added `AND a.nationality != '' AND $nationality != ''` guard in `recommendAuthors` N1QL.
3. **Merge `author_profiles` into author doc** — LLM-generated profile is now stored as `author.profile` sub-object via `mutateIn`. The `author_profiles` collection is no longer written to and can be dropped. `similarityQuery.js` and the similarity route were updated to read from `author.profile`. `profileGenerator.js` gained a `normalizeProfile()` step that remaps LLM typo field names and trims whitespace from keys, and the prompt was strengthened to suppress hallucinated field names and the `originalLanguage: "Dutch"` error.
4. **KV-first enrichment reads** — replaced enrichment SQL++ document retrieval with direct KV operations and one-time range scans.
5. **Book language enrichment** — full JSON documents now preserve `language` without a reserved-word SQL++ projection.
6. **Enrichment query parsing failure** — removed the failing `b.language` / `AS language` SQL++ projection from the worker.
