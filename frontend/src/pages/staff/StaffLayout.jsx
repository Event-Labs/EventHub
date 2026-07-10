import { CalendarCheck, ClipboardList, Home, LayoutDashboard, QrCode, Ticket, UserCircle, UserPlus } from 'lucide-react'
import { getStoredUser, getUserRoles } from '@/lib/auth.js'
import { ProfileAvatar } from '@/pages/shared/ProfileAvatar.jsx'
import { RolePortalLayout } from '@/pages/shared/RolePortalLayout.jsx'

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
      { label: 'Book vé trực tiếp', to: '/staff/direct-booking', icon: Ticket },
      { label: 'QR Check-in', to: '/staff/qr-check-in', icon: QrCode },
      { label: 'Check-in thủ công', to: '/staff/manual-check-in', icon: UserPlus },
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
      portalLabel="Cổng nhân sự"
      roleLabel="Nhân viên"
      profileTo="/staff/profile"
      navSections={navSections}
      bottomItems={bottomItems}
      avatar={
        <ProfileAvatar
          sources={user?.avatar_url}
          name={user?.full_name || user?.email || 'Staff'}
          alt="Ảnh đại diện nhân viên"
          className="size-7"
          fallback="ST"
        />
      }
    />
  )
}

function parseStoredUser() {
  return getStoredUser()
}

