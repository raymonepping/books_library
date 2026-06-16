import { useState, useRef, useEffect } from 'react'
import BookDetailPanel from './BookDetailPanel.jsx'
import { spineColor, spineWidth, spineHeight } from './spineUtils.js'

const BOOKS_PER_SHELF = 18

// Split books into equal shelf rows
function toShelves(books, perShelf) {
  const shelves = []
  for (let i = 0; i < books.length; i += perShelf) {
    shelves.push(books.slice(i, i + perShelf))
  }
  if (!shelves.length) shelves.push([]) // always at least one shelf
  return shelves
}

export default function SpineView({ books }) {
  const [selected, setSelected] = useState(null)
  const containerRef = useRef(null)

  // Close panel on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function handleSelect(book) {
    setSelected(s => s?.id === book.id ? null : book)
  }

  const shelves = toShelves(books, BOOKS_PER_SHELF)

  return (
    <div ref={containerRef} className="select-none">
      {shelves.map((shelfBooks, shelfIdx) => (
        <Shelf
          key={shelfIdx}
          books={shelfBooks}
          selectedId={selected?.id}
          onSelect={handleSelect}
        />
      ))}

      <BookDetailPanel book={selected} onClose={() => setSelected(null)} onBookSelect={setSelected} />
    </div>
  )
}

/* ── Shelf row ──────────────────────────────────────────────────────────────── */

function Shelf({ books, selectedId, onSelect }) {
  return (
    <div className="mb-6">
      {/* Books standing on the shelf */}
      <div className="flex items-end gap-px px-2 min-h-[220px]"
           style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.12) 100%)' }}>
        {books.map(book => (
          <SpineBook
            key={book.id}
            book={book}
            isSelected={selectedId === book.id}
            onClick={() => onSelect(book)}
          />
        ))}
        {/* Filler to push books left and show empty shelf space */}
        <div className="flex-1" />
      </div>

      {/* Shelf plank */}
      <div
        className="rounded-sm"
        style={{
          height: 14,
          background: 'linear-gradient(180deg, #6b4520 0%, #3d2810 45%, #291a08 100%)',
          boxShadow: '0 6px 16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,200,100,0.07)',
        }}
      />

      {/* Shadow under shelf */}
      <div
        className="rounded-b"
        style={{
          height: 8,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 100%)',
        }}
      />
    </div>
  )
}

/* ── Individual spine ───────────────────────────────────────────────────────── */

function SpineBook({ book, isSelected, onClick }) {
  const { bg, fg } = spineColor(book)
  const w = spineWidth(book)
  const h = spineHeight(book)

  return (
    <button
      onClick={onClick}
      title={book.title}
      style={{ width: w, height: h, backgroundColor: bg, color: fg }}
      className={[
        'relative shrink-0 flex items-center justify-center',
        'cursor-pointer transition-all duration-150 ease-out',
        'rounded-t-[2px]',
        isSelected
          ? 'scale-110 -translate-y-3 z-10'
          : 'hover:scale-[1.06] hover:-translate-y-2 hover:z-10',
      ].join(' ')}
    >
      {/* Spine gradient overlay — simulates light from top */}
      <div
        className="absolute inset-0 pointer-events-none rounded-t-[2px]"
        style={{
          background: 'linear-gradient(90deg, rgba(255,255,255,0.08) 0%, transparent 40%, rgba(0,0,0,0.25) 100%)',
        }}
      />

      {/* Title text — only if spine is wide enough */}
      {w >= 24 && (
        <span
          className="relative z-10 font-sans font-medium leading-tight overflow-hidden"
          style={{
            fontSize: 8,
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            maxHeight: h - 12,
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '0.04em',
            opacity: 0.9,
          }}
        >
          {book.title}
        </span>
      )}

      {/* Selection ring */}
      {isSelected && (
        <div
          className="absolute inset-0 rounded-t-[2px] pointer-events-none"
          style={{ boxShadow: '0 0 0 2px #e8a020, 0 8px 24px rgba(232,160,32,0.35)' }}
        />
      )}

      {/* Read status dot — bottom of spine */}
      <StatusDot status={book.readStatus} />
    </button>
  )
}

/* ── Status dot on bottom of spine ─────────────────────────────────────────── */

const DOT_COLORS = {
  'read':           '#e8a020',  // amber
  'reading':        '#c0392b',  // blood
  'want-to-read':   '#4a6fa5',  // steel
  'did-not-finish': '#3a3a3a',  // muted
}

function StatusDot({ status }) {
  const color = DOT_COLORS[status]
  if (!color) return null
  return (
    <span
      className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full"
      style={{ width: 4, height: 4, backgroundColor: color }}
    />
  )
}
