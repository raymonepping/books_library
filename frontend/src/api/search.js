import { api } from './client.js'

export const searchApi = {
  search: ({ q, type, page = 1, limit = 20 } = {}, signal) => {
    const qs = new URLSearchParams(
      Object.entries({ q, type, page, limit }).filter(([, v]) => v != null)
    ).toString()
    return api.get(`/search?${qs}`, { signal })
  },
}
