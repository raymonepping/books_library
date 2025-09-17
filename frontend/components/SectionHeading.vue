<!-- components/SectionHeading.vue -->
<template>
  <div class="flex items-end justify-between">
    <div>
      <component :is="as" class="text-xl font-semibold text-gunmetal">
        {{ title }}
      </component>

      <!-- underline -->
      <div
        class="mt-1 h-[3px] rounded-full"
        :class="underlineColor"
        :style="{ width: underlineWidth }"
      />
    </div>

    <!-- right-side actions (defaults to 'View all' link if `to` is provided) -->
    <slot name="actions">
      <NuxtLink v-if="to" :to="to" class="text-sm text-pumpkin hover:underline">
        View all
      </NuxtLink>
    </slot>
  </div>
</template>

<script setup lang="ts">
type Props = {
  title: string
  to?: string
  as?: string
  underlineColor?: string  // Tailwind class like 'bg-pumpkin'
  underlineWidth?: string  // e.g. '4rem'
}

const props = withDefaults(defineProps<Props>(), {
  as: 'h2',
  underlineColor: 'bg-pumpkin',
  underlineWidth: '4rem',
})

const { title, to, as, underlineColor, underlineWidth } = props
</script>