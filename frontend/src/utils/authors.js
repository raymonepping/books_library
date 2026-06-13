// Extract display names from book.authors, which may be [{id, name}] objects or
// legacy strings. Always returns a plain string[].
export function authorNames(authors = []) {
  return (authors ?? [])
    .map(a => (typeof a === 'string' ? a : a?.name ?? ''))
    .filter(Boolean)
}
