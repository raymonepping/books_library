import { useEffect, useState, useMemo, useCallback } from 'react'
import { Layers, ShoppingCart, Pencil, Plus, ChevronDown, Trash2, SlidersHorizontal, X } from 'lucide-react'
import { seriesApi } from '../api/series.js'
import SeriesEditor from '../components/series/SeriesEditor.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import AutocompleteInput from '../components/ui/AutocompleteInput.jsx'

export default function SeriesPage() {
  const [series, setSeries] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toggling, setToggling] = useState(null) // `${seriesId}:${order}`
  const [editingSeries, setEditingSeries] = useState(null) // null | series object | 'new'
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState({ sort: 'name', completion: '', status: '', author: '' })

  function setFilter(key, val) { setFilters(f => ({ ...f, [key]: val })) }
  function resetFilters() { setFilters({ sort: 'name', completion: '', status: '', author: '' }) }

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

  async function handleDelete(seriesId) {
    try {
      await seriesApi.delete(seriesId)
      setSeries(prev => prev.filter(s => s.id !== seriesId))
      setTotal(prev => prev - 1)
    } catch {
      // silent — series card stays
    }
  }

  const editorSeries = editingSeries === 'new' ? null : editingSeries

  // Autocomplete suggestions derived from loaded series — no extra API call needed
  const authorSuggestions = useCallback((q) => {
    const names = [...new Set(series.map(s => s.authorName).filter(Boolean))].sort()
    const lower = q.toLowerCase()
    return Promise.resolve(lower ? names.filter(n => n.toLowerCase().includes(lower)) : names)
  }, [series])

  const processedSeries = useMemo(() => {
    let result = [...series]
    // Filter
    if (filters.completion === 'complete')   result = result.filter(s => s.completedAt != null)
    if (filters.completion === 'incomplete') result = result.filter(s => s.completedAt == null)
    if (filters.status)  result = result.filter(s => s.currentReadStatus === filters.status)
    if (filters.author)  result = result.filter(s =>
      s.authorName?.toLowerCase().includes(filters.author.toLowerCase()))
    // Sort
    result.sort((a, b) => {
      switch (filters.sort) {
        case 'author':  return (a.authorName ?? '').localeCompare(b.authorName ?? '')
        case 'year': {
          const ay = a.books?.slice().sort((x,y) => x.seriesOrder - y.seriesOrder)[0]?.publishedYear ?? 0
          const by_ = b.books?.slice().sort((x,y) => x.seriesOrder - y.seriesOrder)[0]?.publishedYear ?? 0
          return ay - by_
        }
        case 'addedAt': return (b.addedAt ?? '').localeCompare(a.addedAt ?? '')
        default:        return (a.name ?? '').localeCompare(b.name ?? '') // 'name' = title A–Z
      }
    })
    return result
  }, [series, filters])

  const activeFilterCount = ['completion', 'status', 'author'].filter(k => filters[k]).length

  return (
    <div className="flex h-full">
      {/* Main list */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        <header className="flex items-center gap-2 px-6 py-4 border-b border-smoke-light shrink-0">
          <h1 className="font-serif text-xl text-ice mr-auto">
            Series
            {total > 0 && (
              <span className="ml-2 font-sans text-sm text-ice/40 font-normal">{total}</span>
            )}
          </h1>
          <button
            onClick={() => setFilterOpen(v => !v)}
            className={[
              'relative flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-sm transition-colors cursor-pointer',
              activeFilterCount > 0 ? 'border-amber/40 text-amber bg-amber/10' : 'border-smoke-light text-ice/50 hover:text-ice',
            ].join(' ')}
          >
            <SlidersHorizontal size={15} />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber text-noir text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setEditingSeries('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blood text-ice rounded hover:bg-blood/80 transition-colors cursor-pointer"
          >
            <Plus size={14} />
            New series
          </button>
        </header>

        {filterOpen && (
          <div className="border-b border-smoke-light bg-smoke-dark px-6 py-4 shrink-0 space-y-4">

            {/* Sort */}
            <div>
              <p className="text-ice/30 text-xs uppercase tracking-widest mb-2">Sort</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['name',    'Title A–Z'],
                  ['author',  'Author A–Z'],
                  ['year',    'Published year'],
                  ['addedAt', 'Date added'],
                ].map(([val, label]) => (
                  <button key={val} onClick={() => setFilter('sort', val)}
                    className={['px-2.5 py-1 rounded text-xs transition-colors cursor-pointer border',
                      filters.sort === val ? 'border-amber text-amber bg-amber/10' : 'border-smoke-light text-ice/40 hover:text-ice hover:border-steel/40'].join(' ')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Completion */}
            <div>
              <p className="text-ice/30 text-xs uppercase tracking-widest mb-2">Completion</p>
              <div className="flex flex-wrap gap-1.5">
                {[['', 'All'], ['complete', 'Complete'], ['incomplete', 'In progress']].map(([val, label]) => (
                  <button key={val} onClick={() => setFilter('completion', val)}
                    className={['px-2.5 py-1 rounded text-xs transition-colors cursor-pointer border',
                      filters.completion === val ? 'border-amber text-amber bg-amber/10' : 'border-smoke-light text-ice/40 hover:text-ice hover:border-steel/40'].join(' ')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Read status */}
            <div>
              <p className="text-ice/30 text-xs uppercase tracking-widest mb-2">Status</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['',              'Any status'],
                  ['reading',       'Reading'],
                  ['want-to-read',  'Want to read'],
                  ['read',          'Read'],
                  ['did-not-finish','Did not finish'],
                ].map(([val, label]) => (
                  <button key={val} onClick={() => setFilter('status', val)}
                    className={['px-2.5 py-1 rounded text-xs transition-colors cursor-pointer border',
                      filters.status === val ? 'border-amber text-amber bg-amber/10' : 'border-smoke-light text-ice/40 hover:text-ice hover:border-steel/40'].join(' ')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Author */}
            <div>
              <p className="text-ice/30 text-xs uppercase tracking-widest mb-2">Author</p>
              <AutocompleteInput
                value={filters.author}
                onChange={v => setFilter('author', v)}
                placeholder="Author name"
                fetchSuggestions={authorSuggestions}
                minChars={1}
                className="w-64 bg-smoke border border-smoke-light rounded px-3 py-2 text-sm text-ice placeholder-ice/30 focus:outline-none focus:border-steel transition-colors"
              />
            </div>

            {/* Clear */}
            {activeFilterCount > 0 && (
              <button onClick={resetFilters}
                className="flex items-center gap-1 text-ice/30 text-xs hover:text-ice transition-colors cursor-pointer">
                <X size={11} /> Clear all filters
              </button>
            )}
          </div>
        )}

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

          {!loading && !error && series.length > 0 && processedSeries.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <p className="font-serif text-ice/40">No series match these filters</p>
              <button onClick={resetFilters} className="mt-3 text-steel text-sm hover:text-ice transition-colors cursor-pointer">
                Clear filters
              </button>
            </div>
          )}

          {!loading && processedSeries.length > 0 && (
            <div className="space-y-6">
              {processedSeries.map(s => (
                <SeriesCard
                  key={s.id}
                  series={s}
                  toggling={toggling}
                  onToggleOwned={handleToggleOwned}
                  onEdit={() => setEditingSeries(s)}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Editor panel — right sidebar on md+, full-screen overlay on mobile */}
      {editingSeries && (
        <>
          {/* Mobile backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-noir/60 backdrop-blur-[2px]"
            aria-hidden="true"
            onClick={() => setEditingSeries(null)}
          />
          <div className="fixed inset-0 z-50 md:static md:z-auto md:inset-auto md:w-96 md:shrink-0 md:border-l md:border-smoke-light md:h-full">
            <SeriesEditor
              series={editorSeries}
              onClose={() => setEditingSeries(null)}
              onSaved={handleSaved}
            />
          </div>
        </>
      )}
    </div>
  )
}

/* ── Series card ────────────────────────────────────────────────────────────── */

function SeriesCard({ series, toggling, onToggleOwned, onEdit, onDelete }) {
  const [collapsed, setCollapsed] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pct = series.completionPct ?? 0
  const isComplete = series.completedAt != null

  const headingId = `series-${series.id}-heading`
  const listId    = `series-${series.id}-books`

  return (
    <div className="bg-smoke border border-smoke-light rounded-lg overflow-hidden">
      {/* Card header */}
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={listId}
        className="w-full text-left px-5 py-4 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-steel"
        onClick={() => { setCollapsed(c => !c); setConfirmDelete(false) }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={headingId} className="font-serif text-ice text-base font-semibold">{series.name}</h2>
            <p className="text-ice/40 text-xs mt-0.5">
              {series.ownedCount ?? 0} of {series.totalBooks} owned
              {isComplete && (
                <span className="ml-2 text-amber">· Complete</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-ice/50 text-sm font-mono">{Math.round(pct)}%</span>

            {/* Delete — two-click confirm */}
            {confirmDelete ? (
              <>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => { e.stopPropagation(); onDelete(series.id) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onDelete(series.id) } }}
                  className="text-blood text-xs hover:text-blood/70 cursor-pointer transition-colors"
                >
                  Delete?
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); setConfirmDelete(false) } }}
                  className="text-ice/30 text-xs hover:text-ice cursor-pointer transition-colors"
                >
                  No
                </span>
              </>
            ) : (
              <span
                role="button"
                tabIndex={0}
                onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setConfirmDelete(true) } }}
                aria-label={`Delete ${series.name}`}
                className="text-ice/20 hover:text-blood transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
              </span>
            )}

            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onEdit() }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onEdit() } }}
              aria-label={`Edit ${series.name}`}
              className="text-ice/30 hover:text-amber transition-colors cursor-pointer"
            >
              <Pencil size={14} />
            </span>
            <ChevronDown
              size={16}
              className={[
                'text-ice/30 transition-transform duration-200',
                collapsed ? '' : 'rotate-180',
              ].join(' ')}
              aria-hidden="true"
            />
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
      </button>

      {/* Book list — collapsible */}
      {!collapsed && series.books?.length > 0 && (
        <div id={listId} className="divide-y divide-smoke-light border-t border-smoke-light">
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

      {/* Cover thumbnail — shown when linked to a library book */}
      {book.bookId && (
        <img
          src={book.coverUrl || `/api/covers/${book.bookId}`}
          alt=""
          className="w-7 h-10 object-cover rounded-sm shrink-0 opacity-80"
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      )}

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
