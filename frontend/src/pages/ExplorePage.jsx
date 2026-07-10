import { useState, useEffect, useCallback } from 'react'
import { RotateCcw, X, BookOpen, Star } from 'lucide-react'
import { vectorsApi } from '../api/vectors.js'
import LibraryGlobe, { GENRE_COLORS, bookColor } from '../components/explore/LibraryGlobe.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import { coverPlaceholder } from '../utils/coverPlaceholder.js'
import { authorNames } from '../utils/authors.js'

const COLOR_MODES = [
  { value: 'genre', label: 'Genre' },
  { value: 'pace',  label: 'Pace'  },
  { value: 'tone',  label: 'Tone'  },
]

const STATUS_LABEL = {
  read:        'Read',
  reading:     'Reading',
  unread:      'Unread',
  wishlist:    'Wishlist',
}

// ── Genre legend ──────────────────────────────────────────────────────────────
function GenreLegend({ books, activeGenres, onToggle }) {
  // Count per genre across all books
  const counts = {}
  for (const book of books) {
    for (const g of (book.genres ?? [])) {
      counts[g] = (counts[g] ?? 0) + 1
    }
  }

  const genres = Object.entries(GENRE_COLORS)
    .filter(([g]) => counts[g])
    .sort((a, b) => (counts[b[0]] ?? 0) - (counts[a[0]] ?? 0))

  if (!genres.length) return null

  return (
    <div style={{
      position:       'absolute',
      bottom:         24,
      left:           24,
      display:        'flex',
      flexDirection:  'column',
      gap:            5,
      maxHeight:      '50vh',
      overflowY:      'auto',
      padding:        '10px 12px',
      background:     'rgba(13,13,13,0.7)',
      border:         '1px solid rgba(255,255,255,0.07)',
      borderRadius:   10,
      backdropFilter: 'blur(8px)',
      userSelect:     'none',
    }}>
      <p style={{ color: 'rgba(232,238,242,0.35)', fontSize: 10, letterSpacing: 1, margin: '0 0 4px', textTransform: 'uppercase' }}>
        Genre
      </p>
      {genres.map(([genre, color]) => {
        const active = activeGenres.size === 0 || activeGenres.has(genre)
        return (
          <button
            key={genre}
            onClick={() => onToggle(genre)}
            style={{
              display:        'flex',
              alignItems:     'center',
              gap:            8,
              background:     'none',
              border:         'none',
              cursor:         'pointer',
              padding:        '2px 0',
              opacity:        active ? 1 : 0.3,
              transition:     'opacity 0.15s',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}88` }} />
            <span style={{ color: '#e8eef2', fontSize: 11, whiteSpace: 'nowrap' }}>{genre}</span>
            <span style={{ color: 'rgba(232,238,242,0.3)', fontSize: 10, marginLeft: 'auto', paddingLeft: 8 }}>{counts[genre]}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Book detail side panel ────────────────────────────────────────────────────
function BookPanel({ book, onClose }) {
  if (!book) return null
  const color = GENRE_COLORS[book.genres?.[0]] ?? '#8899aa'

  return (
    <div style={{
      position:       'absolute',
      top:            0,
      right:          0,
      bottom:         0,
      width:          300,
      background:     'rgba(18,18,18,0.96)',
      borderLeft:     `1px solid ${color}33`,
      backdropFilter: 'blur(12px)',
      display:        'flex',
      flexDirection:  'column',
      overflow:       'hidden',
      animation:      'slideInRight 0.18s ease',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0', flexShrink: 0 }}>
        <span style={{ color: color, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>
          {book.genres?.[0] ?? 'Book'}
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(232,238,242,0.4)', padding: 4 }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 20px' }}>
        {/* Cover */}
        <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 14, boxShadow: `0 8px 32px ${color}22` }}>
          <img
            src={book.coverUrl || coverPlaceholder}
            alt={book.title}
            onError={e => { e.target.src = coverPlaceholder }}
            style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }}
          />
        </div>

        {/* Title + author */}
        <h2 style={{ color: '#e8eef2', fontSize: 16, fontWeight: 700, margin: '0 0 6px', lineHeight: 1.3, fontFamily: "'Playfair Display', serif" }}>
          {book.title}
        </h2>
        {book.authors?.length > 0 && (
          <p style={{ color: '#8899aa', fontSize: 12, margin: '0 0 12px' }}>
            {book.authors.map(a => a.name ?? a).join(', ')}
          </p>
        )}

        {/* Rating */}
        {book.rating != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
            {[1,2,3,4,5].map(n => (
              <Star
                key={n}
                size={13}
                fill={n <= book.rating ? '#e8a020' : 'none'}
                color={n <= book.rating ? '#e8a020' : 'rgba(232,238,242,0.2)'}
              />
            ))}
          </div>
        )}

        {/* Status badge */}
        {book.readStatus && (
          <span style={{
            display:      'inline-block',
            marginBottom: 14,
            fontSize:     11,
            padding:      '3px 10px',
            borderRadius: 20,
            background:   book.readStatus === 'read' ? 'rgba(39,174,96,0.15)' : 'rgba(255,255,255,0.06)',
            color:        book.readStatus === 'read' ? '#27ae60' : 'rgba(232,238,242,0.5)',
            border:       `1px solid ${book.readStatus === 'read' ? 'rgba(39,174,96,0.3)' : 'rgba(255,255,255,0.1)'}`,
          }}>
            {STATUS_LABEL[book.readStatus] ?? book.readStatus}
          </span>
        )}

        {/* Genres */}
        {book.genres?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
            {book.genres.map(g => (
              <span key={g} style={{
                fontSize:     10,
                padding:      '2px 8px',
                borderRadius: 20,
                background:   `${GENRE_COLORS[g] ?? '#8899aa'}18`,
                color:        GENRE_COLORS[g] ?? '#8899aa',
                border:       `1px solid ${GENRE_COLORS[g] ?? '#8899aa'}33`,
              }}>
                {g}
              </span>
            ))}
          </div>
        )}

        {/* Style fingerprint */}
        {book.styleFingerprint && (
          <div style={{
            padding:      '10px 12px',
            background:   'rgba(255,255,255,0.04)',
            borderRadius: 8,
            borderLeft:   `2px solid ${color}66`,
          }}>
            <p style={{ color: 'rgba(232,238,242,0.35)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 5px' }}>
              Style
            </p>
            <p style={{ color: 'rgba(232,238,242,0.7)', fontSize: 12, lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>
              {book.styleFingerprint}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ExplorePage() {
  const [allBooks, setAllBooks]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [selected, setSelected]     = useState(null)
  const [activeGenres, setActive]   = useState(new Set())
  const [colorMode, setColorMode]   = useState('genre')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    vectorsApi.getBooks()
      .then(data  => { if (!cancelled) { setAllBooks(data); setLoading(false) } })
      .catch(err  => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const handleToggleGenre = useCallback(genre => {
    setActive(prev => {
      const next = new Set(prev)
      if (next.has(genre)) next.delete(genre)
      else                 next.add(genre)
      return next
    })
  }, [])

  const visibleBooks = activeGenres.size === 0
    ? allBooks
    : allBooks.filter(b => b.genres?.some(g => activeGenres.has(g)))

  const handleRefresh = async () => {
    setLoading(true)
    setError(null)
    try {
      await vectorsApi.refreshCache()
      const data = await vectorsApi.getBooks()
      setAllBooks(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0d0d0d' }}>

      {/* Top bar */}
      <div style={{
        position:       'absolute',
        top:            0,
        left:           0,
        right:          selected ? 300 : 0,
        zIndex:         10,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '14px 20px',
        background:     'linear-gradient(to bottom, rgba(13,13,13,0.88) 0%, transparent 100%)',
        pointerEvents:  'none',
        gap:            16,
      }}>
        {/* Title */}
        <div style={{ flexShrink: 0 }}>
          <h1 style={{ color: '#e8eef2', fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'Playfair Display', serif" }}>
            Library Space
          </h1>
          {!loading && (
            <p style={{ color: 'rgba(232,238,242,0.3)', fontSize: 11, margin: '2px 0 0', letterSpacing: 0.5 }}>
              {visibleBooks.length} book{visibleBooks.length !== 1 ? 's' : ''}
              {activeGenres.size > 0 ? ` · ${activeGenres.size} genre${activeGenres.size > 1 ? 's' : ''} filtered` : ' · spectrum index'}
            </p>
          )}
        </div>

        {/* Color mode toggle */}
        <div style={{
          pointerEvents:  'auto',
          display:        'flex',
          alignItems:     'center',
          background:     'rgba(13,13,13,0.7)',
          border:         '1px solid rgba(255,255,255,0.08)',
          borderRadius:   8,
          padding:        2,
          gap:            1,
        }}>
          {COLOR_MODES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setColorMode(value)}
              style={{
                background:   colorMode === value ? 'rgba(255,255,255,0.1)' : 'none',
                border:       'none',
                borderRadius: 6,
                padding:      '5px 13px',
                cursor:       'pointer',
                color:        colorMode === value ? '#e8eef2' : 'rgba(232,238,242,0.35)',
                fontSize:     12,
                fontFamily:   'Inter, sans-serif',
                fontWeight:   colorMode === value ? 600 : 400,
                transition:   'all 0.12s',
                letterSpacing: 0.3,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          title="Refresh PCA"
          style={{
            pointerEvents:  'auto',
            background:     'rgba(255,255,255,0.05)',
            border:         '1px solid rgba(255,255,255,0.08)',
            borderRadius:   8,
            padding:        '6px 10px',
            cursor:         'pointer',
            color:          'rgba(232,238,242,0.4)',
            display:        'flex',
            alignItems:     'center',
            gap:             6,
            fontSize:       11,
            flexShrink:     0,
          }}
        >
          <RotateCcw size={13} />
          Refresh
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 20 }}>
          <Spinner size={36} />
          <p style={{ color: 'rgba(232,238,242,0.4)', fontSize: 13, fontFamily: 'Inter, sans-serif' }}>
            Mapping your library…
          </p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 20 }}>
          <BookOpen size={40} color="rgba(192,57,43,0.6)" />
          <p style={{ color: 'rgba(232,238,242,0.5)', fontSize: 13 }}>Failed to load: {error}</p>
          <button onClick={handleRefresh} style={{ background: 'rgba(192,57,43,0.15)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', color: '#c0392b', fontSize: 13 }}>
            Try again
          </button>
        </div>
      )}

      {/* Spectrum canvas */}
      {!loading && !error && (
        <div style={{ position: 'absolute', inset: 0, right: selected ? 300 : 0, transition: 'right 0.2s ease' }}>
          <LibraryGlobe
            books={allBooks}
            colorMode={colorMode}
            onSelect={setSelected}
            selectedBook={selected}
            activeGenres={activeGenres}
          />
        </div>
      )}

      {/* Genre legend — only visible in genre color mode */}
      {!loading && !error && colorMode === 'genre' && (
        <GenreLegend books={allBooks} activeGenres={activeGenres} onToggle={handleToggleGenre} />
      )}

      {/* Book panel */}
      <BookPanel book={selected} onClose={() => setSelected(null)} />

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
