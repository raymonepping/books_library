<template>
  <div class="flex flex-col min-h-screen">
    <!-- Header -->
    <AppHeader />

    <!-- Main Content -->
    <main class="flex-grow">
      <NuxtPage />
    </main>

    <!-- Footer -->
    <AppFooter />
  </div>
</template>

<script setup>
import AppHeader from '@/components/AppHeader.vue';
import AppFooter from '@/components/AppFooter.vue';
</script>
