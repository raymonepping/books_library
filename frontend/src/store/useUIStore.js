import { create } from 'zustand'

export const useUIStore = create((set) => ({
  // Global search
  searchOpen: false,
  setSearchOpen: (v) => set({ searchOpen: v }),
  toggleSearch: () => set(s => ({ searchOpen: !s.searchOpen })),

  // Add Book modal
  addBookOpen: false,
  setAddBookOpen: (v) => set({ addBookOpen: v }),

  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // Books view mode: 'spine' | 'grid' | 'list'
  booksView: 'grid',
  setBooksView: (v) => set({ booksView: v }),

  // Toast notifications
  toasts: [],
  addToast: (message, type = 'info') =>
    set(s => ({
      toasts: [...s.toasts, { id: Date.now(), message, type }],
    })),
  removeToast: (id) =>
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))
