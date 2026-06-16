import { getCluster, getScope } from '../config/couchbase.js'
import { logger } from '../config/logger.js'
import { NotFoundError } from '../utils/errors.js'
import { getEmbedding, cosineSim, buildBookText, buildAuthorText, warmCache, persistEmbedding } from './embeddingService.js'

const KV_BOOKS = 'books'
const KV_AUTHORS = 'authors'

// Number of Tier-1 candidates sent to Ollama for re-ranking
const TIER3_CANDIDATE_LIMIT = 30

// Tier-1: genre overlap score (0–1), normalised by seed genre count
function genreScore(matchedGenres, seedGenreCount) {
  if (!seedGenreCount) return 0
  return matchedGenres / seedGenreCount
}

// Blend Tier-1 and Tier-3 scores.  If Tier-3 is absent the weight is 0.
function blendScore(g1, emb, hasEmbedding) {
  return hasEmbedding ? 0.35 * g1 + 0.65 * emb : g1
}

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------
export async function recommendBooks(bookId, { limit = 10 } = {}) {
  const scope = getScope()
  const cluster = getCluster()

  // 1. Seed book via KV
  let seedDoc
  try {
    seedDoc = await scope.collection(KV_BOOKS).get(bookId)
  } catch {
    throw new NotFoundError('book', bookId)
  }
  const seed = seedDoc.content
  const seedGenres = seed.genres ?? []

  if (!seedGenres.length) {
    return { seedId: bookId, tier: 'none', recommendations: [] }
  }

  // 2. Tier-1 — genre overlap via N1QL (embedding included to avoid extra KV lookups)
  const n1qlResult = await cluster.query(
    `SELECT META(b).id AS id, b.title, b.description, b.genres, b.isbn,
            b.authors, b.coverUrl, b.readStatus, b.rating, b.publishedYear,
            b.subtitle, b.embedding,
            ARRAY_COUNT(ARRAY g FOR g IN b.genres WHEN g IN $seedGenres END) AS genreMatches
     FROM \`library\`.\`library_scope\`.\`books\` b
     WHERE META(b).id != $seedId
       AND ANY g IN b.genres SATISFIES g IN $seedGenres END
     ORDER BY genreMatches DESC
     LIMIT $candidateLimit`,
    {
      parameters: {
        seedId: bookId,
        seedGenres,
        candidateLimit: TIER3_CANDIDATE_LIMIT,
      },
    }
  )
  const candidates = n1qlResult.rows ?? []

  if (!candidates.length) {
    return { seedId: bookId, tier: 'genre', recommendations: [] }
  }

  // 3. Tier-3 — embeddings (use stored vector when available, otherwise call Ollama)
  let tier = 'genre'

  // Use stored vector directly — no cache warming (stored vector may be System B, text is System A)
  let seedVec = seed.embedding?.length ? seed.embedding : null
  if (!seedVec) {
    seedVec = await getEmbedding(buildBookText(seed))
    if (seedVec) persistEmbedding('books', bookId, seedVec).catch(() => {})
  }

  if (seedVec) {
    const embeddings = await Promise.all(
      candidates.map(async c => {
        if (c.embedding?.length) return c.embedding  // use stored vector directly
        const vec = await getEmbedding(buildBookText(c))
        if (vec) persistEmbedding('books', c.id, vec).catch(() => {})
        return vec
      })
    )
    const someEmbedded = embeddings.some(Boolean)
    if (someEmbedded) {
      tier = 'genre+embedding'
      candidates.forEach((c, i) => {
        const g1 = genreScore(c.genreMatches, seedGenres.length)
        const emb = embeddings[i] ? cosineSim(seedVec, embeddings[i]) : 0
        c._score = blendScore(g1, emb, Boolean(embeddings[i]))
      })
      candidates.sort((a, b) => b._score - a._score)
    }
  }

  const recommendations = candidates.slice(0, limit).map(c => {
    const g1 = genreScore(c.genreMatches, seedGenres.length)
    const matchedGenres = seedGenres.filter(g => (c.genres ?? []).includes(g))
    return {
      id: c.id,
      score: Math.round((c._score ?? g1) * 1000) / 1000,
      matchedGenres,
      title: c.title,
      authors: c.authors,
      genres: c.genres,
      coverUrl: c.coverUrl ?? '',
      readStatus: c.readStatus ?? null,
      rating: c.rating ?? null,
      publishedYear: c.publishedYear ?? null,
      isbn: c.isbn ?? '',
    }
  })

  logger.info('[recommend] books', { seedId: bookId, tier, count: recommendations.length })

  return {
    seedId: bookId,
    seedTitle: seed.title,
    tier,
    recommendations,
  }
}

