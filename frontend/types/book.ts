export type ImageRef = {
  bucket: string
  key: string
  url: string
}

export type Book = {
  id: string
  type: 'book'
  title: string
  original_title?: string
  publication_year?: number
  language?: string
  isbn?: string
  series?: string
  author?: { id: string; name: string }
  genres?: string[]
  description?: string
  image?: ImageRef
  created_at?: string
  publisher?: string
}