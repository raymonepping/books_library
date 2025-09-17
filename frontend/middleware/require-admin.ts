// middleware/require-admin.ts
export default defineNuxtRouteMiddleware((_to) => {
  const { isLoggedIn, isAdmin } = useAuth()
  if (!isLoggedIn.value) {
    return navigateTo({ path: '/auth/login', query: { redirect: '/admin/users' } })
  }
  if (!isAdmin.value) {
    return navigateTo('/') // or show a 403 page
  }
})