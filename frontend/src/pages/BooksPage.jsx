import { useEffect, useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BookOpen, Grid3X3, AlignJustify, BookMarked, LayoutGrid,
  SlidersHorizontal, ChevronLeft, ChevronRight, X,
  CheckSquare, Square, Trash2, BookCheck, ArrowUpDown,
} from 'lucide-react'
import { useLibraryStore } from '../store/useLibraryStore.js'
import { useUIStore } from '../store/useUIStore.js'
import { booksApi } from '../api/books.js'
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

const PARAM_KEYS = ['status', 'genre', 'sort', 'owned', 'author', 'series']

const STATUS_OPTIONS = [
  { value: 'read',          label: 'Read'          },
  { value: 'reading',       label: 'Reading'       },
  { value: 'want-to-read',  label: 'Want to read'  },
  { value: 'did-not-finish',label: 'Did not finish' },
]

const SORT_OPTIONS = [
  { value: 'addedAt',      label: 'Date added' },
  { value: 'title',        label: 'Title'      },
  { value: 'author',       label: 'Author'     },
  { value: 'rating',       label: 'Rating'     },
  { value: 'publishedYear',label: 'Year'       },
]

export default function BooksPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const {
    books, totalBooks, booksLoading, booksError,
    fetchBooks, setBooksFilters, resetBooksFilters,
    booksFilters, booksPage, booksLimit, setBooksPage,
    removeBook, upsertBook,
  } = useLibraryStore()

  const {
    booksView, setBooksView, setAddBookOpen,
    booksDensity, toggleBooksDensity,
    addToast,
  } = useUIStore()

  // ── Bulk select state ──────────────────────────────────────────────────────
  const [selectMode,  setSelectMode]  = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkBusy,    setBulkBusy]    = useState(false)
  const [showStatus,  setShowStatus]  = useState(false)

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === books.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(books.map(b => b.id)))
    }
  }

  function exitSelect() {
    setSelectMode(false)
    setSelectedIds(new Set())
    setShowStatus(false)
  }

  async function handleBulkStatus(status) {
    if (!selectedIds.size || bulkBusy) return
    setBulkBusy(true)
    setShowStatus(false)
    const ids = [...selectedIds]
    try {
      await Promise.all(ids.map(id => booksApi.updateStatus(id, { readStatus: status })))
      ids.forEach(id => {
        const book = books.find(b => b.id === id)
        if (book) upsertBook({ ...book, readStatus: status })
      })
      addToast(`${ids.length} book${ids.length > 1 ? 's' : ''} marked as "${status}"`, 'success')
      exitSelect()
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkDelete() {
    if (!selectedIds.size || bulkBusy) return
    setBulkBusy(true)
    const ids = [...selectedIds]
    try {
      await Promise.all(ids.map(id => booksApi.delete(id)))
      ids.forEach(id => removeBook(id))
      addToast(`${ids.length} book${ids.length > 1 ? 's' : ''} deleted`, 'info')
      exitSelect()
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleFetchCover(bookId) {
    try {
      const data = await booksApi.fetchCover(bookId)
      if (data?.coverUrl) {
        const book = books.find(b => b.id === bookId)
        if (book) upsertBook({ ...book, coverUrl: data.coverUrl })
        addToast('Cover found', 'success')
      } else {
        addToast('No cover found for this book', 'info')
      }
    } catch {
      addToast('Could not fetch cover', 'error')
    }
  }

  // ── URL sync ───────────────────────────────────────────────────────────────
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

  useEffect(() => {
    const params = {}
    PARAM_KEYS.forEach(k => {
      if (booksFilters[k]) params[k] = booksFilters[k]
    })
    setSearchParams(params, { replace: true })
  }, [booksFilters, setSearchParams])

  const totalPages = Math.max(1, Math.ceil(totalBooks / booksLimit))
  const activeFilterCount = PARAM_KEYS.filter(k => k !== 'sort' && booksFilters[k]).length

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <header className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-3 border-b border-smoke-light shrink-0">
        {selectMode ? (
          /* Select-mode toolbar */
          <>
            <button onClick={toggleAll} className="flex items-center gap-1.5 text-sm text-ice/60 hover:text-ice transition-colors cursor-pointer">
              {selectedIds.size === books.length
                ? <CheckSquare size={15} className="text-steel" />
                : <Square size={15} />}
              <span>{selectedIds.size} selected</span>
            </button>
            <span className="ml-auto" />
            <button
              onClick={() => setShowStatus(v => !v)}
              disabled={!selectedIds.size || bulkBusy}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-smoke-light text-sm text-ice/50 hover:text-ice disabled:opacity-30 transition-colors cursor-pointer"
            >
              <BookCheck size={14} /> Status
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={!selectedIds.size || bulkBusy}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-blood/40 text-blood text-sm hover:bg-blood/10 disabled:opacity-30 transition-colors cursor-pointer"
            >
              <Trash2 size={14} /> Delete
            </button>
            <button onClick={exitSelect} className="px-2.5 py-1.5 text-sm text-ice/40 hover:text-ice transition-colors cursor-pointer">
              Cancel
            </button>
          </>
        ) : (
          /* Normal toolbar */
          <>
            <h1 className="font-serif text-xl text-ice mr-auto">
              Library
              {totalBooks > 0 && <span className="ml-2 font-sans text-sm text-ice/40 font-normal">{totalBooks}</span>}
            </h1>

            <button
              onClick={() => useFilterDrawer.setState({ open: true })}
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

            {booksView === 'grid' && (
              <button onClick={toggleBooksDensity} title={booksDensity === 'compact' ? 'Normal density' : 'Compact density'}
                className={['p-1.5 rounded border transition-colors cursor-pointer', booksDensity === 'compact' ? 'border-amber/40 text-amber bg-amber/10' : 'border-smoke-light text-ice/40 hover:text-ice'].join(' ')}>
                <LayoutGrid size={16} />
              </button>
            )}

            <div className="flex gap-1 border border-smoke-light rounded p-0.5">
              {Object.entries(VIEW_ICONS).map(([mode, Icon]) => (
                <button key={mode} onClick={() => setBooksView(mode)} title={mode}
                  className={['p-1.5 rounded transition-colors cursor-pointer', booksView === mode ? 'bg-smoke-light text-amber' : 'text-ice/40 hover:text-ice'].join(' ')}>
                  <Icon size={16} />
                </button>
              ))}
            </div>

            {/* Select mode toggle (only grid/list) */}
            {booksView !== 'spine' && books.length > 0 && (
              <button
                onClick={() => setSelectMode(true)}
                className="p-1.5 rounded border border-smoke-light text-ice/40 hover:text-ice transition-colors cursor-pointer"
                title="Select books"
              >
                <CheckSquare size={16} />
              </button>
            )}

            <Button onClick={() => setAddBookOpen(true)} size="sm" className="hidden sm:inline-flex">
              + Add book
            </Button>
          </>
        )}
      </header>

      {/* Status picker popover */}
      {showStatus && (
        <div className="border-b border-smoke-light bg-smoke-dark px-4 py-2 flex flex-wrap gap-2 shrink-0">
          {STATUS_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => handleBulkStatus(o.value)}
              disabled={bulkBusy}
              className="px-3 py-1.5 text-xs rounded border border-smoke-light text-ice/60 hover:border-steel hover:text-ice transition-colors cursor-pointer disabled:opacity-40"
            >
              {o.label}
            </button>
          ))}
          <button onClick={() => setShowStatus(false)} className="ml-auto text-ice/30 hover:text-ice text-xs cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Sort strip ── */}
      {!selectMode && (
        <div className="flex items-center gap-1 px-4 md:px-6 py-1.5 border-b border-smoke-light shrink-0">
          <ArrowUpDown size={12} className="text-ice/25 mr-1" />
          {SORT_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setBooksFilters({ sort: o.value })}
              className={[
                'px-2.5 py-1 rounded text-xs transition-colors cursor-pointer',
                (booksFilters.sort ?? 'addedAt') === o.value
                  ? 'text-amber bg-amber/10'
                  : 'text-ice/35 hover:text-ice',
              ].join(' ')}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
        {/* Active filter chips */}
        {activeFilterCount > 0 && !selectMode && (
          <div className="flex flex-wrap gap-2 mb-4">
            {PARAM_KEYS.filter(k => k !== 'sort' && booksFilters[k]).map(k => (
              <span key={k} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-smoke-light text-ice/70 text-xs">
                <span className="capitalize text-ice/40">{k}:</span>
                {booksFilters[k]}
                <button onClick={() => setBooksFilters({ [k]: '' })}
                  className="text-ice/40 hover:text-ice ml-0.5 cursor-pointer" aria-label={`Remove ${k} filter`}>
                  <X size={11} />
                </button>
              </span>
            ))}
            <button onClick={resetBooksFilters} className="text-ice/30 text-xs hover:text-ice transition-colors cursor-pointer underline underline-offset-2">
              Clear all
            </button>
          </div>
        )}

        {/* Skeleton */}
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
        {!booksLoading && books.length > 0 && booksView === 'grid' && (
          <GridView books={books} selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} onFetchCover={handleFetchCover} />
        )}
        {!booksLoading && books.length > 0 && booksView === 'list' && (
          <ListView books={books} selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} onFetchCover={handleFetchCover} />
        )}

        {/* Pagination */}
        {!booksLoading && totalPages > 1 && !selectMode && (
          <div className="flex items-center justify-center gap-3 mt-8" role="navigation" aria-label="Page navigation">
            <button onClick={() => setBooksPage(booksPage - 1)} disabled={booksPage <= 1} aria-label="Previous page"
              className="p-2 rounded border border-smoke-light text-ice/50 hover:text-ice disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer">
              <ChevronLeft size={16} />
            </button>
            <span className="text-ice/50 text-sm">
              Page <span className="text-ice font-medium">{booksPage}</span> of {totalPages}
            </span>
            <button onClick={() => setBooksPage(booksPage + 1)} disabled={booksPage >= totalPages} aria-label="Next page"
              className="p-2 rounded border border-smoke-light text-ice/50 hover:text-ice disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Mobile FAB */}
      {!selectMode && (
        <button onClick={() => setAddBookOpen(true)}
          className="sm:hidden fixed bottom-20 right-4 z-20 w-12 h-12 rounded-full bg-amber text-noir flex items-center justify-center shadow-lg shadow-amber/30 text-2xl font-light"
          aria-label="Add book">
          +
        </button>
      )}

      <FilterDrawer filters={booksFilters} onApply={(f) => setBooksFilters(f)} onReset={resetBooksFilters} />
    </div>
  )
}

import { create as createStore } from 'zustand'
export const useFilterDrawer = createStore((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
}))
