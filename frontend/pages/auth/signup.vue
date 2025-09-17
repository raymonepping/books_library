<script setup lang="ts">
const { signup, error, loading } = useAuth()
const email = ref(''); const password = ref(''); const name = ref('')

async function onSubmit() {
  await signup(email.value, password.value, name.value)
  // User is "pending" until admin approval
  // Show a toast and route to login
  navigateTo('/auth/login?pending=1')
}
</script>

<template>
  <div class="max-w-md mx-auto p-6 space-y-4">
    <h1 class="text-2xl font-bold text-pumpkin">Create account</h1>
    <form @submit.prevent="onSubmit" class="space-y-4">
      <input v-model="email" type="email" required placeholder="Email" class="w-full border rounded p-2" />
      <input v-model="name" type="text" placeholder="Display name (optional)" class="w-full border rounded p-2" />
      <input v-model="password" type="password" required placeholder="Password" class="w-full border rounded p-2" />
      <button :disabled="loading" class="px-4 py-2 rounded bg-pumpkin text-white hover:bg-burnt">
        {{ loading ? 'Please wait…' : 'Sign up' }}
      </button>
      <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>
      <p class="text-sm text-gray-600">
        Already have an account? <NuxtLink to="/auth/login" class="text-pumpkin underline">Login</NuxtLink>
      </p>
    </form>
  </div>
</template>