import { useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BookOpen, Grid3X3, AlignJustify, BookMarked, LayoutGrid,
  SlidersHorizontal, ChevronLeft, ChevronRight, X,
} from 'lucide-react'
import { useLibraryStore } from '../store/useLibraryStore.js'
import { useUIStore } from '../store/useUIStore.js'
import Button from '../components/ui/Button.jsx'
import SpineView from '../components/BookViews/SpineView.jsx'
import GridView from '../components/BookViews/GridView.jsx'
import ListView from '../components/BookViews/ListView.jsx'
import { SkeletonBookCard, SkeletonListRow } from '../components/ui/SkeletonCard.jsx'
import FilterDrawer from '../components/books/FilterDrawer.jsx'

const VIEW_ICONS = {
  spine: BookMarked,
  grid:  Grid3X3,
  list:  AlignJustify,
}

// URL param ↔ filter key mapping
const PARAM_KEYS = ['status', 'genre', 'sort', 'owned', 'author', 'series']

export default function BooksPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const {
    books, totalBooks, booksLoading, booksError,
    fetchBooks, setBooksFilters, resetBooksFilters,
    booksFilters, booksPage, booksLimit, setBooksPage,
  } = useLibraryStore()

  const {
    booksView, setBooksView, setAddBookOpen,
    booksDensity, toggleBooksDensity,
  } = useUIStore()

  // On mount: hydrate filters from URL params
  useEffect(() => {
    const fromUrl = {}
    PARAM_KEYS.forEach(k => {
      const v = searchParams.get(k)
      if (v != null) fromUrl[k] = v
    })
    if (Object.keys(fromUrl).length) {
      setBooksFilters(fromUrl)
    } else {
      fetchBooks()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep URL in sync when filters change
  useEffect(() => {
    const params = {}
    PARAM_KEYS.forEach(k => {
      if (booksFilters[k]) params[k] = booksFilters[k]
    })
    setSearchParams(params, { replace: true })
  }, [booksFilters, setSearchParams])

  const totalPages = Math.max(1, Math.ceil(totalBooks / booksLimit))

  const activeFilterCount = PARAM_KEYS.filter(k =>
    k !== 'sort' && booksFilters[k]
  ).length

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <header className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-3 border-b border-smoke-light shrink-0">
        <h1 className="font-serif text-xl text-ice mr-auto">
          Library
          {totalBooks > 0 && (
            <span className="ml-2 font-sans text-sm text-ice/40 font-normal">{totalBooks}</span>
          )}
        </h1>

        {/* Filter drawer toggle */}
        <button
          onClick={() => useFilterDrawer.setState({ open: true })}
          title="Filters & sort"
          className={[
            'relative flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-sm transition-colors cursor-pointer',
            activeFilterCount > 0
              ? 'border-amber/40 text-amber bg-amber/10'
              : 'border-smoke-light text-ice/50 hover:text-ice',
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

        {/* Density toggle (grid only) */}
        {booksView === 'grid' && (
          <button
            onClick={toggleBooksDensity}
            title={booksDensity === 'compact' ? 'Normal density' : 'Compact density'}
            className={[
              'p-1.5 rounded border transition-colors cursor-pointer',
              booksDensity === 'compact'
                ? 'border-amber/40 text-amber bg-amber/10'
                : 'border-smoke-light text-ice/40 hover:text-ice',
            ].join(' ')}
          >
            <LayoutGrid size={16} />
          </button>
        )}

        {/* View switcher */}
        <div className="flex gap-1 border border-smoke-light rounded p-0.5">
          {Object.entries(VIEW_ICONS).map(([mode, Icon]) => (
            <button key={mode} onClick={() => setBooksView(mode)} title={mode}
              className={['p-1.5 rounded transition-colors cursor-pointer', booksView === mode ? 'bg-smoke-light text-amber' : 'text-ice/40 hover:text-ice'].join(' ')}>
              <Icon size={16} />
            </button>
          ))}
        </div>

        <Button onClick={() => setAddBookOpen(true)} size="sm" className="hidden sm:inline-flex">
          + Add book
        </Button>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {PARAM_KEYS.filter(k => k !== 'sort' && booksFilters[k]).map(k => (
              <span key={k} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-smoke-light text-ice/70 text-xs">
                <span className="capitalize text-ice/40">{k}:</span>
                {booksFilters[k]}
                <button
                  onClick={() => setBooksFilters({ [k]: '' })}
                  className="text-ice/40 hover:text-ice ml-0.5 cursor-pointer"
                  aria-label={`Remove ${k} filter`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <button onClick={resetBooksFilters}
              className="text-ice/30 text-xs hover:text-ice transition-colors cursor-pointer underline underline-offset-2">
              Clear all
            </button>
          </div>
        )}

        {/* Skeleton loading */}
        {booksLoading && booksView === 'list' && (
          <div className="flex flex-col divide-y divide-white/[0.04]">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonListRow key={i} />)}
          </div>
        )}
        {booksLoading && booksView !== 'list' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 20 }}>
            {Array.from({ length: 12 }).map((_, i) => <SkeletonBookCard key={i} />)}
          </div>
        )}

        {booksError && (
          <div className="text-blood/80 text-sm p-4 border border-blood/30 rounded bg-blood/5">{booksError}</div>
        )}

        {!booksLoading && !booksError && books.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <BookOpen size={48} className="text-ice/20 mb-4" />
            <p className="font-serif text-ice/40 text-lg">No books yet</p>
            <p className="text-ice/30 text-sm mt-1">Add your first book to get started</p>
            <Button className="mt-6" onClick={() => setAddBookOpen(true)}>+ Add book</Button>
          </div>
        )}

        {!booksLoading && books.length > 0 && booksView === 'spine' && <SpineView books={books} />}
        {!booksLoading && books.length > 0 && booksView === 'grid'  && <GridView books={books} />}
        {!booksLoading && books.length > 0 && booksView === 'list'  && <ListView books={books} />}

        {/* Pagination */}
        {!booksLoading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8" role="navigation" aria-label="Page navigation">
            <button
              onClick={() => setBooksPage(booksPage - 1)}
              disabled={booksPage <= 1}
              aria-label="Previous page"
              className="p-2 rounded border border-smoke-light text-ice/50 hover:text-ice disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>

            <span className="text-ice/50 text-sm">
              Page <span className="text-ice font-medium">{booksPage}</span> of {totalPages}
            </span>

            <button
              onClick={() => setBooksPage(booksPage + 1)}
              disabled={booksPage >= totalPages}
              aria-label="Next page"
              className="p-2 rounded border border-smoke-light text-ice/50 hover:text-ice disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => setAddBookOpen(true)}
        className="sm:hidden fixed bottom-20 right-4 z-20 w-12 h-12 rounded-full bg-amber text-noir flex items-center justify-center shadow-lg shadow-amber/30 text-2xl font-light"
        aria-label="Add book"
      >
        +
      </button>

      <FilterDrawer
        filters={booksFilters}
        onApply={(f) => setBooksFilters(f)}
        onReset={resetBooksFilters}
      />
    </div>
  )
}

// Minimal external store so FilterDrawer can open itself without prop drilling
import { create as createStore } from 'zustand'
export const useFilterDrawer = createStore((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
}))
