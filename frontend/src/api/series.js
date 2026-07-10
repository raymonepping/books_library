import { api } from './client.js'

export const seriesApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString()
    return api.get(`/series${qs ? `?${qs}` : ''}`)
  },

  get: (id) => api.get(`/series/${id}`),

  getMissing: (id) => api.get(`/series/${id}/missing`),

  getSimilar: (id, limit = 4) => api.get(`/series/${id}/similar?limit=${limit}`),

  getBridging: (id, limit = 3) => api.get(`/series/${id}/bridging?limit=${limit}`),

  create: (data) => api.post('/series', data),

  update: (id, data) => api.put(`/series/${id}`, data),

  markOwned: (id, order, owned) =>
    api.put(`/series/${id}/books/${order}`, { owned }),

  delete: (id) => api.delete(`/series/${id}`),
}
