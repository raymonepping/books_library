import { api } from './client.js'

export const vectorsApi = {
  getBooks:      ()  => api.get('/vectors/books'),
  refreshCache:  ()  => api.post('/vectors/books/refresh'),
}
