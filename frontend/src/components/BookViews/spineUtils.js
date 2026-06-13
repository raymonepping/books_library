// Deterministic visual properties for a book spine, derived only from stable fields.
// Same book always renders the same color + dimensions across renders.

const GENRE_COLORS = {
  'crime':            { bg: '#8b2020', fg: '#ffe8e8' },
  'thriller':         { bg: '#a83025', fg: '#fff0ee' },
  'mystery':          { bg: '#8b2020', fg: '#ffe8e8' },
  'nordic noir':      { bg: '#2d3f6b', fg: '#d4e4ff' },
  'literary fiction': { bg: '#4a6fa5', fg: '#dde9ff' },
  'classic':          { bg: '#7a5c0e', fg: '#fff3cc' },
  'fantasy':          { bg: '#4a2d7a', fg: '#e8d4ff' },
  'science fiction':  { bg: '#1a4f7a', fg: '#cce8ff' },
  'biography':        { bg: '#2d5a3d', fg: '#c8f0d4' },
  'history':          { bg: '#5a3d1a', fg: '#f0e4cc' },
  'romance':          { bg: '#7a2d55', fg: '#ffd4e8' },
  'horror':           { bg: '#3a1a1a', fg: '#ffaaaa' },
  'graphic novel':    { bg: '#1a3a5a', fg: '#aad4ff' },
}

const FALLBACK_PALETTE = [
  { bg: '#8b2020', fg: '#ffe8e8' },
  { bg: '#2d3f6b', fg: '#d4e4ff' },
  { bg: '#4a6fa5', fg: '#dde9ff' },
  { bg: '#7a5c0e', fg: '#fff3cc' },
  { bg: '#4a2d7a', fg: '#e8d4ff' },
  { bg: '#2d5a3d', fg: '#c8f0d4' },
  { bg: '#5a3d1a', fg: '#f0e4cc' },
  { bg: '#1a4f7a', fg: '#cce8ff' },
]

// Stable hash from a string → integer
function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function spineColor(book) {
  const primaryGenre = (book.genres ?? [])[0]?.toLowerCase()
  if (primaryGenre && GENRE_COLORS[primaryGenre]) return GENRE_COLORS[primaryGenre]
  const idx = hashStr(book.id ?? book.title ?? '') % FALLBACK_PALETTE.length
  return FALLBACK_PALETTE[idx]
}

// Width 22–34px — varied per book, stable
export function spineWidth(book) {
  const h = hashStr(book.id ?? book.title ?? '')
  return 22 + (h % 13)   // 22–34 px
}

// Height 140–210px — scales with page count if known
export function spineHeight(book) {
  if (book.pageCount && book.pageCount > 0) {
    return Math.round(140 + Math.min(book.pageCount / 9, 70))  // 140–210 px
  }
  const h = hashStr((book.id ?? '') + 'h')
  return 148 + (h % 48)  // 148–196 px
}
