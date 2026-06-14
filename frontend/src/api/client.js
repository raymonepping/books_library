const BASE = import.meta.env.VITE_API_URL || ''
const TOKEN = import.meta.env.VITE_API_TOKEN || ''

class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, options = {}) {
  const { body, method = 'GET', ...rest } = options
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...rest.headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
    ...rest,
  })

  const data = await res.json()

  if (!res.ok || !data.success) {
    throw new ApiError(data.error || `HTTP ${res.status}`, res.status)
  }

  return data.data
}

export const api = {
  get:    (path, opts)       => request(path, opts),
  post:   (path, body)       => request(path, { method: 'POST', body }),
  put:    (path, body)       => request(path, { method: 'PUT', body }),
  patch:  (path, body)       => request(path, { method: 'PATCH', body }),
  delete: (path)             => request(path, { method: 'DELETE' }),
}

export { ApiError }
