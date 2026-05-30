import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  BriefcaseBusiness,
  Calendar,
  CreditCard,
  Grid3X3,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  Tags,
  Users,
} from 'lucide-react'
import { isAdminUser } from '@/lib/auth.js'
import { AvatarFallback } from './AdminComponents.jsx'

const navItems = [
  { label: 'Tổng quan', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Người dùng', to: '/admin/accounts', icon: Users },
  {
    label: 'Sự kiện',
    icon: Calendar,
    children: [
      { label: 'Loại sự kiện', to: '/admin/events/categories', icon: Tags },
      { label: 'Duyệt sự kiện', to: '/admin/events/review', icon: Calendar },
    ],
  },
  { label: 'Tài chính', to: '/admin/platform-fee', icon: CreditCard },
  { label: 'Gói dịch vụ', to: '/admin/plans', icon: BriefcaseBusiness },
]

export function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const token = localStorage.getItem('eventhub-token')
  const user = parseStoredUser()

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

  if (!isAdminUser(user)) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen bg-[#f7f9fb] text-content">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col bg-background px-3 py-6 text-content lg:flex">
        <div className="px-3">
          <h1 className="font-display text-xl font-extrabold text-primary">EventHub</h1>
        </div>
        <nav className="mt-10 flex-1 space-y-1">
          {navItems.map((item) => (
            <AdminNavItem key={item.label} item={item} />
          ))}
        </nav>
        <div className="space-y-1 border-t border-border-soft pt-4">
          <NavLink
            to="/admin/profile"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-4 py-2.5 text-sm font-semibold transition ${
                isActive ? 'text-primary' : 'text-subtle hover:bg-panel-soft hover:text-primary'
              }`
            }
          >
            <ShieldCheck className="size-4" />
            Hồ sơ
          </NavLink>
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
      <main className="lg:pl-[232px]">
        <TopBar user={user} />
        <div className="mx-auto max-w-[1280px] px-4 py-7 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function AdminNavItem({ item }) {
  const location = useLocation()
  const Icon = item.icon

  if (item.children?.length) {
    const isGroupActive = item.children.some((child) =>
      location.pathname === child.to || location.pathname.startsWith(`${child.to}/`),
    )

    return (
      <div className="space-y-1">
        <div
          className={`flex items-center gap-3 rounded-md px-4 py-3 text-sm font-bold ${
            isGroupActive ? 'bg-panel-soft text-primary' : 'text-subtle'
          }`}
        >
          <Icon className="size-4" />
          {item.label}
        </div>
        <div className="space-y-1 pl-6">
          {item.children.map(({ label, to, icon: ChildIcon, end }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-4 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-primary text-slate-950'
                    : 'text-subtle hover:bg-panel-soft hover:text-primary'
                }`
              }
            >
              <ChildIcon className="size-4" />
              {label}
            </NavLink>
          ))}
        </div>
      </div>
    )
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-4 py-3 text-sm font-bold transition ${
          isActive
            ? 'bg-primary text-slate-950'
            : 'text-subtle hover:bg-panel-soft hover:text-primary'
        }`
      }
    >
      <Icon className="size-4" />
      {item.label}
    </NavLink>
  )
}

function TopBar({ user }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#c3c6d7] bg-[#f7f9fb]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#737686]" />
        <input
          className="h-9 w-full rounded-md border border-[#d8dadc] bg-[#f2f4f6] pl-10 pr-3 text-sm text-[#191c1e] outline-none placeholder:text-[#737686] focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="Tìm kiếm trong quản trị..."
        />
      </div>
      <div className="ml-4 flex items-center gap-2">
        <IconButton icon={Bell} />
        <IconButton icon={Settings} />
        <IconButton icon={Grid3X3} />
        {user?.avatar_url ? (
          <img
            src={user.avatar_url}
            alt="Administrator"
            className="size-8 rounded-full object-cover"
          />
        ) : (
          <AvatarFallback
            name={user?.full_name || user?.email || 'Admin'}
            className="size-8"
          />
        )}
      </div>
    </header>
  )
}

function IconButton({ icon: Icon }) {
  return (
    <button className="grid size-9 place-items-center rounded-full text-[#434655] hover:bg-[#eceef0] hover:text-primary">
      <Icon className="size-4" />
    </button>
  )
}

function parseStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('eventhub-user') || 'null')
  } catch {
    return null
  }
}
