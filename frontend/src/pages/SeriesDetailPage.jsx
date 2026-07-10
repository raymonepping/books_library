import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Layers, BookOpen } from 'lucide-react'
import { seriesApi } from '../api/series.js'
import { profileApi } from '../api/profile.js'
import { booksApi } from '../api/books.js'
import Spinner from '../components/ui/Spinner.jsx'
import Badge from '../components/ui/Badge.jsx'
import ReaderProfile from '../components/series/ReaderProfile.jsx'
import SimilarSeries from '../components/series/SimilarSeries.jsx'
import BridgingReads from '../components/series/BridgingReads.jsx'

function BackLink() {
  return (
    <Link to="/series" className="inline-flex items-center gap-2 text-ice/60 hover:text-ice transition-colors text-sm">
      <ArrowLeft className="w-4 h-4" />
      <span>Back to Series</span>
    </Link>
  )
}

export default function SeriesDetailPage() {
  const { id } = useParams()
  const [series, setSeries] = useState(null)
  const [books, setBooks] = useState([])
  const [profile, setProfile] = useState(null)
  const [similar, setSimilar] = useState([])
  const [bridging, setBridging] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    seriesApi.get(id)
      .then(s => {
        setSeries(s)
        // Parallel: books in series, profile, similar series, bridging reads
        return Promise.all([
          booksApi.list({ series: s.name, limit: 50 }),
          profileApi.get().catch(() => null),
          seriesApi.getSimilar(id, 4).catch(() => ({ similar: [] })),
          seriesApi.getBridging(id, 3).catch(() => ({ bridging: [] })),
        ])
      })
      .then(([booksData, profileData, similarData, bridgingData]) => {
        setBooks(booksData.books ?? [])
        setProfile(profileData)
        setSimilar(similarData.similar ?? [])
        setBridging(bridgingData.bridging ?? [])
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

  if (error || !series) {
    return (
      <div className="p-8">
        <BackLink />
        <p className="text-blood/80 text-sm mt-4">{error ?? 'Series not found'}</p>
      </div>
    )
  }

  const completionPct = series.totalBooks > 0
    ? Math.round((series.ownedCount / series.totalBooks) * 100)
    : 0

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <header className="px-6 py-4 border-b border-smoke-light shrink-0">
        <BackLink />
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 max-w-5xl">

        {/* ── Series Hero ── */}
        <div className="flex gap-6 items-start">
          <div className="w-20 h-20 rounded-lg bg-steel-dim flex items-center justify-center shrink-0">
            <Layers className="w-10 h-10 text-ice/40" />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-3xl text-ice leading-tight">{series.name}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-ice/40 text-sm">
              {series.authorName && (
                <Link
                  to={`/authors/${series.authorId}`}
                  className="hover:text-gold transition-colors"
                >
                  {series.authorName}
                </Link>
              )}
              <span>{series.totalBooks} books</span>
              <span>{series.ownedCount} owned</span>
            </div>

            {/* Completion Bar */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ice/60">Collection Progress</span>
                <span className="text-ice/80 font-medium">{completionPct}%</span>
              </div>
              <div className="h-2 bg-steel-dim rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gold/60 to-gold transition-all duration-500"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Reader Profile ── */}
        {profile && <ReaderProfile profile={profile} />}

        {/* ── Books in Series ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-ice/60" />
            <h3 className="font-serif text-lg text-ice">Books in Series</h3>
          </div>

          {books.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {books.map((book) => (
                <div key={book.id} className="group space-y-2">
                  {/* Cover */}
                  <div className="aspect-[2/3] bg-steel-dim rounded overflow-hidden">
                    {book.coverUrl ? (
                      <img
                        src={book.coverUrl}
                        alt={book.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="w-8 h-8 text-ice/20" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="space-y-1">
                    <h4 className="text-sm text-ice line-clamp-2 group-hover:text-gold transition-colors">
                      {book.title}
                    </h4>
                    <div className="flex items-center gap-2">
                      {book.seriesOrder && (
                        <Badge variant="outline" size="xs">#{book.seriesOrder}</Badge>
                      )}
                      {book.owned && (
                        <Badge variant="secondary" size="xs">Owned</Badge>
                      )}
                      {book.readStatus === 'read' && (
                        <Badge variant="success" size="xs">Read</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-ice/40 text-sm">No books found in this series.</p>
          )}
        </div>

        {/* ── Similar Series ── */}
        <SimilarSeries similar={similar} />

        {/* ── Bridging Reads ── */}
        <BridgingReads bridging={bridging} seriesName={series.name} />

      </div>
    </div>
  )
}

// Made with Bob
