import { create } from 'zustand'
import { booksApi } from '../api/books.js'
import { authorsApi } from '../api/authors.js'

export const useLibraryStore = create((set, get) => ({
  // ── Books ──────────────────────────────────────────────────────────────────
  books: [],
  totalBooks: 0,
  booksPage: 1,
  booksLimit: 40,
  booksFilters: { status: '', genre: '', sort: 'addedAt', order: 'desc' },
  booksLoading: false,
  booksError: null,

  fetchBooks: async (overrides = {}) => {
    const { booksPage, booksLimit, booksFilters } = get()
    const params = { page: booksPage, limit: booksLimit, ...booksFilters, ...overrides }
    set({ booksLoading: true, booksError: null })
    try {
      const data = await booksApi.list(params)
      set({ books: data.books, totalBooks: data.total, booksLoading: false })
    } catch (err) {
      set({ booksError: err.message, booksLoading: false })
    }
  },

  setBooksFilter: (key, value) => {
    set(s => ({ booksFilters: { ...s.booksFilters, [key]: value }, booksPage: 1 }))
    get().fetchBooks()
  },

  setBooksPage: (page) => {
    set({ booksPage: page })
    get().fetchBooks()
  },

  upsertBook: (book) =>
    set(s => ({
      books: s.books.some(b => b.id === book.id)
        ? s.books.map(b => b.id === book.id ? book : b)
        : [book, ...s.books],
      totalBooks: s.books.some(b => b.id === book.id) ? s.totalBooks : s.totalBooks + 1,
    })),

  removeBook: (id) =>
    set(s => ({
      books: s.books.filter(b => b.id !== id),
      totalBooks: Math.max(0, s.totalBooks - 1),
    })),

  // ── Authors ────────────────────────────────────────────────────────────────
  authors: [],
  totalAuthors: 0,
  authorsLoading: false,
  authorsError: null,

  fetchAuthors: async (params = {}) => {
    set({ authorsLoading: true, authorsError: null })
    try {
      const data = await authorsApi.list(params)
      set({ authors: data.authors, totalAuthors: data.total, authorsLoading: false })
    } catch (err) {
      set({ authorsError: err.message, authorsLoading: false })
    }
  },

  upsertAuthor: (author) =>
    set(s => ({
      authors: s.authors.some(a => a.id === author.id)
        ? s.authors.map(a => a.id === author.id ? author : a)
        : [author, ...s.authors],
    })),
}))
