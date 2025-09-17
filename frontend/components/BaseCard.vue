<template>
  <div
    class="group overflow-hidden rounded-xl border border-lightgray/60 bg-white shadow-sm
           transition-all duration-200
           hover:shadow-lg hover:shadow-pumpkin/20
           ring-1 ring-transparent hover:ring-pumpkin/20"
  >
    <!-- media area, stable ratio -->
    <div class="relative aspect-[4/3] bg-lightgray/40 overflow-hidden">
      <slot name="image" />

      <!-- badge (e.g. nationality) -->
      <div
        v-if="badge"
        class="absolute left-2 top-2 rounded-md bg-pumpkin px-2 py-0.5 text-xs font-semibold text-white shadow"
      >
        {{ badge }}
      </div>
    </div>

    <!-- body -->
    <div class="p-3">
      <slot />
    </div>

    <!-- actions -->
    <div class="px-3 pb-3 pt-1">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ badge?: string }>()
</script>