import { Link } from 'react-router-dom'
import { Layers, TrendingUp } from 'lucide-react'

export default function SimilarSeries({ similar }) {
  if (!similar || similar.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-ice/60" />
        <h3 className="font-serif text-lg text-ice">Similar Series</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {similar.map((item) => (
          <Link
            key={item.seriesId}
            to={`/series/${item.seriesId}`}
            className="group bg-steel-dim/30 rounded-lg p-4 hover:bg-steel-dim/50 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded bg-steel-dim flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5 text-ice/40" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-medium text-ice group-hover:text-gold transition-colors truncate">
                  {item.seriesName}
                </h4>
                {item.authorName && (
                  <p className="text-sm text-ice/50 truncate">{item.authorName}</p>
                )}
                {item.why && (
                  <p className="text-xs text-ice/40 mt-1 italic">{item.why}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <div className="h-1 flex-1 bg-steel-dim rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gold/60"
                      style={{ width: `${Math.min(item.score * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-ice/40 tabular-nums">
                    {Math.round(item.score * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// Made with Bob
