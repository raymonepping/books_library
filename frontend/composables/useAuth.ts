// composables/useAuth.ts
type User = { email: string; display_name?: string; roles: string[] }
type LoginResp = { token: string; user: User }
type SignupResp = { ok: boolean; status: string }

export function useAuth() {
  const token = useState<string | null>('auth:token', () => null)
  const user  = useState<User | null>('auth:user',  () => null)

  const error   = useState<string | null>('auth:error', () => null)
  const loading = useState<boolean>('auth:loading', () => false)

  // Restore from localStorage on client
  if (process.client && token.value === null) {
    const t = localStorage.getItem('booklib:token')
    const u = localStorage.getItem('booklib:user')
    if (t) token.value = t
    if (u) user.value = JSON.parse(u)
  }

  function setSession(t: string, u: User) {
    token.value = t
    user.value = u
    if (process.client) {
      localStorage.setItem('booklib:token', t)
      localStorage.setItem('booklib:user', JSON.stringify(u))
    }
  }

  function clearSession() {
    token.value = null
    user.value = null
    if (process.client) {
      localStorage.removeItem('booklib:token')
      localStorage.removeItem('booklib:user')
    }
  }

  async function login(email: string, password: string) {
    const config = useRuntimeConfig()
    error.value = null
    loading.value = true
    try {
      const resp = await $fetch<LoginResp>(`${config.public.apiBase}/auth/login`, {
        method: 'POST',
        body: { email, password }
      })
      setSession(resp.token, resp.user)
      return resp.user
    } catch (e: any) {
      error.value = e?.data?.error || e.message || 'Login failed'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function signup(email: string, password: string, display_name?: string) {
    const config = useRuntimeConfig()
    error.value = null
    loading.value = true
    try {
      const resp = await $fetch<SignupResp>(`${config.public.apiBase}/auth/signup`, {
        method: 'POST',
        body: { email, password, display_name }
      })
      return resp
    } catch (e: any) {
      error.value = e?.data?.error || e.message || 'Signup failed'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchMe() {
    if (!token.value) return null
    const config = useRuntimeConfig()
    try {
      const resp = await $fetch<{ token: string; payload: any }>(`${config.public.apiBase}/auth/me`, {
        headers: { Authorization: `Bearer ${token.value}` }
      })
      // optionally hydrate user from payload
      return resp.payload
    } catch (e: any) {
      error.value = e?.data?.error || e.message
      return null
    }
  }

  function logout() {
    clearSession()
    if (process.client) navigateTo('/')
  }

  const isLoggedIn = computed(() => !!token.value)
  const roles = computed(() => user.value?.roles || [])
  const isAdmin = computed(() => roles.value.includes('admin'))

  return { 
    token, user, error, loading,
    isLoggedIn, isAdmin, roles,
    login, signup, fetchMe,
    logout, setSession, clearSession 
  }
}