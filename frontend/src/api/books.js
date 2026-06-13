import { api } from './client.js'

export const booksApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString()
    return api.get(`/books${qs ? `?${qs}` : ''}`)
  },

  get: (id) => api.get(`/books/${id}`),

  create: (body) => api.post('/books', body),

  update: (id, body) => api.put(`/books/${id}`, body),

  updateStatus: (id, body) => api.patch(`/books/${id}/status`, body),

  delete: (id) => api.delete(`/books/${id}`),

  recommend: (id, limit = 10) =>
    api.get(`/recommend/book/${id}?limit=${limit}`),

  enrich: (isbn) => api.get(`/enrich?isbn=${encodeURIComponent(isbn)}`),
}
