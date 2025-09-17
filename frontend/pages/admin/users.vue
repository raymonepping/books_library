<script setup lang="ts">
definePageMeta({ middleware: ['require-admin'] })

const config = useRuntimeConfig()
const approving = ref(false)
const email = ref('')
const result = ref<string | null>(null)
const error = ref<string | null>(null)

async function approve() {
  result.value = null
  error.value = null
  approving.value = true
  try {
    const res = await $fetch<{ ok: boolean; email: string; status: string }>(
      `${config.public.apiBase}/auth/approve/${encodeURIComponent(email.value)}`,
      { method: 'POST' }
    )
    result.value = `Approved: ${res.email} → status=${res.status}`
  } catch (e: any) {
    error.value = e?.data?.error || e?.message || 'Approval failed'
  } finally {
    approving.value = false
  }
}
</script>

<template>
  <div class="max-w-xl mx-auto p-6 space-y-6">
    <h1 class="text-2xl font-bold text-pumpkin">Admin · Approve Users</h1>

    <div class="rounded-lg border p-4 space-y-4">
      <label class="block text-sm text-gunmetal">User email to approve</label>
      <input
        v-model="email"
        type="email"
        placeholder="alice@example.com"
        class="w-full border rounded p-2"
      />
      <button
        :disabled="approving || !email"
        @click="approve"
        class="px-4 py-2 rounded bg-pumpkin text-white hover:bg-burnt disabled:opacity-60"
      >
        {{ approving ? 'Approving…' : 'Approve' }}
      </button>

      <p v-if="result" class="text-green-700 text-sm">{{ result }}</p>
      <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>
    </div>

    <!-- (Optional) pending list section – requires a backend list endpoint -->
    <div class="text-sm text-gray-600">
      Tip: we can add a “list pending users” table here once the backend exposes
      <code>GET /api/auth/users?status=pending</code>.
    </div>
  </div>
</template>