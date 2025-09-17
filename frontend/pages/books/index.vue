<!-- pages/books/index.vue -->
<template>
  <div class="max-w-7xl mx-auto px-4 py-6">
    <h1 class="text-2xl font-bold text-gunmetal mb-4">Books</h1>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <BookCard v-for="b in books?.items || []" :key="b.id" :book="b" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { Book } from '~/types'
const { data: books } = useApi<{ items: Book[] }>('/books?limit=24&offset=0')
</script>
