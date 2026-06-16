import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Search, X, Sparkles, ArrowRight, BookOpen } from 'lucide-react'
import { searchApi } from '../api/search.js'
import { booksApi } from '../api/books.js'
import Spinner from '../components/ui/Spinner.jsx'
import Badge from '../components/ui/Badge.jsx'
import { coverPlaceholder } from '../utils/coverPlaceholder.js'
import { authorNames } from '../utils/authors.js'
import { spineColor } from '../components/BookViews/spineUtils.js'

const TYPE_TABS = [
  { value: '',        label: 'All'     },
  { value: 'books',   label: 'Books'   },
  { value: 'authors', label: 'Authors' },
]

const DEBOUNCE_MS = 320
const MIN_CHARS = 2

export default function DiscoverPage() {
  const location = useLocation()

  const [query, setQuery]         = useState('')
  const [type, setType]           = useState('')
  const [results, setResults]     = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState(null)

  const [seedBook, setSeedBook]       = useState(null)
  const [recs, setRecs]               = useState(null)
  const [recsLoading, setRecsLoading] = useState(false)

  const inputRef    = useRef(null)
  const debounceRef = useRef(null)
  const abortRef    = useRef(null)

  useEffect(() => {
    const h = () => inputRef.current?.focus()
    document.addEventListener('focus-discover-search', h)
    return () => document.removeEventListener('focus-discover-search', h)
  }, [])

  useEffect(() => {
    const seed = location.state?.seedBook
    if (seed) {
      handleFindSimilar(seed)
      window.history.replaceState({}, '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runSearch = useCallback(async (q, t) => {
    if (q.length < MIN_CHARS) { setResults(null); setSearchErr(null); return }
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setSearching(true)
    setSearchErr(null)
    try {
      const data = await searchApi.search({ q, type: t || undefined, limit: 20 }, abortRef.current.signal)
      setResults(data)
    } catch (err) {
      if (err.name === 'AbortError') return
      setSearchErr(err.message)
      setResults(null)
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(query, type), DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
  }, [query, type, runSearch])

  async function handleFindSimilar(book) {
    setSeedBook(book)
    setRecs(null)
    setRecsLoading(true)
    try {
      const data = await booksApi.recommend(book.id, 8)
      setRecs(data)
    } catch {
      setRecs({ recommendations: [] })
    } finally {
      setRecsLoading(false)
    }
  }

  function clearSearch() {
    setQuery('')
    setResults(null)
    setSearchErr(null)
    inputRef.current?.focus()
  }

  const showEmptyState = !query && !searching && !results

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <header className="px-6 py-4 border-b border-smoke-light shrink-0 space-y-3">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-xl text-ice">Discover</h1>
        </div>

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ice/30 pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search books, authors, genres…"
            className="w-full bg-smoke-dark border border-smoke-light rounded-lg pl-9 pr-10 py-2.5 text-sm text-ice placeholder-ice/30 focus:outline-none focus:border-steel transition-colors"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <Spinner size={14} />
            </span>
          )}
          {!searching && query && (
            <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-ice/30 hover:text-ice transition-colors cursor-pointer">
              <X size={14} />
            </button>
          )}
        </div>

        {query.length >= MIN_CHARS && (
          <div className="flex gap-1">
            {TYPE_TABS.map(t => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={[
                  'px-3 py-1 text-xs rounded transition-colors cursor-pointer',
                  type === t.value ? 'bg-smoke-light text-amber' : 'text-ice/40 hover:text-ice',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {searchErr && (
          <p className="text-blood/80 text-sm mb-4 p-3 border border-blood/30 rounded bg-blood/5" role="alert">
            {searchErr}
          </p>
        )}

        <div className="flex gap-6 items-start">
          <div className="flex-1 min-w-0 space-y-8 pb-6">

            {showEmptyState && (
              <ForYouSection onFindSimilar={handleFindSimilar} />
            )}

            {query.length > 0 && query.length < MIN_CHARS && (
              <p className="text-ice/30 text-sm" aria-live="polite">Type at least {MIN_CHARS} characters…</p>
            )}

            {results && (
              <SearchResults results={results} seedId={seedBook?.id} onFindSimilar={handleFindSimilar} />
            )}
          </div>

          {(seedBook || recsLoading) && (
            <div className="hidden md:block">
              <RecsPanel
                seed={seedBook}
                recs={recs}
                loading={recsLoading}
                onClose={() => { setSeedBook(null); setRecs(null) }}
                onFindSimilar={handleFindSimilar}
              />
            </div>
          )}
        </div>
      </div>

      {/* Mobile recs sheet */}
      {(seedBook || recsLoading) && (
        <div className="md:hidden fixed inset-x-0 bottom-16 z-30 max-h-[60dvh] flex flex-col rounded-t-2xl bg-smoke border-t border-smoke-light shadow-2xl overflow-hidden">
          <div className="flex justify-center pt-3 shrink-0">
            <div className="w-10 h-1 rounded-full bg-smoke-light" />
          </div>
          <RecsPanel
            seed={seedBook}
            recs={recs}
            loading={recsLoading}
            onClose={() => { setSeedBook(null); setRecs(null) }}
            onFindSimilar={handleFindSimilar}
            inline
          />
        </div>
      )}
    </div>
  )
}

/* ── For You section ────────────────────────────────────────────────────────── */

function ForYouSection({ onFindSimilar }) {
  const [data, setData]       = useState(null)   // null = loading
  const [failed, setFailed]   = useState(false)

  useEffect(() => {
    let cancelled = false
    booksApi.forYou(5, 4)
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])

  // Loading
  if (data === null && !failed) {
    return (
      <div className="space-y-8">
        <ForYouSkeleton />
      </div>
    )
  }

  // No read books yet — show a friendly prompt
  if (failed || !data?.sections?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <BookOpen size={40} className="text-ice/20 mb-3" />
        <p className="font-serif text-ice/40">No recommendations yet</p>
        <p className="text-ice/30 text-sm mt-1 max-w-xs">
          Mark some books as <em className="not-italic text-ice/50">Read</em> and rate them — your personal recommendations will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-2">
        <Sparkles size={13} className="text-amber" />
        <h2 className="font-sans text-xs text-ice/40 uppercase tracking-widest">For You</h2>
        <span className="text-ice/20 text-xs">· based on your library</span>
      </div>

      {data.sections.map(section => (
        <ForYouGroup key={section.seed.id} section={section} onFindSimilar={onFindSimilar} />
      ))}
    </div>
  )
}

function ForYouGroup({ section, onFindSimilar }) {
  const { seed, recommendations, tier } = section
  const stars = seed.rating ? '★'.repeat(seed.rating) : null
  const verb  = seed.rating >= 4 ? 'loved' : 'read'

  return (
    <div>
      {/* Because you loved… */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-ice/40">Because you {verb}</span>
        <button
          onClick={() => onFindSimilar(seed)}
          className="text-xs text-ice/70 hover:text-amber font-medium transition-colors cursor-pointer truncate max-w-[200px]"
          title={seed.title}
        >
          {seed.title}
        </button>
        {stars && <span className="text-amber text-[10px] shrink-0">{stars}</span>}
        {tier === 'genre+embedding' && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber/10 text-amber text-[10px] shrink-0">
            <Sparkles size={8} />AI
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {recommendations.map(rec => (
          <ForYouCard key={rec.id} rec={rec} onFindSimilar={onFindSimilar} />
        ))}
      </div>
    </div>
  )
}

function ForYouCard({ rec, onFindSimilar }) {
  const { bg, fg, initials } = coverPlaceholder(rec)
  const [imgError, setImgError] = useState(false)
  const showCover = rec.coverUrl && !imgError
  const names = authorNames(rec.authors)

  return (
    <div className="group bg-smoke border border-smoke-light rounded-lg overflow-hidden hover:border-steel/40 transition-all duration-150 flex flex-col">
      {/* Cover — portrait ratio like the library grid */}
      <div className="w-full relative overflow-hidden" style={{ aspectRatio: '2/3', backgroundColor: bg }}>
        {showCover ? (
          <img
            src={rec.coverUrl}
            alt={rec.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-2">
            <span className="font-serif font-bold text-sm select-none text-center leading-tight" style={{ color: fg }}>{initials}</span>
          </div>
        )}
        {rec.matchedGenres?.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/70 to-transparent">
            <span className="text-[8px] text-white/60 truncate block">{rec.matchedGenres[0]}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-1.5 flex flex-col flex-1">
        <p className="text-ice/85 text-[10px] font-medium leading-snug line-clamp-2 flex-1">{rec.title}</p>
        {names[0] && <p className="text-ice/35 text-[9px] truncate mt-0.5">{names[0]}</p>}
        <button
          onClick={() => onFindSimilar(rec)}
          className="flex items-center gap-0.5 text-steel/30 hover:text-amber text-[9px] transition-colors cursor-pointer mt-1 self-end"
        >
          <Sparkles size={8} />
          Similar
        </button>
      </div>
    </div>
  )
}

function ForYouSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-3 w-24 bg-smoke-light rounded" />
      {[0, 1].map(i => (
        <div key={i}>
          <div className="h-3 w-56 bg-smoke-light rounded mb-4" />
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="bg-smoke-light rounded-lg overflow-hidden">
                <div className="w-full bg-smoke-dark" style={{ aspectRatio: '2/3' }} />
                <div className="p-2.5 space-y-1.5">
                  <div className="h-2.5 bg-smoke-dark rounded w-3/4" />
                  <div className="h-2 bg-smoke-dark rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Search results ─────────────────────────────────────────────────────────── */

function SearchResults({ results, seedId, onFindSimilar }) {
  const books   = results.hits.filter(h => h.type === 'book')
  const authors = results.hits.filter(h => h.type === 'author')

  if (!results.hits.length) {
    return (
      <div className="text-center py-12">
        <p className="font-serif text-ice/40">No results for "{results.query}"</p>
        <p className="text-ice/30 text-sm mt-1">Try a different spelling or shorter term</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-ice/30 text-xs">
        {results.total} result{results.total !== 1 ? 's' : ''} for "{results.query}"
      </p>

      {books.length > 0 && (
        <section>
          <SectionTitle>Books</SectionTitle>
          <div className="space-y-1">
            {books.map(book => (
              <BookHit key={book.id} book={book} isSeeded={book.id === seedId} onFindSimilar={onFindSimilar} />
            ))}
          </div>
        </section>
      )}

      {authors.length > 0 && (
        <section>
          <SectionTitle>Authors</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {authors.map(author => (
              <AuthorHit key={author.id} author={author} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function BookHit({ book, isSeeded, onFindSimilar }) {
  const { bg } = spineColor(book)
  const [imgError, setImgError] = useState(false)
  const showCover = book.coverUrl && !imgError
  return (
    <button
      onClick={() => onFindSimilar(book)}
      className={[
        'flex items-center gap-3 px-3 py-2.5 rounded transition-colors w-full text-left cursor-pointer',
        isSeeded ? 'bg-smoke-light ring-1 ring-amber/30' : 'hover:bg-smoke',
      ].join(' ')}
    >
      <div className="w-7 h-10 rounded shrink-0 overflow-hidden" style={{ backgroundColor: bg }}>
        {showCover && (
          <img src={book.coverUrl} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-ice/90 text-sm truncate">{book.title}</p>
        <p className="text-ice/40 text-xs">{[book.publishedYear, book.genres?.[0]].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {book.readStatus && <Badge status={book.readStatus} />}
        <Sparkles size={11} className="text-steel/40 group-hover:text-amber transition-colors" />
      </div>
    </button>
  )
}

function AuthorHit({ author }) {
  return (
    <Link
      to={`/authors/${author.id}`}
      className="flex items-center gap-3 p-3 bg-smoke border border-smoke-light rounded hover:border-steel/40 transition-colors"
    >
      <div className="w-9 h-9 rounded-full bg-steel-dim flex items-center justify-center overflow-hidden text-ice/60 text-sm font-serif shrink-0">
        {author.photoUrl
          ? <img src={author.photoUrl} alt={author.name} className="w-full h-full object-cover" />
          : author.name?.[0] ?? '?'
        }
      </div>
      <div className="min-w-0">
        <p className="text-ice/90 text-sm font-medium truncate">{author.name}</p>
        {author.nationality && <p className="text-ice/40 text-xs">{author.nationality}</p>}
      </div>
      <ArrowRight size={13} className="text-ice/20 shrink-0 ml-auto" />
    </Link>
  )
}

/* ── Recommendations panel ──────────────────────────────────────────────────── */

function RecsPanel({ seed, recs, loading, onClose, inline = false, onFindSimilar }) {
  const { bg: seedBg, fg: seedFg } = seed ? spineColor(seed) : { bg: '#2a2a2a', fg: '#e8eef2' }

  return (
    <aside className={inline ? 'flex flex-col flex-1 overflow-hidden' : 'w-72 shrink-0 sticky top-0 self-start space-y-4'}>
      <div className="bg-smoke border border-smoke-light rounded-lg p-4">
        <div className="flex items-start justify-between mb-3">
          <p className="text-ice/40 text-xs uppercase tracking-widest">Similar to</p>
          <button onClick={onClose} className="text-ice/30 hover:text-ice transition-colors cursor-pointer">
            <X size={14} />
          </button>
        </div>
        <div className="flex gap-3 items-start">
          <div className="w-10 h-14 rounded shrink-0 flex items-center justify-center p-1" style={{ backgroundColor: seedBg }}>
            {seed?.coverUrl
              ? <img src={seed.coverUrl} alt="" className="w-full h-full object-cover rounded" />
              : <span className="text-[6px] font-serif text-center leading-tight" style={{ color: seedFg }}>{seed?.title}</span>
            }
          </div>
          <div className="min-w-0">
            <p className="text-ice/90 text-xs font-medium leading-snug line-clamp-2">{seed?.title}</p>
            {seed?.genres?.[0] && <p className="text-ice/40 text-[10px] mt-0.5 capitalize">{seed.genres[0]}</p>}
          </div>
        </div>
      </div>

      <div className="bg-smoke border border-smoke-light rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-smoke-light flex items-center justify-between">
          <p className="text-ice/40 text-xs uppercase tracking-widest">You might like</p>
          {recs?.tier === 'genre+embedding' && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber/10 text-amber text-[10px] font-medium">
              <Sparkles size={9} />AI
            </span>
          )}
        </div>

        {loading && <div className="flex items-center justify-center h-24"><Spinner size={20} /></div>}

        {!loading && recs?.recommendations?.length === 0 && (
          <p className="text-ice/30 text-xs p-4">Not enough data yet — add more books to improve recommendations.</p>
        )}

        {!loading && recs?.recommendations?.length > 0 && (
          <div className="divide-y divide-smoke-light">
            {recs.recommendations.map(rec => (
              <RecRow key={rec.id} rec={rec} showScore={recs.tier === 'genre+embedding'} onFindSimilar={onFindSimilar} />
            ))}
          </div>
        )}

        {recs && recs.tier === 'genre' && (
          <div className="px-4 py-2 border-t border-smoke-light">
            <p className="text-ice/20 text-[10px]">Genre-based · AI unavailable</p>
          </div>
        )}
      </div>
    </aside>
  )
}

function RecRow({ rec, showScore = false, onFindSimilar }) {
  const { bg } = spineColor(rec)
  const [imgError, setImgError] = useState(false)
  const pct    = rec.score != null ? Math.round(rec.score * 100) : null
  const reason = rec.matchedGenres?.length
    ? rec.matchedGenres.slice(0, 2).map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(' · ')
    : rec.genres?.[0]
  const showCover = rec.coverUrl && !imgError

  return (
    <button
      onClick={() => onFindSimilar?.(rec)}
      className="flex items-start gap-3 px-4 py-3 w-full text-left hover:bg-smoke-light transition-colors cursor-pointer"
    >
      <div className="w-6 h-9 rounded shrink-0 mt-0.5 overflow-hidden" style={{ backgroundColor: bg }}>
        {showCover && (
          <img
            src={rec.coverUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-ice/80 text-xs font-medium leading-snug line-clamp-2 flex-1">{rec.title}</p>
          {rec.readStatus && <Badge status={rec.readStatus} />}
        </div>
        {reason && <p className="text-ice/30 text-[10px] mt-0.5 truncate">{reason}</p>}
        {showScore && pct != null && (
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-[3px] bg-smoke-dark rounded overflow-hidden">
              <div className="h-full rounded" style={{ width: `${pct}%`, background: 'linear-gradient(to right, #4a6fa5, #e8a020)' }} />
            </div>
            <span className="text-ice/30 text-[10px] tabular-nums w-7 text-right">{pct}%</span>
          </div>
        )}
      </div>
    </button>
  )
}

function SectionTitle({ children }) {
  return <h2 className="font-sans text-xs text-ice/40 uppercase tracking-widest mb-2">{children}</h2>
}
