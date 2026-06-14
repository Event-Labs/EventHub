import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  Calendar,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPin,
  Megaphone,
  PackageOpen,
  Settings2,
  ShieldCheck,
  Ticket,
} from 'lucide-react'
import { getUserRoles } from '@/lib/auth.js'
import { AvatarInitials } from './OrganizerComponents.jsx'

const navItems = [
  { label: 'Tổng quan', to: '/organizer', icon: LayoutDashboard, end: true },
  { label: 'Quản lý sự kiện', to: '/organizer/events', icon: Calendar },
  { label: 'Quản lý vé', to: '/organizer/tickets', icon: Ticket },
  { label: 'Quản lý địa điểm', to: '/organizer/venues', icon: MapPin },
  { label: 'Mã khuyến mãi', to: '/organizer/promotions', icon: Megaphone },
  {
    label: 'Vận hành',
    to: '/organizer/attendees',
    icon: Settings2,
    children: [
      { label: 'Người tham dự', to: '/organizer/attendees' },
      { label: 'Quản lý nhân sự', to: '/organizer/staff-management' },
      { label: 'Công việc nhân sự', to: '/organizer/staff-tasks' },
      { label: 'Báo cáo', to: '/organizer/reports' },
    ],
  },
  { label: 'Thông báo', to: '/organizer/announcements', icon: ClipboardList },
  { label: 'Gói dịch vụ', to: '/organizer/subscriptions', icon: PackageOpen },
  { label: 'Chính sách', to: '/organizer/policies', icon: FileText },

]

export function OrganizerLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const token = localStorage.getItem('eventhub-token')
  const user = parseStoredUser()

  const roles = getUserRoles(user)
  const isAllowed = roles.some((role) => ['organizer', 'admin', 'super_admin'].includes(role))

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

  if (!isAllowed) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen bg-[#f7f9fb] text-[#191c1e]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col bg-background px-3 py-6 text-content lg:flex">
        <div className="px-3">
          <h1 className="font-display text-xl font-extrabold text-primary">EventHub</h1>
        </div>
        <nav className="mt-9 flex-1 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavGroup key={item.label} item={item} />
          ))}
        </nav>
        <div className="space-y-1 border-t border-border-soft pt-4">
          <NavLink
            to="/organizer/profile"
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
      <main className="lg:pl-[240px]">
        <OrganizerTopBar user={user} />
        <div className="mx-auto max-w-[1280px] px-4 py-7 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function NavGroup({ item }) {
  const hasChildren = Boolean(item.children?.length)
  const Icon = item.icon

  return (
    <div>
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
      {hasChildren && (
        <div className="ml-6 mt-1 border-l border-border-soft pl-4">
          {item.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className={({ isActive }) =>
                `block rounded px-2 py-1.5 text-xs font-bold ${
                  isActive ? 'text-primary' : 'text-muted hover:text-primary'
                }`
              }
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

function OrganizerTopBar({ user }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-end border-b border-[#c3c6d7] bg-[#f7f9fb]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <IconButton icon={Bell} />
        {user?.avatar_url ? (
          <img
            src={user.avatar_url}
            alt="Organizer"
            className="size-8 rounded-full object-cover"
          />
        ) : (
          <AvatarInitials name={user?.full_name || user?.email || 'Organizer'} className="size-8" />
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
