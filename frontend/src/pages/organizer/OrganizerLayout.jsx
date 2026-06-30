import { useQuery } from '@tanstack/react-query'
import { Calendar, Home, LayoutDashboard, Settings, Settings2, ShoppingCart, User, Users } from 'lucide-react'
import { getStoredUser, getUserRoles } from '@/lib/auth.js'
import { RolePortalLayout } from '@/pages/shared/RolePortalLayout.jsx'
import { fetchOrganizerProfile } from '@/services/organizerEvents.js'
import { AvatarInitials } from './OrganizerComponents.jsx'

const navSections = [
  {
    label: 'Tổng quan',
    items: [{ label: 'Tổng quan', to: '/organizer', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Sự kiện',
    group: true,
    icon: Calendar,
    children: [
      { label: 'Tất cả sự kiện', to: '/organizer/events' },
    ],
  },
  {
    label: 'Bán hàng',
    group: true,
    icon: ShoppingCart,
    children: [
      { label: 'Đơn hàng', to: '/organizer/orders' },
      { label: 'Phân tích vé', to: '/organizer/ticket-sales' },
      { label: 'Mã khuyến mãi', to: '/organizer/promotions' },
    ],
  },
  {
    label: 'Khán giả',
    group: true,
    icon: Users,
    children: [
      { label: 'Người tham dự', to: '/organizer/attendees' },
      { label: 'Check-in', to: '/organizer/checkin-dashboard' },
      { label: 'Phản hồi', to: '/organizer/reports' },
    ],
  },
  {
    label: 'Vận hành',
    group: true,
    icon: Settings2,
    children: [
      { label: 'Địa điểm', to: '/organizer/venues' },
      { label: 'Quản lý nhân sự', to: '/organizer/staff-management' },
      { label: 'Công việc nhân sự', to: '/organizer/staff-tasks' },
    ],
  },
  {
    label: 'Cài đặt',
    group: true,
    icon: Settings,
    children: [
      { label: 'Thanh toán', to: '/organizer/settings/payment' },
      { label: 'Gói dịch vụ', to: '/organizer/subscriptions' },
      { label: 'Thông báo', to: '/organizer/announcements' },
      { label: 'Chính sách', to: '/organizer/policies' },
    ],
  },
]

export function OrganizerLayout() {
  const user = parseStoredUser()
  const roles = getUserRoles(user)
  const isAllowed = roles.some((role) => ['organizer', 'admin', 'super_admin'].includes(role))
  const profileQuery = useQuery({
    queryKey: ['organizer-profile'],
    queryFn: fetchOrganizerProfile,
    enabled: isAllowed,
    retry: false,
  })
  const isIndividualOrganizer = profileQuery.data?.request_type === 'INDIVIDUAL'
  const bottomItems = [
    ...(isIndividualOrganizer
      ? [{ label: 'Trang chủ', to: '/', icon: Home, end: true }]
      : []),
    { label: 'Hồ sơ', to: '/organizer/profile', icon: User },
  ]

  return (
    <RolePortalLayout
      user={user}
      isAllowed={isAllowed}
      portalLabel="Organizer Portal"
      roleLabel="Organizer"
      profileTo="/organizer/profile"
      navSections={navSections}
      bottomItems={bottomItems}
      avatar={
        user?.avatar_url ? (
          <img src={user.avatar_url} alt="Organizer" className="size-7 rounded-full object-cover" />
        ) : (
          <AvatarInitials name={user?.full_name || user?.email || 'Organizer'} className="size-7" />
        )
      }
    />
  )
}

function parseStoredUser() {
  return getStoredUser()
}
