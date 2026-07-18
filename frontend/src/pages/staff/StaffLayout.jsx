import { BarChart3, CalendarCheck, ClipboardList, Home, LayoutDashboard, QrCode, Ticket, UserCircle, UserPlus } from 'lucide-react'
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
    label: 'Soát vé',
    items: [
      { label: 'Đặt vé trực tiếp', to: '/staff/direct-booking', icon: Ticket },
      { label: 'Quét vé bằng mã QR', to: '/staff/qr-check-in', icon: QrCode },
      { label: 'Soát vé thủ công', to: '/staff/manual-check-in', icon: UserPlus },
      { label: 'Thống kê soát vé', to: '/staff/check-in-count', icon: BarChart3 },
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
          name={user?.full_name || user?.email || 'Nhân sự'}
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

