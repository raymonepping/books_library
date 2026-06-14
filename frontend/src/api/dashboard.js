import { api } from './client.js'

export const dashboardApi = {
  getStats:   () => api.get('/dashboard'),
  getCharts:  (months = 12) => api.get(`/dashboard/charts?months=${months}`),
  getHeatmap: (months = 12) => api.get(`/dashboard/heatmap?months=${months}`),
}
