import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import BottomNav from './BottomNav.jsx'
import ToastStack from '../ui/ToastStack.jsx'
import AddBookModal from '../AddBookModal/AddBookModal.jsx'

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-noir text-ice">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:flex shrink-0">
        <Sidebar />
      </div>

      {/* Main content — pad bottom on mobile for bottom nav */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <BottomNav />

      <ToastStack />
      <AddBookModal />
    </div>
  )
}
