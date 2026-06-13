import { api } from './client.js'

export const dashboardApi = {
  getStats:  () => api.get('/dashboard'),
  getCharts: () => api.get('/dashboard/charts'),
}
