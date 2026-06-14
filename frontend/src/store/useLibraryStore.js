import { create } from 'zustand'
import { booksApi } from '../api/books.js'
import { authorsApi } from '../api/authors.js'

let _fetchAbort = null

export const useLibraryStore = create((set, get) => ({
  // ── Books ──────────────────────────────────────────────────────────────────
  books: [],
  totalBooks: 0,
  booksPage: 1,
  booksLimit: 40,
  booksFilters: { status: '', genre: '', sort: 'addedAt', order: 'desc', owned: '', author: '', series: '' },
  booksLoading: false,
  booksError: null,

  fetchBooks: async (overrides = {}) => {
    _fetchAbort?.abort()
    _fetchAbort = new AbortController()
    const { booksPage, booksLimit, booksFilters } = get()
    const params = { page: booksPage, limit: booksLimit, ...booksFilters, ...overrides }
    set({ booksLoading: true, booksError: null })
    try {
      const data = await booksApi.list(params, _fetchAbort.signal)
      set({ books: data.books, totalBooks: data.total, booksLoading: false })
    } catch (err) {
      if (err.name === 'AbortError') return
      set({ booksError: err.message, booksLoading: false })
    }
  },

  setBooksFilter: (key, value) => {
    set(s => ({ booksFilters: { ...s.booksFilters, [key]: value }, booksPage: 1 }))
    get().fetchBooks()
  },

  setBooksFilters: (filters) => {
    set(s => ({ booksFilters: { ...s.booksFilters, ...filters }, booksPage: 1 }))
    get().fetchBooks()
  },

  resetBooksFilters: () => {
    set({ booksFilters: { status: '', genre: '', sort: 'addedAt', order: 'desc', owned: '', author: '', series: '' }, booksPage: 1 })
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

  // ── Undo-delete ────────────────────────────────────────────────────────────
  // Optimistic delete: remove from UI immediately, queue the real API call after
  // 5 s unless the user clicks Undo. The pending book is stored here so the
  // undo handler can re-insert it without another API call.
  _pendingDeleteBook:    null,
  _pendingDeleteTimeout: null,

  scheduleDelete: (book) => {
    // Clear any existing pending delete first
    const { _pendingDeleteTimeout } = get()
    if (_pendingDeleteTimeout) clearTimeout(_pendingDeleteTimeout)

    // Remove from UI immediately
    get().removeBook(book.id)

    const timeoutId = setTimeout(async () => {
      try { await booksApi.delete(book.id) } catch (_) {}
      set({ _pendingDeleteBook: null, _pendingDeleteTimeout: null })
    }, 5000)

    set({ _pendingDeleteBook: book, _pendingDeleteTimeout: timeoutId })
  },

  undoDelete: () => {
    const { _pendingDeleteBook, _pendingDeleteTimeout } = get()
    if (!_pendingDeleteBook) return
    clearTimeout(_pendingDeleteTimeout)
    get().upsertBook(_pendingDeleteBook)
    set({ _pendingDeleteBook: null, _pendingDeleteTimeout: null })
  },

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
