<script setup lang="ts">
const route = useRoute()
const { login, fetchMe, error, loading, isLoggedIn } = useAuth()
const email = ref(''); const password = ref('')
const pending = computed(() => route.query.pending)

async function onSubmit() {
  await login(email.value, password.value)
  await fetchMe()
  return navigateTo('/') // back home
}
watch(isLoggedIn, v => { if (v) navigateTo('/') }, { immediate: true })
</script>

<template>
  <div class="max-w-md mx-auto p-6 space-y-4">
    <h1 class="text-2xl font-bold text-pumpkin">Login</h1>
    <p v-if="pending" class="text-sm text-gunmetal">Thanks for signing up. Once an admin approves your account, you can log in.</p>

    <form @submit.prevent="onSubmit" class="space-y-4">
      <input v-model="email" type="email" required placeholder="Email" class="w-full border rounded p-2" />
      <input v-model="password" type="password" required placeholder="Password" class="w-full border rounded p-2" />
      <button :disabled="loading" class="px-4 py-2 rounded bg-pumpkin text-white hover:bg-burnt">
        {{ loading ? 'Please wait…' : 'Login' }}
      </button>
      <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>
      <p class="text-sm text-gray-600">
        No account? <NuxtLink to="/auth/signup" class="text-pumpkin underline">Create one</NuxtLink>
      </p>
    </form>
  </div>
</template>