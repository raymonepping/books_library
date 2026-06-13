import { useEffect, useState } from 'react'
import {
  BookOpen, BookCheck, BookMarked, BookX,
  Star, Library, FileText, Calendar,
} from 'lucide-react'
import { dashboardApi } from '../api/dashboard.js'
import { useLibraryStore } from '../store/useLibraryStore.js'
import Spinner from '../components/ui/Spinner.jsx'
import { spineColor } from '../components/BookViews/spineUtils.js'

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Pull a handful of "currently reading" books from the store (already fetched by BooksPage)
  const books = useLibraryStore(s => s.books)
  const reading = books.filter(b => b.readStatus === 'reading').slice(0, 6)

  useEffect(() => {
    dashboardApi.getStats()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center px-6 py-4 border-b border-smoke-light shrink-0">
        <h1 className="font-serif text-xl text-ice">Dashboard</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        {loading && (
          <div className="flex items-center justify-center h-48">
            <Spinner size={32} />
          </div>
        )}

        {error && (
          <div className="text-blood/80 text-sm p-4 border border-blood/30 rounded bg-blood/5">
            {error}
          </div>
        )}

        {stats && (
          <>
            {/* ── Stat cards ── */}
            <section>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard icon={Library}   label="Total"        value={stats.total}                color="ice"   />
                <StatCard icon={BookCheck} label="Read"         value={stats.read}                 color="amber" />
                <StatCard icon={BookOpen}  label="Reading"      value={stats.reading}              color="blood" />
                <StatCard icon={BookMarked}label="Want to read" value={stats.wantToRead}           color="steel" />
                <StatCard icon={BookX}     label="DNF"          value={stats.didNotFinish}         color="ice"   />
                <StatCard icon={Star}      label="Avg rating"   value={stats.avgRating ?? '—'}     color="amber" />
                <StatCard icon={FileText}  label="Total pages"  value={fmtNumber(stats.totalPages)}color="steel" />
                <StatCard icon={Calendar}  label="Read this year" value={stats.readThisYear}       color="blood" />
              </div>
            </section>

            {/* ── Reading progress bar ── */}
            {stats.total > 0 && (
              <section>
                <SectionTitle>Reading progress</SectionTitle>
                <ReadingProgress stats={stats} />
              </section>
            )}

            {/* ── Genre breakdown ── */}
            {stats.genres?.length > 0 && (
              <section>
                <SectionTitle>Genre breakdown</SectionTitle>
                <GenreBreakdown genres={stats.genres} total={stats.total} />
              </section>
            )}
          </>
        )}

        {/* ── Currently reading ── */}
        {reading.length > 0 && (
          <section>
            <SectionTitle>Currently reading</SectionTitle>
            <div className="flex gap-4 flex-wrap">
              {reading.map(book => <ReadingCard key={book.id} book={book} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

/* ── Stat card ──────────────────────────────────────────────────────────────── */

const COLOR_MAP = {
  amber: { text: 'text-amber', border: 'border-amber/20', bg: 'bg-amber/5' },
  blood: { text: 'text-blood', border: 'border-blood/20', bg: 'bg-blood/5' },
  steel: { text: 'text-steel', border: 'border-steel/20', bg: 'bg-steel/5' },
  ice:   { text: 'text-ice',   border: 'border-ice/10',   bg: 'bg-smoke'   },
}

function StatCard({ icon: Icon, label, value, color }) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.ice
  return (
    <div className={`rounded border ${c.border} ${c.bg} p-5 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-ice/40 text-xs uppercase tracking-widest">{label}</span>
        <Icon size={14} className={`${c.text} opacity-60`} />
      </div>
      <span className={`font-serif text-3xl font-bold ${c.text}`}>{value}</span>
    </div>
  )
}

/* ── Reading progress bar ───────────────────────────────────────────────────── */

function ReadingProgress({ stats }) {
  const { total, read, reading, wantToRead, didNotFinish } = stats
  const segments = [
    { key: 'read',         count: read,         color: '#e8a020', label: 'Read'         },
    { key: 'reading',      count: reading,       color: '#c0392b', label: 'Reading'      },
    { key: 'want-to-read', count: wantToRead,    color: '#4a6fa5', label: 'Want to read' },
    { key: 'dnf',          count: didNotFinish,  color: '#3a3a3a', label: 'DNF'          },
  ].filter(s => s.count > 0)

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="flex h-4 rounded overflow-hidden gap-px">
        {segments.map(seg => (
          <div
            key={seg.key}
            title={`${seg.label}: ${seg.count}`}
            style={{ width: `${(seg.count / total) * 100}%`, backgroundColor: seg.color }}
          />
        ))}
        {/* Untracked remainder */}
        {segments.reduce((s, x) => s + x.count, 0) < total && (
          <div className="flex-1 bg-smoke-light" />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {segments.map(seg => (
          <div key={seg.key} className="flex items-center gap-1.5 text-xs text-ice/50">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
            {seg.label}
            <span className="text-ice/30">
              {seg.count} ({Math.round((seg.count / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Genre breakdown ────────────────────────────────────────────────────────── */

function GenreBreakdown({ genres, total }) {
  const max = genres[0]?.count ?? 1
  return (
    <div className="space-y-2">
      {genres.map(({ genre, count }) => (
        <div key={genre} className="flex items-center gap-3">
          <span className="text-ice/60 text-xs w-32 truncate capitalize shrink-0">{genre}</span>
          <div className="flex-1 h-2 bg-smoke-light rounded overflow-hidden">
            <div
              className="h-full rounded"
              style={{
                width: `${(count / max) * 100}%`,
                backgroundColor: '#4a6fa5',
              }}
            />
          </div>
          <span className="text-ice/30 text-xs w-8 text-right shrink-0">{count}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Currently reading card ─────────────────────────────────────────────────── */

function ReadingCard({ book }) {
  const { bg, fg } = spineColor(book)
  return (
    <div className="flex gap-3 bg-smoke border border-smoke-light rounded p-3 w-64 shrink-0">
      <div
        className="w-12 h-16 rounded shrink-0 flex items-center justify-center p-1"
        style={{ backgroundColor: bg }}
      >
        {book.coverUrl ? (
          <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover rounded" />
        ) : (
          <span className="text-[7px] font-serif text-center leading-tight" style={{ color: fg }}>
            {book.title}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-ice/90 text-sm font-medium leading-snug line-clamp-2">{book.title}</p>
        {book.rating > 0 && (
          <p className="text-amber text-xs mt-1">{'★'.repeat(book.rating)}</p>
        )}
        {book.pageCount && (
          <p className="text-ice/30 text-xs mt-0.5">{book.pageCount} pages</p>
        )}
      </div>
    </div>
  )
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function SectionTitle({ children }) {
  return (
    <h2 className="font-sans text-xs text-ice/40 uppercase tracking-widest mb-3">{children}</h2>
  )
}

function fmtNumber(n) {
  if (!n) return '0'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
