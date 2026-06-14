import { useState } from 'react'
import BookDetailPanel from './BookDetailPanel.jsx'
import { authorNames } from '../../utils/authors.js'
import { coverPlaceholder } from '../../utils/coverPlaceholder.js'
import { useUIStore } from '../../store/useUIStore.js'

export default function GridView({ books, selectMode = false, selectedIds, onToggleSelect }) {
  const [panelBook, setPanelBook] = useState(null)
  const density = useUIStore(s => s.booksDensity)
  const minPx = density === 'compact' ? '120px' : '155px'

  function handleCardClick(book) {
    if (selectMode) {
      onToggleSelect?.(book.id)
    } else {
      setPanelBook(s => s?.id === book.id ? null : book)
    }
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minPx}, 1fr))`, gap: density === 'compact' ? 12 : 20 }}>
        {books.map((book, i) => (
          <BookCard
            key={book.id}
            book={book}
            index={i}
            compact={density === 'compact'}
            isSelected={selectMode ? selectedIds?.has(book.id) : panelBook?.id === book.id}
            selectMode={selectMode}
            onSelect={() => handleCardClick(book)}
          />
        ))}
      </div>
      {!selectMode && <BookDetailPanel book={panelBook} onClose={() => setPanelBook(null)} />}
    </>
  )
}

function BookCard({ book, index, compact, isSelected, selectMode, onSelect }) {
  const { bg, fg, initials } = coverPlaceholder(book)
  const names = authorNames(book.authors)
  const [imgError, setImgError] = useState(false)
  const showCover = book.coverUrl && !imgError

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={`${book.title}${names[0] ? `, ${names[0]}` : ''}${selectMode ? (isSelected ? ' — selected' : ' — not selected') : ''}`}
      className={[
        'group flex flex-col gap-2 cursor-pointer text-left bg-transparent border-0 p-0 w-full card-enter',
        !selectMode && isSelected ? 'scale-[0.97]' : '',
      ].join(' ')}
      style={{ animationDelay: `${Math.min(index, 30) * 0.03}s` }}
    >
      {/* Cover */}
      <div
        className={[
          'w-full rounded-xl relative overflow-hidden',
          'shadow-lg shadow-black/40',
          'transition-all duration-200 ease-out',
          'group-hover:-translate-y-1.5 group-hover:scale-[1.02]',
          isSelected && !selectMode ? 'ring-2 ring-amber ring-offset-2 ring-offset-noir' : '',
          isSelected && selectMode  ? 'ring-2 ring-steel ring-offset-2 ring-offset-noir' : '',
        ].join(' ')}
        style={{
          aspectRatio: '2/3',
          backgroundColor: bg,
          boxShadow: undefined,
        }}
      >
        {/* Amber hover glow — via pseudo-like inner shadow using a sibling */}
        <div
          className="absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-200 opacity-0 group-hover:opacity-100"
          style={{ boxShadow: 'inset 0 0 0 0, 0 8px 32px rgba(232,160,32,0.18)' }}
          aria-hidden="true"
        />

        {showCover ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center p-3 gap-2">
              <span
                className="font-serif font-bold leading-none select-none"
                style={{ color: fg, fontSize: compact ? 20 : 28 }}
              >
                {initials}
              </span>
              {!compact && (
                <span
                  className="font-serif text-center leading-tight line-clamp-3"
                  style={{ color: fg, fontSize: 8, opacity: 0.7 }}
                >
                  {book.title}
                </span>
              )}
            </div>
            {book.genres?.[0] && (
              <div className="shrink-0 h-1.5 opacity-60" style={{ backgroundColor: fg }} />
            )}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2.5">
          {names.length > 0 && (
            <p className="text-white/80 text-[10px] leading-snug line-clamp-1">{names.join(', ')}</p>
          )}
          {book.rating > 0 && (
            <p className="text-amber text-[10px] mt-0.5">{'★'.repeat(book.rating)}</p>
          )}
        </div>

        {/* Status indicator / progress ring */}
        <StatusIndicator status={book.readStatus} progress={book.progress} pageCount={book.pageCount} />

        {/* Select-mode check overlay */}
        {selectMode && (
          <div className={[
            'absolute inset-0 transition-colors duration-150 flex items-end justify-end p-2',
            isSelected ? 'bg-steel/20' : 'bg-transparent',
          ].join(' ')}>
            <span className={[
              'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150',
              isSelected ? 'bg-steel border-steel' : 'bg-noir/60 border-white/30',
            ].join(' ')}>
              {isSelected && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Below cover */}
      <div className="px-0.5">
        <p className={[
          'text-ice/90 font-semibold leading-snug line-clamp-2 group-hover:text-ice transition-colors',
          compact ? 'text-[11px]' : 'text-xs',
        ].join(' ')}>
          {book.title}
        </p>
        {names[0] && (
          <p className="text-ice/35 mt-0.5 truncate text-[11px]">
            {names[0]}
          </p>
        )}
      </div>
    </button>
  )
}

/* ── Status indicator: dot for most statuses, mini progress ring for reading ── */

const DOT_COLOR = {
  'read':           { bg: 'bg-amber',    shadow: 'shadow-amber/50'  },
  'want-to-read':   { bg: 'bg-steel',    shadow: 'shadow-steel/50'  },
  'did-not-finish': { bg: 'bg-ice/30',   shadow: ''                 },
  'to-read':        { bg: 'bg-steel',    shadow: 'shadow-steel/50'  },
  'finished':       { bg: 'bg-amber',    shadow: 'shadow-amber/50'  },
}

function StatusIndicator({ status, progress, pageCount }) {
  if (status === 'reading' && pageCount > 0) {
    const pct = Math.min(100, Math.round(((progress ?? 0) / pageCount) * 100))
    return (
      <span className="absolute top-1.5 right-1.5 drop-shadow-md">
        <MiniProgressRing pct={pct} />
      </span>
    )
  }
  const c = DOT_COLOR[status]
  if (!c) return null
  return <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${c.bg} shadow-md ${c.shadow}`} />
}

function MiniProgressRing({ pct, size = 20 }) {
  const r    = (size - 3.5) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * (1 - pct / 100)
  const cx   = size / 2
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cx} r={r} fill="rgba(12,12,12,0.75)" stroke="rgba(255,255,255,0.12)" strokeWidth={2.5} />
      <circle
        cx={cx} cy={cx} r={r}
        fill="none"
        stroke="#c0392b"
        strokeWidth={2.5}
        strokeDasharray={circ}
        strokeDashoffset={dash}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
      />
      <text x={cx} y={cx + 3} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="5" fontFamily="system-ui,sans-serif">
        {pct}
      </text>
    </svg>
  )
}
