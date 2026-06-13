import { useState } from 'react'
import BookDetailPanel from './BookDetailPanel.jsx'
import { authorNames } from '../../utils/authors.js'
import { coverPlaceholder } from '../../utils/coverPlaceholder.js'
import { useUIStore } from '../../store/useUIStore.js'

export default function GridView({ books }) {
  const [selected, setSelected] = useState(null)
  const density = useUIStore(s => s.booksDensity)
  const minPx = density === 'compact' ? '120px' : '155px'

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minPx}, 1fr))`, gap: density === 'compact' ? 12 : 20 }}>
        {books.map(book => (
          <BookCard
            key={book.id}
            book={book}
            compact={density === 'compact'}
            isSelected={selected?.id === book.id}
            onSelect={() => setSelected(s => s?.id === book.id ? null : book)}
          />
        ))}
      </div>
      <BookDetailPanel book={selected} onClose={() => setSelected(null)} />
    </>
  )
}

function BookCard({ book, compact, isSelected, onSelect }) {
  const { bg, fg, initials } = coverPlaceholder(book)
  const names = authorNames(book.authors)
  const [imgError, setImgError] = useState(false)
  const showCover = book.coverUrl && !imgError

  return (
    <div
      onClick={onSelect}
      className={[
        'group flex flex-col gap-2 cursor-pointer',
        isSelected ? 'scale-[0.97]' : '',
      ].join(' ')}
    >
      {/* Cover */}
      <div
        className={[
          'w-full rounded-xl relative overflow-hidden',
          'shadow-lg shadow-black/40',
          'transition-all duration-200 ease-out',
          'group-hover:shadow-2xl group-hover:shadow-black/60 group-hover:-translate-y-1',
          isSelected ? 'ring-2 ring-amber ring-offset-2 ring-offset-noir' : '',
        ].join(' ')}
        style={{ aspectRatio: '2/3', backgroundColor: bg }}
      >
        {showCover ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          /* Richer placeholder — palette swatch + initials + genre band */
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
            {/* Genre colour band at bottom */}
            {book.genres?.[0] && (
              <div
                className="shrink-0 h-1.5 opacity-60"
                style={{ backgroundColor: fg }}
              />
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

        <StatusDot status={book.readStatus} />
      </div>

      {/* Below cover */}
      <div className="px-0.5">
        <p className={[
          'text-ice/90 font-semibold leading-snug line-clamp-2 group-hover:text-ice transition-colors',
          compact ? 'text-[10px]' : 'text-xs',
        ].join(' ')}>
          {book.title}
        </p>
        {names[0] && (
          <p className={['text-ice/35 mt-0.5 truncate', compact ? 'text-[9px]' : 'text-[11px]'].join(' ')}>
            {names[0]}
          </p>
        )}
      </div>
    </div>
  )
}

const DOT_COLOR = {
  'read':           { bg: 'bg-amber',    shadow: 'shadow-amber/50'  },
  'reading':        { bg: 'bg-blood',    shadow: 'shadow-blood/50'  },
  'want-to-read':   { bg: 'bg-steel',    shadow: 'shadow-steel/50'  },
  'did-not-finish': { bg: 'bg-ice/30',   shadow: ''                 },
  'to-read':        { bg: 'bg-steel',    shadow: 'shadow-steel/50'  },
  'finished':       { bg: 'bg-amber',    shadow: 'shadow-amber/50'  },
}

function StatusDot({ status }) {
  const c = DOT_COLOR[status]
  if (!c) return null
  return (
    <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${c.bg} shadow-md ${c.shadow}`} />
  )
}
