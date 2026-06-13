import { api } from './client.js'

export const authorsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString()
    return api.get(`/authors${qs ? `?${qs}` : ''}`)
  },

  get: (id) => api.get(`/authors/${id}`),

  create: (body) => api.post('/authors', body),

  recommend: (id, limit = 5) =>
    api.get(`/recommend/author/${id}?limit=${limit}`),

  enrichByName: (name) =>
    api.get(`/enrich/author?name=${encodeURIComponent(name)}`),
}
