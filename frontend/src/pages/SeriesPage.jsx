import { useEffect, useState } from 'react'
import { Layers, ShoppingCart, Pencil, Plus } from 'lucide-react'
import { seriesApi } from '../api/series.js'
import SeriesEditor from '../components/series/SeriesEditor.jsx'
import Spinner from '../components/ui/Spinner.jsx'

export default function SeriesPage() {
  const [series, setSeries] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toggling, setToggling] = useState(null) // `${seriesId}:${order}`
  const [editingSeries, setEditingSeries] = useState(null) // null | series object | 'new'

  useEffect(() => {
    seriesApi.list({ limit: 100 })
      .then(d => { setSeries(d.series); setTotal(d.total) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggleOwned(seriesId, order, currentlyOwned) {
    const key = `${seriesId}:${order}`
    if (toggling === key) return
    setToggling(key)
    try {
      const updated = await seriesApi.markOwned(seriesId, order, !currentlyOwned)
      setSeries(prev => prev.map(s => s.id === seriesId ? updated : s))
    } catch {
      // silent
    } finally {
      setToggling(null)
    }
  }

  function handleSaved(updated) {
    setSeries(prev => {
      const idx = prev.findIndex(s => s.id === updated.id)
      return idx >= 0 ? prev.map(s => s.id === updated.id ? updated : s) : [updated, ...prev]
    })
    setTotal(prev => series.find(s => s.id === updated.id) ? prev : prev + 1)
  }

  const editorSeries = editingSeries === 'new' ? null : editingSeries

  return (
    <div className="flex h-full">
      {/* Main list */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        <header className="flex items-center px-6 py-4 border-b border-smoke-light shrink-0">
          <h1 className="font-serif text-xl text-ice mr-auto">
            Series
            {total > 0 && (
              <span className="ml-2 font-sans text-sm text-ice/40 font-normal">{total}</span>
            )}
          </h1>
          <button
            onClick={() => setEditingSeries('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blood text-ice rounded hover:bg-blood/80 transition-colors cursor-pointer"
          >
            <Plus size={14} />
            New series
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
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

          {!loading && !error && series.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Layers size={48} className="text-ice/20 mb-4" />
              <p className="font-serif text-ice/40 text-lg">No series yet</p>
              <p className="text-ice/30 text-sm mt-1">
                Create one with the "New series" button above
              </p>
            </div>
          )}

          {!loading && series.length > 0 && (
            <div className="space-y-6">
              {series.map(s => (
                <SeriesCard
                  key={s.id}
                  series={s}
                  toggling={toggling}
                  onToggleOwned={handleToggleOwned}
                  onEdit={() => setEditingSeries(s)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Editor panel */}
      {editingSeries && (
        <div className="w-96 shrink-0 border-l border-smoke-light h-full">
          <SeriesEditor
            series={editorSeries}
            onClose={() => setEditingSeries(null)}
            onSaved={handleSaved}
          />
        </div>
      )}
    </div>
  )
}

/* ── Series card ────────────────────────────────────────────────────────────── */

function SeriesCard({ series, toggling, onToggleOwned, onEdit }) {
  const pct = series.completionPct ?? 0
  const isComplete = series.completedAt != null

  return (
    <div className="bg-smoke border border-smoke-light rounded-lg overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4 border-b border-smoke-light">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-ice text-base font-semibold">{series.name}</h2>
            <p className="text-ice/40 text-xs mt-0.5">
              {series.ownedCount ?? 0} of {series.totalBooks} owned
              {isComplete && (
                <span className="ml-2 text-amber">· Complete</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-ice/50 text-sm font-mono">{Math.round(pct)}%</span>
            <button
              onClick={onEdit}
              title="Edit series"
              className="text-ice/30 hover:text-amber transition-colors cursor-pointer"
            >
              <Pencil size={14} />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2 bg-smoke-light rounded overflow-hidden">
          <div
            className="h-full rounded transition-all duration-500"
            style={{
              width: `${pct}%`,
              backgroundColor: isComplete ? '#e8a020' : '#4a6fa5',
            }}
          />
        </div>
      </div>

      {/* Book list */}
      {series.books?.length > 0 && (
        <div className="divide-y divide-smoke-light">
          {series.books
            .slice()
            .sort((a, b) => a.seriesOrder - b.seriesOrder)
            .map(book => (
              <SeriesBookRow
                key={book.seriesOrder}
                book={book}
                seriesId={series.id}
                isToggling={toggling === `${series.id}:${book.seriesOrder}`}
                onToggle={() => onToggleOwned(series.id, book.seriesOrder, book.owned)}
              />
            ))}
        </div>
      )}
    </div>
  )
}

/* ── Single book in series ──────────────────────────────────────────────────── */

function SeriesBookRow({ book, seriesId, isToggling, onToggle }) {
  const missingUrl = book.isbn
    ? `https://www.bol.com/nl/nl/s/?searchtext=${encodeURIComponent(book.isbn)}`
    : `https://www.bol.com/nl/nl/s/?searchtext=${encodeURIComponent(book.title)}`

  const subtitle = [
    book.originalTitle,
    ...(book.altTitles ?? []),
  ].filter(Boolean).join(' · ')

  return (
    <div className={[
      'flex items-center gap-4 px-5 py-3 transition-colors',
      book.owned ? 'bg-transparent' : 'bg-blood/3',
    ].join(' ')}>
      {/* Order number */}
      <span className="text-ice/30 text-xs font-mono w-5 shrink-0 text-right">
        {book.seriesOrder}
      </span>

      {/* Title + original/alt */}
      <div className="flex-1 min-w-0">
        <p className={['text-sm truncate', book.owned ? 'text-ice/80' : 'text-ice/40'].join(' ')}>
          {book.title || `Book ${book.seriesOrder}`}
        </p>
        {subtitle && (
          <p className="text-ice/25 text-xs truncate">{subtitle}</p>
        )}
        {book.publishedYear && (
          <p className="text-ice/30 text-xs">{book.publishedYear}</p>
        )}
      </div>

      {/* Buy link when not owned */}
      {!book.owned && (
        <a
          href={missingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-steel hover:text-ice text-xs flex items-center gap-1 shrink-0 transition-colors"
          title="Find on bol.com"
        >
          <ShoppingCart size={12} />
          Buy
        </a>
      )}

      {/* Owned toggle */}
      <button
        onClick={onToggle}
        disabled={isToggling}
        title={book.owned ? 'Mark as not owned' : 'Mark as owned'}
        className={[
          'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer',
          'disabled:opacity-40',
          book.owned
            ? 'border-amber bg-amber'
            : 'border-smoke-light hover:border-steel',
        ].join(' ')}
      >
        {book.owned && (
          <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-noir">
            <path d="M1 4l3 3 5-6" stroke="#0d0d0d" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  )
}
