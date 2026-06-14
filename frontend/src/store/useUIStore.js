import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useUIStore = create(
  persist(
    (set) => ({
      // Global search
      searchOpen: false,
      setSearchOpen: (v) => set({ searchOpen: v }),
      toggleSearch: () => set(s => ({ searchOpen: !s.searchOpen })),

      // Add Book modal
      addBookOpen: false,
      setAddBookOpen: (v) => set({ addBookOpen: v }),

      // Sidebar (desktop collapse)
      sidebarCollapsed: false,
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      // Mobile drawer
      mobileDrawerOpen: false,
      setMobileDrawerOpen: (v) => set({ mobileDrawerOpen: v }),

      // Books view mode: 'spine' | 'grid' | 'list'
      booksView: 'grid',
      setBooksView: (v) => set({ booksView: v }),

      // Books density: 'normal' | 'compact'
      booksDensity: 'normal',
      setBooksDensity: (v) => set({ booksDensity: v }),
      toggleBooksDensity: () => set(s => ({ booksDensity: s.booksDensity === 'normal' ? 'compact' : 'normal' })),

      // Toast notifications — action: { label, onClick } for undo-style toasts
      toasts: [],
      addToast: (message, type = 'info', action = null) =>
        set(s => ({
          toasts: [...s.toasts, { id: Date.now(), message, type, action }],
        })),
      removeToast: (id) =>
        set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
    }),
    {
      name: 'bibliotheek-ui',
      // Only persist display preferences — not transient state like modals or toasts
      partialize: (state) => ({
        booksView:        state.booksView,
        booksDensity:     state.booksDensity,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
)
