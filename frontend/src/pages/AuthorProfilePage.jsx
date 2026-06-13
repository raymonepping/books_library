import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { authorsApi } from '../api/authors.js'
import { booksApi } from '../api/books.js'
import Spinner from '../components/ui/Spinner.jsx'
import Badge from '../components/ui/Badge.jsx'
import { spineColor } from '../components/BookViews/spineUtils.js'

export default function AuthorProfilePage() {
  const { id } = useParams()
  const [author, setAuthor] = useState(null)
  const [books, setBooks] = useState([])
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    authorsApi.get(id)
      .then(a => {
        setAuthor(a)
        // Parallel: books by this author + similar author recommendations
        return Promise.all([
          booksApi.list({ author: id, limit: 50 }),
          authorsApi.recommend(id, 4).catch(() => ({ recommendations: [] })),
        ])
      })
      .then(([booksData, recsData]) => {
        setBooks(booksData.books ?? [])
        setRecs(recsData.recommendations ?? [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={36} />
      </div>
    )
  }

  if (error || !author) {
    return (
      <div className="p-8">
        <BackLink />
        <p className="text-blood/80 text-sm mt-4">{error ?? 'Author not found'}</p>
      </div>
    )
  }

  const initials = author.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <header className="px-6 py-4 border-b border-smoke-light shrink-0">
        <BackLink />
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 max-w-3xl">

        {/* ── Author hero ── */}
        <div className="flex gap-6 items-start">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-steel-dim flex items-center justify-center shrink-0 overflow-hidden">
            {author.photoUrl ? (
              <img src={author.photoUrl} alt={author.name} className="w-full h-full object-cover" />
            ) : (
              <span className="font-serif text-2xl text-ice/60">{initials}</span>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="font-serif text-2xl text-ice leading-tight">{author.name}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-ice/40 text-sm">
              {author.nationality && <span>{author.nationality}</span>}
              {author.birthYear && (
                <span>b. {author.birthYear}{author.deathYear ? ` — ${author.deathYear}` : ''}</span>
              )}
              {books.length > 0 && (
                <span>{books.length} book{books.length !== 1 ? 's' : ''} in library</span>
              )}
            </div>

            {author.genres?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {author.genres.map(g => (
                  <span key={g} className="text-xs px-2 py-0.5 rounded bg-steel/15 text-steel/80 capitalize">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {author.website && (
              <a
                href={author.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-steel text-xs hover:text-ice transition-colors"
              >
                <ExternalLink size={11} />
                {author.website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </div>

        {/* ── Bio ── */}
        {author.bio && (
          <section>
            <SectionTitle>About</SectionTitle>
            <p className="text-ice/70 text-sm leading-relaxed">{author.bio}</p>
          </section>
        )}

        {/* ── Books in library ── */}
        {books.length > 0 && (
          <section>
            <SectionTitle>In your library</SectionTitle>
            <div className="space-y-1">
              {books.map(book => <BookRow key={book.id} book={book} />)}
            </div>
          </section>
        )}

        {/* ── Series ── */}
        {author.series?.length > 0 && (
          <section>
            <SectionTitle>Series</SectionTitle>
            <div className="space-y-3">
              {author.series.map(s => <SeriesSummary key={s.id} series={s} />)}
            </div>
          </section>
        )}

        {/* ── Similar authors ── */}
        {recs.length > 0 && (
          <section>
            <SectionTitle>Similar authors</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {recs.map(rec => (
                <Link
                  key={rec.id}
                  to={`/authors/${rec.id}`}
                  className="flex flex-col items-center gap-2 p-3 bg-smoke border border-smoke-light rounded hover:border-steel/40 transition-colors text-center"
                >
                  <div className="w-10 h-10 rounded-full bg-steel-dim flex items-center justify-center overflow-hidden text-ice/60 text-sm font-serif">
                    {rec.photoUrl
                      ? <img src={rec.photoUrl} alt={rec.name} className="w-full h-full object-cover" />
                      : rec.name?.[0] ?? '?'
                    }
                  </div>
                  <span className="text-ice/80 text-xs font-medium leading-tight">{rec.name}</span>
                  {rec.nationality && (
                    <span className="text-ice/30 text-[10px]">{rec.nationality}</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function BackLink() {
  return (
    <Link
      to="/authors"
      className="inline-flex items-center gap-1.5 text-ice/40 hover:text-ice text-sm transition-colors"
    >
      <ArrowLeft size={14} />
      Authors
    </Link>
  )
}

function SectionTitle({ children }) {
  return (
    <h2 className="font-sans text-xs text-ice/40 uppercase tracking-widest mb-3">{children}</h2>
  )
}

function BookRow({ book }) {
  const { bg } = spineColor(book)
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded hover:bg-smoke transition-colors">
      <div className="w-6 h-9 rounded shrink-0" style={{ backgroundColor: bg }} />
      <div className="flex-1 min-w-0">
        <p className="text-ice/90 text-sm truncate">{book.title}</p>
        {book.publishedYear && (
          <p className="text-ice/30 text-xs">{book.publishedYear}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge status={book.readStatus} />
        {book.rating > 0 && (
          <span className="text-amber text-xs">{'★'.repeat(book.rating)}</span>
        )}
      </div>
    </div>
  )
}

function SeriesSummary({ series }) {
  const pct = series.completionPct ?? 0
  return (
    <div className="bg-smoke border border-smoke-light rounded p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-ice/90 text-sm font-medium">{series.name}</p>
        <span className="text-ice/40 text-xs shrink-0">
          {series.ownedCount ?? 0}/{series.totalBooks} owned
        </span>
      </div>
      <div className="h-1.5 bg-smoke-light rounded overflow-hidden">
        <div
          className="h-full rounded transition-all"
          style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#e8a020' : '#4a6fa5' }}
        />
      </div>
      {series.completedAt && (
        <p className="text-amber text-xs mt-1.5">Complete</p>
      )}
    </div>
  )
}
