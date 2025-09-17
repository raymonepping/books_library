<template>
  <footer class="w-full bg-gunmetal text-white border-t border-white/10">
    <div class="container mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm">
      <div class="flex items-center gap-2">
        <span class="font-semibold">My Book Library</span>
        <span class="text-white/60">— organize, search, and enjoy</span>
      </div>

      <div class="flex items-center gap-4">
        <NuxtLink to="/contact" class="hover:text-cloud transition">Contact</NuxtLink>
        <NuxtLink to="/privacy" class="hover:text-cloud transition">Privacy</NuxtLink>
        <NuxtLink to="/terms" class="hover:text-cloud transition">Terms</NuxtLink>
      </div>

      <div class="flex items-center gap-3">
        <a href="https://github.com" target="_blank" aria-label="GitHub" class="hover:text-cloud transition">
          <i class="fab fa-github"></i>
        </a>
        <a href="https://medium.com" target="_blank" aria-label="Medium" class="hover:text-cloud transition">
          <i class="fab fa-medium"></i>
        </a>
      </div>
    </div>

    <!-- Sub-footer strip -->
    <div class="bg-pumpkin text-white/95">
      <div class="container mx-auto px-4 py-2 text-xs flex items-center justify-between">
        <span>© {{ new Date().getFullYear() }} My Book Library</span>
        <span class="hidden sm:inline">
          Powered by HashiCorp Vault · Couchbase NoSQL · MinIO S3 · Nuxt Web Framework · Tailwind CSS
        </span>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
// optional: no script required for now
</script>