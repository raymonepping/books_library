import { useState } from 'react'
import Badge from '../ui/Badge.jsx'
import BookDetailPanel from './BookDetailPanel.jsx'
import { coverPlaceholder } from '../../utils/coverPlaceholder.js'
import { authorNames } from '../../utils/authors.js'

export default function ListView({ books }) {
  const [selected, setSelected] = useState(null)
  return (
    <>
      <div className="flex flex-col divide-y divide-white/[0.04]">
        {books.map(book => (
          <BookRow
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

function BookRow({ book, isSelected, onSelect }) {
  const { bg, fg, initials } = coverPlaceholder(book)
  const [imgError, setImgError] = useState(false)
  const showCover = book.coverUrl && !imgError

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={book.title}
      className={[
        'flex items-center gap-4 px-3 py-3 rounded-lg transition-all duration-150 cursor-pointer group',
        'w-full text-left bg-transparent border-0',
        isSelected ? 'bg-white/8 ring-1 ring-amber/20' : 'hover:bg-white/[0.04]',
      ].join(' ')}
    >
      {/* Cover thumbnail */}
      <div
        className="w-10 h-14 rounded-md shrink-0 overflow-hidden shadow-md shadow-black/40 flex items-center justify-center"
        style={{ backgroundColor: bg }}
      >
        {showCover ? (
          <img
            src={book.coverUrl}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="font-serif font-bold text-xs select-none" style={{ color: fg }}>
            {initials}
          </span>
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-ice/90 text-sm font-semibold leading-snug truncate group-hover:text-ice transition-colors">
          {book.title}
        </p>
        <p className="text-ice/40 text-xs mt-0.5 truncate">
          {[authorNames(book.authors)[0], book.publishedYear].filter(Boolean).join(' · ')}
        </p>
        {book.genres?.[0] && (
          <p className="text-ice/25 text-[11px] mt-0.5 truncate capitalize">{book.genres[0]}</p>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3 shrink-0">
        {book.rating > 0 && (
          <span className="text-amber/70 text-xs tracking-tight">{'★'.repeat(book.rating)}</span>
        )}
        <Badge status={book.readStatus} />
      </div>
    </button>
  )
}
