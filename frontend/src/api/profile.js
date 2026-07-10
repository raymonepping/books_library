import { api } from './client.js'

export const profileApi = {
  get: () => api.get('/profile'),
  
  recalculate: () => api.post('/profile/recalculate', {}),
}

// Made with Bob
