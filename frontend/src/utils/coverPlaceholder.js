// Deterministic cover placeholder — hashes title+author into a palette swatch.
// Returns { bg, fg, initials } that can be used anywhere a real cover is absent.

const PALETTE = [
  ['#1a2a3a', '#4a9fd8'], // deep ocean
  ['#2a1a1a', '#c0392b'], // blood noir
  ['#1a2a1a', '#4caf50'], // forest
  ['#2a2a1a', '#e8a020'], // amber noir
  ['#1a1a2a', '#7c4dff'], // indigo
  ['#2a1a2a', '#e040fb'], // plum
  ['#1a2a2a', '#00bcd4'], // teal
  ['#2a1e14', '#ff7043'], // terracotta
  ['#14201a', '#26a69a'], // jade
  ['#1e1a2a', '#5c6bc0'], // slate blue
]

function hashStr(s = '') {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function coverPlaceholder(book = {}) {
  const key = `${book.title ?? ''}${(book.authors ?? [])[0]?.name ?? (book.authors ?? [])[0] ?? ''}`
  const [bg, fg] = PALETTE[hashStr(key) % PALETTE.length]

  // Two-letter initials — first letter of title, first letter of first author name
  const titleLetter  = (book.title ?? '').trim()[0]?.toUpperCase() ?? ''
  const authorVal    = (book.authors ?? [])[0]
  const authorName   = typeof authorVal === 'string' ? authorVal : authorVal?.name ?? ''
  const authorLetter = authorName.trim()[0]?.toUpperCase() ?? ''
  const initials     = (titleLetter + authorLetter) || titleLetter || '?'

  return { bg, fg, initials }
}
