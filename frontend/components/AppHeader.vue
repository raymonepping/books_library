<template>
  <header class="sticky top-0 z-50 bg-pumpkin text-white shadow-md/50 shadow-gunmetal/20">
    <nav class="container mx-auto flex flex-wrap items-center justify-between px-4 py-3">
      <!-- Logo / Brand -->
      <NuxtLink to="/" class="flex items-center gap-3">
        <span class="text-2xl font-extrabold tracking-tight">My Book Library</span>
      </NuxtLink>

      <!-- Hamburger -->
      <button
        class="md:hidden inline-flex items-center justify-center p-2 rounded focus:outline-none focus:ring-2 focus:ring-white/70"
        @click="menuOpen = !menuOpen"
        :aria-expanded="menuOpen"
        aria-label="Toggle menu"
      >
        <svg v-if="!menuOpen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
        <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>

      <!-- Nav -->
      <ul
        class="font-medium text-sm transition-all duration-300 ease-in-out md:flex gap-4 md:static absolute top-full left-0 w-full md:w-auto bg-pumpkin md:bg-transparent px-4 py-3 md:py-0 border-t md:border-0 border-white/10"
        :class="menuOpen ? 'block' : 'hidden md:flex'"
      >
        <li v-for="item in menuItems" :key="item.name" class="relative group">
          <template v-if="item.children">
            <button
              class="flex items-center w-full md:w-auto py-2 md:py-0 hover:text-cloud focus:outline-none focus:ring-2 focus:ring-white/60 rounded"
              @click="menuOpen ? toggleSubmenu(item.name) : null"
            >
              {{ item.name }}
              <svg class="ml-1 w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06-.02L10 10.67l3.71-3.48a.75.75 0 011.02 1.1l-4.25 4a.75.75 0 01-1.04 0l-4.25-4a.75.75 0 01-.02-1.06z"
                      clip-rule="evenodd" />
              </svg>
            </button>
            <!-- Dropdown -->
            <ul
              class="md:absolute md:left-0 md:top-full md:min-w-[180px] md:rounded-md md:shadow-lg md:shadow-gunmetal/20 md:ring-1 md:ring-black/5 md:bg-cloud text-gunmetal overflow-hidden"
              :class="[
                menuOpen && submenuOpen === item.name ? 'block' : 'hidden',
                'md:hidden md:group-hover:block'
              ]"
            >
              <li v-for="child in item.children" :key="child.name">
                <NuxtLink
                  :to="child.to"
                  class="block py-2 px-3 hover:bg-lightgray focus:bg-lightgray transition"
                  @click="closeMenus"
                >
                  {{ child.name }}
                </NuxtLink>
              </li>
            </ul>
          </template>

          <template v-else>
            <NuxtLink
              :to="item.to"
              class="block py-2 md:py-0 hover:text-cloud focus:outline-none focus:ring-2 focus:ring-white/60 rounded"
              @click="closeMenus"
            >
              {{ item.name }}
            </NuxtLink>
          </template>
        </li>

        <!-- Mobile auth controls -->
        <li class="md:hidden mt-2 flex items-center gap-3">
          <template v-if="isLoggedIn">
            <button
              @click="handleLogout"
              class="inline-flex items-center px-3 py-2 rounded bg-gunmetal hover:opacity-90 transition"
            >Logout</button>
          </template>
          <template v-else>
            <NuxtLink
              to="/auth/login"
              class="inline-flex items-center px-3 py-2 rounded bg-burnt hover:bg-intlorange transition"
              @click="closeMenus"
            >Login</NuxtLink>
            <NuxtLink
              to="/auth/signup"
              class="inline-flex items-center px-3 py-2 rounded bg-gunmetal hover:opacity-90 transition"
              @click="closeMenus"
            >Signup</NuxtLink>
          </template>
        </li>
      </ul>

      <!-- Desktop auth controls -->
      <div class="hidden md:flex items-center gap-3">
        <template v-if="isLoggedIn">
          <span class="text-sm text-cloud">Hi, {{ user?.display_name || user?.email }}</span>
          <button
            @click="handleLogout"
            class="inline-flex items-center px-3 py-2 rounded bg-gunmetal text-white hover:opacity-90 transition"
          >Logout</button>
        </template>
        <template v-else>
          <NuxtLink
            to="/auth/login"
            class="inline-flex items-center px-3 py-2 rounded bg-burnt hover:bg-intlorange transition"
          >Login</NuxtLink>
          <NuxtLink
            to="/auth/signup"
            class="inline-flex items-center px-3 py-2 rounded bg-gunmetal text-white hover:opacity-90 transition"
          >Signup</NuxtLink>
        </template>
      </div>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '~/composables/useAuth'

const { isLoggedIn, user, logout } = useAuth()

const menuOpen = ref(false)
const submenuOpen = ref<string | null>(null)

function toggleSubmenu(name: string) {
  submenuOpen.value = submenuOpen.value === name ? null : name
}
function closeMenus() {
  menuOpen.value = false
  submenuOpen.value = null
}

async function handleLogout() {
  await logout()
  navigateTo('/auth/login')
}

// Library-centric nav
const menuItems = [
  { name: 'Home', to: '/' },
  { name: 'Authors', to: '/authors' },
  { name: 'Books', to: '/books' },
  {
    name: 'Discover',
    children: [
      { name: 'Search', to: '/search' },
      { name: 'Similar (Vectors)', to: '/similar' },
    ]
  },
  { name: 'About', to: '/about' },
]
</script>