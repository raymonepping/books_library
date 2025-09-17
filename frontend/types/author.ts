export interface Author {
  id: string
  name: string
  nationality: string
  birth_year?: number
  genres: string[]
  notable_series?: { name: string; books: string[] }[]
  website?: string
  image?: {
    bucket: string
    key: string
    url: string
  }
  created_at: string
  type: 'author'
}
