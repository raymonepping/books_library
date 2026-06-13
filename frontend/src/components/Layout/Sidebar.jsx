import { NavLink } from 'react-router-dom'
import {
  BookOpen, Users, Layers, Compass, LayoutDashboard,
  PanelLeftClose, PanelLeftOpen, Plus,
} from 'lucide-react'
import { useUIStore } from '../../store/useUIStore.js'

const NAV = [
  { to: '/books',     icon: BookOpen,        label: 'Library'   },
  { to: '/authors',   icon: Users,           label: 'Authors'   },
  { to: '/series',    icon: Layers,          label: 'Series'    },
  { to: '/discover',  icon: Compass,         label: 'Discover'  },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
]

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, setAddBookOpen } = useUIStore()
  const collapsed = sidebarCollapsed

  return (
    <aside
      style={{ width: collapsed ? 68 : 232, background: 'linear-gradient(180deg, #222 0%, #1a1a1a 100%)' }}
      className="flex flex-col h-screen shrink-0 transition-[width] duration-200 ease-in-out overflow-hidden border-r border-white/[0.06]"
    >
      <div className="flex flex-col h-full">

        {/* Logo */}
        <div className={`flex items-center h-16 shrink-0 border-b border-white/[0.06] ${collapsed ? 'justify-center px-0' : 'px-5 gap-3'}`}>
          <div className="w-8 h-8 rounded-lg bg-blood flex items-center justify-center shrink-0 shadow-lg shadow-blood/30">
            <span className="font-serif text-white text-base font-bold leading-none">B</span>
          </div>
          {!collapsed && (
            <span className="font-serif text-ice text-[17px] font-semibold tracking-wide whitespace-nowrap">
              Bibliotheek
            </span>
          )}
        </div>

        {/* Add book */}
        <div className={`shrink-0 py-4 ${collapsed ? 'px-3' : 'px-4'}`}>
          <button
            onClick={() => setAddBookOpen(true)}
            title="Add book"
            className={[
              'flex items-center rounded-lg font-medium text-sm transition-all duration-150 cursor-pointer',
              'bg-blood hover:bg-blood/90 text-white shadow-md shadow-blood/20 hover:shadow-blood/40',
              collapsed ? 'w-full justify-center p-2.5' : 'w-full gap-2 px-4 py-2.5',
            ].join(' ')}
          >
            <Plus size={16} strokeWidth={2.5} className="shrink-0" />
            {!collapsed && <span>Add book</span>}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto no-scrollbar px-2 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                [
                  'relative flex items-center rounded-lg transition-all duration-150 cursor-pointer group',
                  collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-white/10 text-amber'
                    : 'text-ice/50 hover:text-ice hover:bg-white/[0.06]',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active left accent */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-amber rounded-r-full" />
                  )}
                  <Icon size={18} strokeWidth={isActive ? 2 : 1.75} className="shrink-0" />
                  {!collapsed && (
                    <span className="text-sm font-medium whitespace-nowrap">{label}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center h-12 border-t border-white/[0.06] text-ice/25 hover:text-ice/60 transition-colors cursor-pointer"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>

      </div>
    </aside>
  )
}
