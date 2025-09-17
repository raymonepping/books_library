<script setup lang="ts">
import AuthorCard from '~/components/AuthorCard.vue'
const { data, error, pending } = useApi<{ items: any[] }>('/authors')
</script>

<template>
  <section class="container mx-auto px-4 py-6">
    <div class="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <h1 class="text-2xl font-bold text-gunmetal">Authors</h1>

      <!-- search bar (front-only for now) -->
      <div class="relative w-full md:w-80">
        <input
          type="search"
          placeholder="Search authors…"
          class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-9 text-sm placeholder-gray-400 focus:border-pumpkin focus:outline-none focus:ring-2 focus:ring-pumpkin/30"
        />
        <i class="fa-solid fa-magnifying-glass absolute right-3 top-2.5 text-gray-400"></i>
      </div>
    </div>

    <div v-if="pending" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <div v-for="i in 8" :key="i" class="h-56 animate-pulse rounded-xl bg-cloud/40" />
    </div>

    <div v-else-if="error" class="rounded-md bg-red-50 p-3 text-red-700">
      Failed to load authors: {{ error.message }}
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <AuthorCard v-for="a in data?.items || []" :key="a.id" :author="a" />
    </div>
  </section>
</template>