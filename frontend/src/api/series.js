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

  markOwned: (id, order, owned) =>
    api.put(`/series/${id}/books/${order}`, { owned }),
}
