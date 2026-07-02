import { BarChart3, CalendarCheck, ClipboardList, Home, LayoutDashboard, QrCode, UserCircle, UserPlus } from 'lucide-react'
import { getStoredUser, getUserRoles } from '@/lib/auth.js'
import { RolePortalLayout } from '@/pages/shared/RolePortalLayout.jsx'
import { Avatar } from './StaffComponents.jsx'

const navSections = [
  {
    label: 'Tổng quan',
    items: [
      { label: 'Tổng quan', to: '/staff', icon: LayoutDashboard, end: true },
      { label: 'Sự kiện được giao', to: '/staff/events', icon: CalendarCheck },
    ],
  },
  {
    label: 'Công việc',
    items: [{ label: 'Danh sách công việc', to: '/staff/tasks', icon: ClipboardList }],
  },
  {
    label: 'Check-in',
    items: [
      { label: 'QR Check-in', to: '/staff/qr-check-in', icon: QrCode },
      { label: 'Check-in thủ công', to: '/staff/manual-check-in', icon: UserPlus },
      { label: 'Thống kê check-in', to: '/staff/check-in-count', icon: BarChart3 },
    ],
  },
]

export function StaffLayout() {
  const user = parseStoredUser()
  const roles = getUserRoles(user)
  const isAllowed = roles.some((role) => ['staff', 'admin', 'super_admin'].includes(role))
  const bottomItems = [
    ...(roles.includes('customer')
      ? [{ label: 'Trang chủ', to: '/', icon: Home, end: true }]
      : []),
    { label: 'Hồ sơ', to: '/staff/profile', icon: UserCircle },
  ]

  return (
    <RolePortalLayout
      user={user}
      isAllowed={isAllowed}
      portalLabel="Staff Portal"
      roleLabel="Nhân viên"
      profileTo="/staff/profile"
      navSections={navSections}
      bottomItems={bottomItems}
      avatar={
        user?.avatar_url ? (
          <img src={user.avatar_url} alt="Staff" className="size-7 rounded-full object-cover" />
        ) : (
          <Avatar name={user?.full_name || user?.email || 'Staff'} className="size-7" />
        )
      }
    />
  )
}

function parseStoredUser() {
  return getStoredUser()
}

