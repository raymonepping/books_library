import { api } from './client.js'

export const booksApi = {
  list: (params = {}, signal) => {
    const { signal: _sig, ...rest } = params  // pull signal out if accidentally passed in params
    const qs = new URLSearchParams(
      Object.entries(rest).filter(([, v]) => v != null && v !== '')
    ).toString()
    return api.get(`/books${qs ? `?${qs}` : ''}`, { signal: signal ?? _sig })
  },

  get: (id) => api.get(`/books/${id}`),

  create: (body) => api.post('/books', body),

  update: (id, body) => api.put(`/books/${id}`, body),

  updateStatus: (id, body) => api.patch(`/books/${id}/status`, body),

  delete: (id) => api.delete(`/books/${id}`),

  recommend: (id, limit = 10) =>
    api.get(`/recommend/book/${id}?limit=${limit}`),

  forYou: (seeds = 5, perSeed = 4) =>
    api.get(`/recommend/for-you?seeds=${seeds}&perSeed=${perSeed}`),

  enrich: (isbn) => api.get(`/enrich?isbn=${encodeURIComponent(isbn)}`),

  fetchCover: (id) => api.post(`/books/${id}/fetch-cover`),

  facets: (type, q = '') => api.get(`/books/facets?type=${type}&q=${encodeURIComponent(q)}`),
}
