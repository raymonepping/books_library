import { v4 as uuidv4 } from 'uuid'

export const bookId = () => `book::${uuidv4()}`
export const authorId = (slug) => `author::${slug}`
export const seriesId = (slug) => `series::${slug}`
export const readId = () => `read::${uuidv4()}`
export const collectionId = () => `collection::${uuidv4()}`

// Nordic + common characters that don't NFD-decompose to ASCII
const TRANSLITERATE = {
  'ø': 'o', 'æ': 'ae', 'å': 'a',
  'ð': 'd', 'þ': 'th', 'ß': 'ss',
}

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[øæåðþß]/g, (c) => TRANSLITERATE[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip combining diacritical marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
