<template>
  <BaseCard :badge="author.nationality">
    <template #image>
      <NuxtLink :to="`/authors/${slug}`" class="block h-full w-full">
        <img
          v-if="img"
          :src="img"
          :alt="author.name"
          class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          loading="lazy"
        />
        <div
          v-else
          class="flex h-full w-full items-center justify-center bg-gunmetal text-white text-3xl font-bold"
          aria-hidden="true"
        >
          {{ initials }}
        </div>
      </NuxtLink>
    </template>

    <NuxtLink :to="`/authors/${slug}`" class="block">
      <h3 class="line-clamp-1 text-lg font-semibold text-gunmetal transition-colors group-hover:text-pumpkin">
        {{ author.name }}
      </h3>
    </NuxtLink>

    <p class="mt-1 text-sm text-gray-600 line-clamp-2">
      <span v-if="author.genres?.length">Genres: {{ author.genres.join(', ') }}</span>
      <span v-else>&nbsp;</span>
    </p>

    <template #actions>
      <div class="flex gap-2">
        <NuxtLink
          :to="`/authors/${slug}`"
          class="inline-flex items-center rounded-md bg-pumpkin px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-burnt"
        >
          View
        </NuxtLink>
        <a
          v-if="author.website"
          :href="author.website"
          target="_blank"
          class="inline-flex items-center rounded-md border border-gunmetal px-2.5 py-1.5 text-xs font-semibold text-gunmetal hover:bg-cloud/30"
        >
          Website
        </a>
      </div>
    </template>
  </BaseCard>
</template>

<script setup lang="ts">
import BaseCard from '~/components/BaseCard.vue'

type Author = {
  id: string
  name: string
  nationality?: string
  genres?: string[]
  image?: { url?: string, bucket?: string, key?: string }
}

const props = defineProps<{ author: Author }>()
const slug = computed(() => (props.author.id?.includes('::') ? props.author.id.split('::')[1] : props.author.id))
const img  = computed(() => props.author.image?.url || null)
const initials = computed(() =>
  (props.author.name || '').split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
)
</script>