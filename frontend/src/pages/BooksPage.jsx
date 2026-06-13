import { useEffect } from 'react'
import { BookOpen, Grid3X3, AlignJustify, BookMarked } from 'lucide-react'
import { useLibraryStore } from '../store/useLibraryStore.js'
import { useUIStore } from '../store/useUIStore.js'
import Spinner from '../components/ui/Spinner.jsx'
import Button from '../components/ui/Button.jsx'
import SpineView from '../components/BookViews/SpineView.jsx'
import GridView from '../components/BookViews/GridView.jsx'
import ListView from '../components/BookViews/ListView.jsx'

const VIEW_ICONS = {
  spine: BookMarked,
  grid:  Grid3X3,
  list:  AlignJustify,
}

const READ_STATUS_OPTIONS = [
  { value: '',              label: 'All'          },
  { value: 'read',         label: 'Read'         },
  { value: 'reading',      label: 'Reading'      },
  { value: 'want-to-read', label: 'Want to read' },
]

export default function BooksPage() {
  const { books, totalBooks, booksLoading, booksError, fetchBooks, setBooksFilter, booksFilters } =
    useLibraryStore()
  const { booksView, setBooksView, setAddBookOpen } = useUIStore()

  useEffect(() => { fetchBooks() }, [])

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <header className="flex items-center gap-4 px-6 py-4 border-b border-smoke-light shrink-0">
        <h1 className="font-serif text-xl text-ice mr-auto">
          Library
          {totalBooks > 0 && (
            <span className="ml-2 font-sans text-sm text-ice/40 font-normal">
              {totalBooks} books
            </span>
          )}
        </h1>

        <select
          value={booksFilters.status}
          onChange={e => setBooksFilter('status', e.target.value)}
          className="bg-smoke border border-smoke-light text-ice/80 text-sm rounded px-3 py-1.5 cursor-pointer"
        >
          {READ_STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="flex gap-1 border border-smoke-light rounded p-0.5">
          {Object.entries(VIEW_ICONS).map(([mode, Icon]) => (
            <button
              key={mode}
              onClick={() => setBooksView(mode)}
              title={mode}
              className={[
                'p-1.5 rounded transition-colors cursor-pointer',
                booksView === mode ? 'bg-smoke-light text-amber' : 'text-ice/40 hover:text-ice',
              ].join(' ')}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>

        <Button onClick={() => setAddBookOpen(true)} size="sm">
          + Add book
        </Button>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {booksLoading && (
          <div className="flex items-center justify-center h-48">
            <Spinner size={32} />
          </div>
        )}

        {booksError && (
          <div className="text-blood/80 text-sm p-4 border border-blood/30 rounded bg-blood/5">
            {booksError}
          </div>
        )}

        {!booksLoading && !booksError && books.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <BookOpen size={48} className="text-ice/20 mb-4" />
            <p className="font-serif text-ice/40 text-lg">No books yet</p>
            <p className="text-ice/30 text-sm mt-1">Add your first book to get started</p>
            <Button className="mt-6" onClick={() => setAddBookOpen(true)}>
              + Add book
            </Button>
          </div>
        )}

        {!booksLoading && books.length > 0 && booksView === 'spine' && (
          <SpineView books={books} />
        )}
        {!booksLoading && books.length > 0 && booksView === 'grid' && (
          <GridView books={books} />
        )}
        {!booksLoading && books.length > 0 && booksView === 'list' && (
          <ListView books={books} />
        )}
      </div>
    </div>
  )
}
