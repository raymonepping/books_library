import { useState } from 'react'
import BookDetailPanel from './BookDetailPanel.jsx'
import { spineColor } from './spineUtils.js'
import { authorNames } from '../../utils/authors.js'

export default function GridView({ books }) {
  const [selected, setSelected] = useState(null)
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {books.map(book => (
          <BookCard
            key={book.id}
            book={book}
            isSelected={selected?.id === book.id}
            onSelect={() => setSelected(s => s?.id === book.id ? null : book)}
          />
        ))}
      </div>
      <BookDetailPanel book={selected} onClose={() => setSelected(null)} />
    </>
  )
}

function BookCard({ book, isSelected, onSelect }) {
  const { bg, fg } = spineColor(book)

  return (
    <div
      onClick={onSelect}
      className={[
        'group flex flex-col gap-2.5 cursor-pointer',
        isSelected ? 'scale-[0.97]' : '',
      ].join(' ')}
    >
      {/* Cover */}
      <div
        className={[
          'aspect-[2/3] rounded-xl relative overflow-hidden',
          'shadow-lg shadow-black/40',
          'transition-all duration-200 ease-out',
          'group-hover:shadow-2xl group-hover:shadow-black/60 group-hover:-translate-y-1',
          isSelected ? 'ring-2 ring-amber ring-offset-2 ring-offset-noir' : '',
        ].join(' ')}
        style={{ backgroundColor: bg }}
      >
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col justify-end p-3">
            <span className="font-serif text-xs leading-snug line-clamp-4" style={{ color: fg }}>
              {book.title}
            </span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
          {book.authors?.length > 0 && (
            <p className="text-white/80 text-[11px] leading-snug line-clamp-1">
              {authorNames(book.authors).join(', ')}
            </p>
          )}
          {book.rating > 0 && (
            <p className="text-amber text-xs mt-0.5">{'★'.repeat(book.rating)}</p>
          )}
        </div>

        {/* Status dot — top right */}
        <StatusDot status={book.readStatus} />
      </div>

      {/* Title + author below */}
      <div className="px-0.5">
        <p className="text-ice/90 text-xs font-semibold leading-snug line-clamp-2 group-hover:text-ice transition-colors">
          {book.title}
        </p>
        {book.authors?.length > 0 && (
          <p className="text-ice/35 text-[11px] mt-0.5 truncate">{authorNames(book.authors)[0]}</p>
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
    <span className={`absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full ${c.bg} shadow-md ${c.shadow}`} />
  )
}
