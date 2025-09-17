<script setup lang="ts">
import BaseCard from '~/components/BaseCard.vue'
import type { Book } from '~/types/book'

const props = defineProps<{ book: Book }>()
const imgUrl = computed(() => props.book.image?.url || '')
</script>

<template>
  <BaseCard>
    <template #image>
      <img
        v-if="imgUrl"
        :src="imgUrl"
        alt=""
        class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        loading="lazy"
        referrerpolicy="no-referrer"
      />
      <div v-else class="h-full w-full flex items-center justify-center text-grayx">
        No cover
      </div>
    </template>

    <h3 class="font-semibold text-gunmetal line-clamp-2 transition-colors group-hover:text-pumpkin">
      {{ book.title }}
    </h3>
    <p class="text-sm text-grayx">
      {{ book.author?.name }} • {{ book.publication_year }}
    </p>

    <div class="mt-2 flex flex-wrap gap-1">
      <span class="px-2 py-0.5 text-xs rounded-full bg-cloud/40 text-gunmetal">
        {{ book.series || '—' }}
      </span>
      <span class="px-2 py-0.5 text-xs rounded-full bg-pumpkin/10 text-pumpkin">
        {{ (book.genres && book.genres[0]) || 'genre' }}
      </span>
    </div>
  </BaseCard>
</template>