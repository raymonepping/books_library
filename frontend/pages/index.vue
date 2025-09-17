<!-- pages/index.vue -->
<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { Book } from '~/types'

const { data: authors } = useApi<{ items: any[] }>('/authors?limit=3&offset=0')
const { data: books }   = useApi<{ items: Book[] }>('/books?limit=3&offset=0&sort=created_at:desc')
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
    <!-- Hero -->
    <section class="mt-6">
      <h1 class="text-2xl sm:text-3xl font-extrabold text-gunmetal">
        Welcome back to <span class="text-pumpkin">BookLib</span>
      </h1>
      <p class="text-gray-600">Your private collection—fast search, clean UI, secure by Vault.</p>
    </section>

    <!-- Authors -->
    <section class="mt-10">
      <SectionHeading title="Latest authors" to="/authors" />
      <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <AuthorCard v-for="a in authors?.items || []" :key="a.id" :author="a" />
      </div>
    </section>

    <div class="my-10 border-t border-gray-200"></div>

    <!-- Books -->
    <section>
      <SectionHeading title="Latest books" to="/books" />
      <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <BookCard v-for="b in books?.items || []" :key="b.id" :book="b" />
        <div v-if="!books?.items?.length" class="text-gray-500 text-sm">
          No books yet. Add your first one from the Admin.
        </div>
      </div>
    </section>
  </div>
</template>