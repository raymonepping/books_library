import { Link } from 'react-router-dom'
import { BookOpen, ArrowRight } from 'lucide-react'

export default function BridgingReads({ bridging, seriesName }) {
  if (!bridging || bridging.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ArrowRight className="w-5 h-5 text-ice/60" />
        <h3 className="font-serif text-lg text-ice">Bridging Reads</h3>
        <span className="text-xs text-ice/40">Standalone books similar to this series</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {bridging.map((book) => (
          <div
            key={book.bookId}
            className="group bg-steel-dim/30 rounded-lg overflow-hidden hover:bg-steel-dim/50 transition-colors"
          >
            {/* Cover */}
            {book.coverUrl && (
              <div className="aspect-[2/3] bg-steel-dim overflow-hidden">
                <img
                  src={book.coverUrl}
                  alt={book.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            )}

            {/* Info */}
            <div className="p-4 space-y-2">
              <h4 className="font-medium text-ice text-sm line-clamp-2 group-hover:text-gold transition-colors">
                {book.title}
              </h4>
              {book.authorName && (
                <p className="text-xs text-ice/50 truncate">{book.authorName}</p>
              )}
              {book.why && (
                <p className="text-xs text-ice/40 italic">{book.why}</p>
              )}
              <div className="flex items-center gap-2 pt-2">
                <div className="h-1 flex-1 bg-steel-dim rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold/60"
                    style={{ width: `${Math.min(book.score * 100, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-ice/40 tabular-nums">
                  {Math.round(book.score * 100)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Made with Bob
