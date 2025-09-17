<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string
const { data, error, pending } = useApi(`/books/${slug}`)
</script>

<template>
  <section class="container mx-auto px-4 py-6">
    <div v-if="pending" class="h-64 animate-pulse rounded-xl bg-cloud/40" />
    <div v-else-if="error" class="rounded-md bg-red-50 p-3 text-red-700">
      Failed to load book: {{ error.message }}
    </div>
    <div v-else class="grid gap-6 md:grid-cols-[280px,1fr]">
      <div>
        <img
          v-if="data?.image?.url"
          :src="data.image.url"
          :alt="data.name"
          class="w-full rounded-xl object-cover shadow"
        />
        <div v-else class="flex h-72 items-center justify-center rounded-xl bg-gunmetal text-4xl font-bold text-white">
          {{ (data?.name || '').split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase() }}
        </div>
      </div>

      <div>
        <h1 class="text-3xl font-extrabold text-gunmetal">{{ data?.name }}</h1>
        <p class="mt-1 text-gray-600">{{ data?.nationality }}</p>

        <div v-if="data?.genres?.length" class="mt-3 flex flex-wrap gap-2">
          <span v-for="g in data.genres" :key="g" class="rounded-full bg-cloud px-2 py-1 text-xs font-semibold text-gunmetal">
            {{ g }}
          </span>
        </div>

        <div class="mt-6 flex gap-2">
          <a
            v-if="data?.website"
            :href="data.website" target="_blank"
            class="inline-flex items-center rounded-md border border-gunmetal px-3 py-2 text-sm font-semibold text-gunmetal hover:bg-cloud/40"
          >
            Website
          </a>
        </div>
      </div>
    </div>
  </section>
</template>