// ---------------------------------------------------------------------------
// For You — personalized feed built from the user's top-rated read books
// ---------------------------------------------------------------------------
export async function forYouRecommendations({ maxSeeds = 5, perSeed = 4 } = {}) {
  const cluster = getCluster()

  // 1. Seeds: fetch a pool of top-rated read books, then shuffle so each visit
  //    surfaces a different combination rather than always the same top-5.
  const poolSize = Math.max(maxSeeds * 3, 15)
  const seedResult = await cluster.query(
    `SELECT META(b).id AS id, b.title, b.authors, b.genres, b.coverUrl,
            b.rating, b.embedding, b.subtitle
     FROM \`library\`.\`library_scope\`.\`books\` b
     WHERE b.readStatus IN ['read', 'finished']
       AND b.genres IS NOT MISSING
       AND ARRAY_LENGTH(b.genres) > 0
     ORDER BY b.rating DESC NULLS LAST, b.addedAt DESC
     LIMIT $poolSize`,
    { parameters: { poolSize } }
  )
  const pool = seedResult.rows ?? []
  if (!pool.length) return { sections: [], reason: 'no-read-books' }

  // Shuffle the pool (Fisher-Yates) and take maxSeeds
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const seeds = pool.slice(0, maxSeeds)

  // 2. Run recommendations for all seeds in parallel
  const seedResults = await Promise.all(
    seeds.map(async seed => {
      try {
        const recs = await recommendBooks(seed.id, { limit: perSeed * 3 })
        return { seed, recs }
      } catch {
        return null
      }
    })
  )

  // 3. Deduplicate: each book shows in at most one section;
  //    only surface unread / want-to-read books (not already-read or currently-reading)
  const SKIP_STATUSES = new Set(['read', 'finished', 'reading'])
  const seen = new Set(seeds.map(s => s.id))
  const sections = []

  for (const entry of seedResults) {
    if (!entry) continue
    const { seed, recs } = entry

    const filtered = (recs.recommendations ?? [])
      .filter(r => !SKIP_STATUSES.has(r.readStatus ?? ''))
      .filter(r => !seen.has(r.id))
      .slice(0, perSeed)

    filtered.forEach(r => seen.add(r.id))

    if (filtered.length > 0) {
      sections.push({
        seed: {
          id: seed.id,
          title: seed.title,
          authors: seed.authors ?? [],
          coverUrl: seed.coverUrl ?? '',
          rating: seed.rating ?? null,
        },
        recommendations: filtered,
        tier: recs.tier,
      })
    }
  }

  return { sections }
}

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------
export async function recommendAuthors(authorId, { limit = 5 } = {}) {
  const scope = getScope()
  const cluster = getCluster()

  // 1. Seed author via KV
  let seedDoc
  try {
    seedDoc = await scope.collection(KV_AUTHORS).get(authorId)
  } catch {
    throw new NotFoundError('author', authorId)
  }
  const seed = seedDoc.content

  // 2. Collect seed author's genres from their books
  const genreResult = await cluster.query(
    `SELECT DISTINCT RAW g
     FROM \`library\`.\`library_scope\`.\`books\` b
     UNNEST b.genres AS g
     WHERE ANY a IN b.authors SATISFIES a.id = $authorId END`,
    { parameters: { authorId } }
  )
  const seedGenres = genreResult.rows ?? []

  // 3. Score other authors: 2pts nationality match + genre-book overlap count
  // SELECT RAW COUNT(1)...[0] extracts the scalar from the subquery array
  const recResult = await cluster.query(
    `SELECT META(a).id AS id, a.name, a.nationality, a.photoUrl, a.bio, a.embedding,
            (CASE WHEN a.nationality = $nationality AND a.nationality != '' AND $nationality != '' THEN 2 ELSE 0 END) AS natScore,
            (SELECT RAW COUNT(1) FROM \`library\`.\`library_scope\`.\`books\` b2
             WHERE ANY auth IN b2.authors SATISFIES auth.id = META(a).id END
               AND ANY g IN b2.genres SATISFIES g IN $seedGenres END)[0] AS bookOverlap
     FROM \`library\`.\`library_scope\`.\`authors\` a
     WHERE META(a).id != $authorId
     ORDER BY natScore DESC, bookOverlap DESC
     LIMIT $candidateLimit`,
    {
      parameters: {
        authorId,
        nationality: seed.nationality ?? '',
        seedGenres,
        candidateLimit: TIER3_CANDIDATE_LIMIT,
      },
    }
  )
  const candidates = recResult.rows ?? []

  if (!candidates.length) {
    return { seedId: authorId, tier: 'genre', recommendations: [] }
  }

  // 4. Tier-3 — embeddings for authors (use stored vector when available)
  let tier = 'genre'

  let seedVec = seed.embedding?.length ? seed.embedding : null
  if (!seedVec) {
    seedVec = await getEmbedding(buildAuthorText(seed))
    if (seedVec) persistEmbedding('authors', authorId, seedVec).catch(() => {})
  }

  if (seedVec) {
    const embeddings = await Promise.all(
      candidates.map(async c => {
        if (c.embedding?.length) return c.embedding  // use stored vector directly
        const vec = await getEmbedding(buildAuthorText(c))
        if (vec) persistEmbedding('authors', c.id, vec).catch(() => {})
        return vec
      })
    )
    const someEmbedded = embeddings.some(Boolean)
    if (someEmbedded) {
      tier = 'genre+embedding'
      const maxG1 = Math.max(...candidates.map(c => c.natScore + c.bookOverlap), 1)
      candidates.forEach((c, i) => {
        const g1 = (c.natScore + c.bookOverlap) / maxG1
        const emb = embeddings[i] ? cosineSim(seedVec, embeddings[i]) : 0
        c._score = blendScore(g1, emb, Boolean(embeddings[i]))
      })
      candidates.sort((a, b) => b._score - a._score)
    }
  }

  const recommendations = candidates.slice(0, limit).map(c => {
    const rawG1 = (c.natScore ?? 0) + (c.bookOverlap ?? 0)
    return {
      id: c.id,
      score: Math.round((c._score ?? rawG1) * 1000) / 1000,
      name: c.name,
      nationality: c.nationality ?? null,
      photoUrl: c.photoUrl ?? '',
      bio: c.bio ?? '',
    }
  })

  logger.info('[recommend] authors', { seedId: authorId, tier, count: recommendations.length })

  return {
    seedId: authorId,
    seedName: seed.name,
    tier,
    recommendations,
  }
}
