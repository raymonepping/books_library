import { useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import BottomNav from './BottomNav.jsx'
import Footer from './Footer.jsx'
import ToastStack from '../ui/ToastStack.jsx'
import AddBookModal from '../AddBookModal/AddBookModal.jsx'
import KeyboardShortcutsModal from '../ui/KeyboardShortcutsModal.jsx'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js'

function LayoutInner() {
  const [showHelp, setShowHelp] = useState(false)
  const openHelp  = useCallback(() => setShowHelp(true), [])
  useKeyboardShortcuts(openHelp)

  return (
    <div className="flex h-screen overflow-hidden bg-noir text-ice">
      <div className="hidden md:flex shrink-0">
        <Sidebar />
      </div>

      <main className="flex-1 overflow-y-auto pb-16 md:pb-12">
        <Outlet />
      </main>

      <BottomNav />
      <Footer />
      <ToastStack />
      <AddBookModal />
      {showHelp && <KeyboardShortcutsModal onClose={() => setShowHelp(false)} />}
    </div>
  )
}

export default function Layout() {
  return <LayoutInner />
}
