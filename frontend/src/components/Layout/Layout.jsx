import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import ToastStack from '../ui/ToastStack.jsx'
import AddBookModal from '../AddBookModal/AddBookModal.jsx'

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-noir text-ice">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <ToastStack />
      <AddBookModal />
    </div>
  )
}
