// composables/useApi.ts

type FetchOpts = Parameters<typeof useFetch>[1]

// Old behavior: useApi('/path', opts) -> returns useFetch result
function useApiFetch<T = any>(path: string, opts: FetchOpts = {}) {
  const config = useRuntimeConfig()
  const url = computed(() => `${config.public.apiBase}${path}`)
  return useFetch<T>(url, { key: url.value, ...opts })
}

// New behavior: const api = useApi(); api.get('/path')
function useApiClient() {
  const config = useRuntimeConfig()
  const { token } = useAuth?.() || { token: { value: '' } as any } // safe if useAuth not set yet

  const headers: Record<string, string> = {}
  if (token?.value) headers.Authorization = `Bearer ${token.value}`

  const base = config.public.apiBase

  return {
    get:  <T>(p: string, q?: any) =>
      $fetch<T>(`${base}${p}`, { headers, query: q }),

    post: <T>(p: string, b?: any) =>
      $fetch<T>(`${base}${p}`, { method: 'POST', headers, body: b }),

    put:  <T>(p: string, b?: any) =>
      $fetch<T>(`${base}${p}`, { method: 'PUT', headers, body: b }),

    del:  <T>(p: string) =>
      $fetch<T>(`${base}${p}`, { method: 'DELETE', headers })
  }
}

/**
 * Overloaded composable:
 * - useApi('/path', opts?) -> useFetch style (BACK-COMPAT)
 * - useApi() -> returns client { get, post, put, del }
 */
export function useApi<T = any>(path?: string, opts?: FetchOpts) {
  if (typeof path === 'string') {
    // old style
    return useApiFetch<T>(path, opts)
  }
  // new style
  return useApiClient()
}

// Optional explicit exports if you want them:
export { useApiFetch }