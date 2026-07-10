import { NavLink } from 'react-router-dom'
import { BookOpen, Users, Compass, Atom, LayoutDashboard } from 'lucide-react'

const NAV = [
  { to: '/books',     icon: BookOpen,        label: 'Library'   },
  { to: '/authors',   icon: Users,           label: 'Authors'   },
  { to: '/discover',  icon: Compass,         label: 'Discover'  },
  { to: '/explore',   icon: Atom,            label: 'Explore'   },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
]

export default function BottomNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-white/[0.06]"
      style={{ background: 'linear-gradient(180deg, #222 0%, #1a1a1a 100%)' }}
    >
      {NAV.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] transition-colors',
              isActive ? 'text-amber' : 'text-ice/40 hover:text-ice',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={20} strokeWidth={isActive ? 2 : 1.75} />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
