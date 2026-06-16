import { useEffect, useState, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Users, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useLibraryStore } from '../store/useLibraryStore.js'
import { authorsApi } from '../api/authors.js'
import AutocompleteInput from '../components/ui/AutocompleteInput.jsx'
import Spinner from '../components/ui/Spinner.jsx'

const LIMIT = 30

export default function AuthorsPage() {
  const { authors, totalAuthors, authorsLoading, authorsError, fetchAuthors } = useLibraryStore()
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const queryRef = useRef('')
  const debounceRef = useRef(null)
  const navigate = useNavigate()

  const totalPages = Math.max(1, Math.ceil(totalAuthors / LIMIT))

  // Initial load
  useEffect(() => {
    fetchAuthors({ limit: LIMIT, page: 1 })
  }, [])

  function doFetch(p, q) {
    fetchAuthors({ limit: LIMIT, page: p, q: q.trim() || undefined })
  }

  function goTo(p) {
    const next = Math.min(Math.max(1, p), totalPages)
    setPage(next)
    doFetch(next, queryRef.current)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const fetchSuggestions = useCallback(async (q) => {
    const data = await authorsApi.list({ q, limit: 8 })
    return data.authors?.map(a => a.name) ?? []
  }, [])

  function handleQueryChange(val) {
    setQuery(val)
    queryRef.current = val

    // Exact match means a suggestion was clicked → navigate to that author's profile
    const exact = authors.find(a => a.name === val)
    if (exact) {
      navigate(`/authors/${exact.id}`)
      return
    }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      doFetch(1, val)
    }, 300)
  }

  function clearQuery() {
    setQuery('')
    queryRef.current = ''
    clearTimeout(debounceRef.current)
    setPage(1)
    doFetch(1, '')
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-smoke-light shrink-0">
        <h1 className="font-serif text-xl text-ice mr-auto">
          Authors
          {totalAuthors > 0 && (
            <span className="ml-2 font-sans text-sm text-ice/40 font-normal">{totalAuthors}</span>
          )}
        </h1>

        {/* Search / filter */}
        <div className="relative w-56">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ice/30 pointer-events-none" />
          <AutocompleteInput
            value={query}
            onChange={handleQueryChange}
            fetchSuggestions={fetchSuggestions}
            placeholder="Filter authors…"
            minChars={1}
            className="w-full bg-smoke-dark border border-smoke-light rounded pl-7 pr-7 py-1.5 text-sm text-ice placeholder-ice/25 focus:outline-none focus:border-steel transition-colors"
          />
          {query && (
            <button
              onClick={clearQuery}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ice/30 hover:text-ice transition-colors cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {authorsLoading && (
          <div className="flex items-center justify-center h-48">
            <Spinner size={32} />
          </div>
        )}

        {authorsError && (
          <div className="text-blood/80 text-sm p-4 border border-blood/30 rounded bg-blood/5">
            {authorsError}
          </div>
        )}

        {!authorsLoading && !authorsError && authors.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Users size={48} className="text-ice/20 mb-4" />
            {query
              ? <p className="font-serif text-ice/40 text-lg">No authors match "{query}"</p>
              : <p className="font-serif text-ice/40 text-lg">No authors yet</p>
            }
            {!query && <p className="text-ice/30 text-sm mt-1">Authors appear when you add books</p>}
          </div>
        )}

        {!authorsLoading && authors.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {authors.map(author => (
                <AuthorCard key={author.id} author={author} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => goTo(page - 1)}
                  disabled={page === 1}
                  className="p-1.5 rounded border border-smoke-light text-ice/40 hover:text-ice hover:border-steel disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => goTo(p)}
                    className={[
                      'w-8 h-8 rounded border text-sm transition-colors cursor-pointer',
                      p === page
                        ? 'border-amber text-amber bg-amber/10'
                        : 'border-smoke-light text-ice/40 hover:text-ice hover:border-steel',
                    ].join(' ')}
                  >
                    {p}
                  </button>
                ))}

                <button
                  onClick={() => goTo(page + 1)}
                  disabled={page === totalPages}
                  className="p-1.5 rounded border border-smoke-light text-ice/40 hover:text-ice hover:border-steel disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Deterministic accent color from author id
const ACCENTS = ['#4a6fa5', '#8b2020', '#2d5a3d', '#4a2d7a', '#7a5c0e', '#1a4f7a']
function authorAccent(id = '') {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  return ACCENTS[Math.abs(h) % ACCENTS.length]
}

function AuthorCard({ author }) {
  const accent = authorAccent(author.id)
  const initials = author.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  return (
    <Link
      to={`/authors/${author.id}`}
      className="group flex flex-col rounded-xl overflow-hidden border border-white/[0.07] hover:border-white/[0.14] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/50"
      style={{ background: '#1e1e1e' }}
    >
      {/* Colored header band */}
      <div
        className="h-16 shrink-0 relative flex items-end px-4 pb-0"
        style={{ background: `linear-gradient(135deg, ${accent}cc 0%, ${accent}44 100%)` }}
      >
        {/* Avatar — overlaps the band */}
        <div
          className="absolute -bottom-6 left-4 w-14 h-14 rounded-full border-2 border-[#1e1e1e] overflow-hidden flex items-center justify-center shadow-lg"
          style={{ backgroundColor: accent }}
        >
          {author.photoUrl ? (
            <img src={author.photoUrl} alt={author.name} className="w-full h-full object-cover" />
          ) : (
            <span className="font-serif text-white text-lg font-semibold">{initials}</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="pt-9 px-4 pb-4">
        <p className="font-serif text-ice text-sm font-semibold leading-tight line-clamp-1 group-hover:text-amber transition-colors">
          {author.name}
        </p>

        <p className="text-ice/35 text-[11px] mt-0.5 truncate">
          {[author.nationality, author.birthYear ? `b. ${author.birthYear}` : null]
            .filter(Boolean).join(' · ') || 'Author'}
        </p>

        {author.genres?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {author.genres.slice(0, 2).map(g => (
              <span
                key={g}
                className="text-[10px] px-1.5 py-0.5 rounded-full capitalize"
                style={{ backgroundColor: `${accent}25`, color: accent }}
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
