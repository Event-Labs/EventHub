import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  CalendarCheck,
  ClipboardList,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  QrCode,
  Search,
  Settings,
  UserCircle,
  UserPlus,
} from 'lucide-react'
import { getUserRoles } from '@/lib/auth.js'
import { Avatar } from './StaffComponents.jsx'

const navItems = [
  { label: 'Tổng quan', to: '/staff', icon: LayoutDashboard, end: true },
  { label: 'Sự kiện được giao', to: '/staff/events', icon: CalendarCheck },
  { label: 'Công việc được giao', to: '/staff/tasks', icon: ClipboardList },
  { label: 'QR Check-in', to: '/staff/qr-check-in', icon: QrCode },
  { label: 'Check-in thủ công', to: '/staff/manual-check-in', icon: UserPlus },
  { label: 'Thống kê check-in', to: '/staff/check-in-count', icon: BarChart3 },
]

const logoSrc = '/images/LogoEH.png'

export function StaffLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const token = localStorage.getItem('eventhub-token')
  const user = parseStoredUser()
  const roles = getUserRoles(user)
  const allowed = roles.some((role) => ['staff', 'admin', 'super_admin'].includes(role))

  const logout = () => {
    localStorage.removeItem('eventhub-auth')
    localStorage.removeItem('eventhub-token')
    localStorage.removeItem('eventhub-user')
    window.dispatchEvent(new Event('eventhub-auth'))
    navigate('/login', { replace: true })
  }

  if (!token) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    )
  }

  if (!allowed) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-[#f7f9fb] text-[#191c1e]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col bg-background px-3 py-6 text-content lg:flex">
        <div className="px-3">
          <img src={logoSrc} alt="EventHub" className="h-10 w-[176px] object-cover object-center mix-blend-screen" />
        </div>
        <nav className="mt-9 flex-1 space-y-1">
          {navItems.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-4 py-3 text-sm font-bold transition ${
                  isActive ? 'bg-primary text-slate-950' : 'text-subtle hover:bg-panel-soft hover:text-primary'
                }`
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t border-border-soft pt-4">
          <NavLink
            to="/staff/profile"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-4 py-2.5 text-sm font-semibold transition ${
                isActive ? 'text-primary' : 'text-subtle hover:bg-panel-soft hover:text-primary'
              }`
            }
          >
            <UserCircle className="size-4" />
            Hồ sơ
          </NavLink>
          <button className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-sm font-semibold text-subtle transition hover:bg-panel-soft hover:text-primary">
            <HelpCircle className="size-4" />
            Hỗ trợ
          </button>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-sm font-semibold text-subtle transition hover:bg-panel-soft hover:text-primary"
          >
            <LogOut className="size-4" />
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="lg:pl-[240px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#c3c6d7] bg-[#f7f9fb]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="font-display text-lg font-extrabold text-primary">Cổng nhân sự</div>
          <div className="flex items-center gap-3">
            <div className="relative hidden w-72 sm:block">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#737686]" />
              <input className="h-9 w-full rounded-md border border-[#d8dadc] bg-[#f2f4f6] pl-10 pr-3 text-sm outline-none focus:border-primary" placeholder="Tìm kiếm..." />
            </div>
            <IconButton icon={Bell} />
            <IconButton icon={Settings} />
            {user?.avatar_url ? <img src={user.avatar_url} alt="Staff" className="size-8 rounded-full object-cover" /> : <Avatar name={user?.full_name || user?.email || 'Staff'} className="size-8" />}
          </div>
        </header>
        <div className="mx-auto max-w-[1280px] px-4 py-7 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function IconButton({ icon: Icon }) {
  return <button className="grid size-9 place-items-center rounded-full text-[#434655] hover:bg-[#eceef0] hover:text-primary"><Icon className="size-4" /></button>
}

function parseStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('eventhub-user') || 'null')
  } catch {
    return null
  }
}
