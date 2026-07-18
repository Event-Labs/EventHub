import { useQuery } from '@tanstack/react-query'
import { Calendar, Home, LayoutDashboard, Settings, Settings2, ShoppingCart, User, Users } from 'lucide-react'
import { getStoredUser, getStoredUserKey, getUserRoles } from '@/lib/auth.js'
import { ProfileAvatar } from '@/pages/shared/ProfileAvatar.jsx'
import { RolePortalLayout } from '@/pages/shared/RolePortalLayout.jsx'
import { fetchOrganizerProfile } from '@/services/organizerEvents.js'
import { getProfile } from '@/services/user.service.js'

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
  const currentUserKey = getStoredUserKey(user)
  const roles = getUserRoles(user)
  const isAllowed = roles.some((role) => ['organizer', 'admin', 'super_admin'].includes(role))
  const profileQuery = useQuery({
    queryKey: ['organizer-profile', currentUserKey],
    queryFn: fetchOrganizerProfile,
    enabled: isAllowed,
    retry: false,
  })
  const accountProfileQuery = useQuery({
    queryKey: ['profile', currentUserKey],
    queryFn: getProfile,
    enabled: isAllowed,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
  const isIndividualOrganizer = profileQuery.data?.request_type === 'INDIVIDUAL'
  const organizerAvatarUrl = profileQuery.data?.organization_avatar_url
  const googleAvatarUrl = accountProfileQuery.data?.avatar_url || user?.avatar_url
  const organizerDisplayName =
    profileQuery.data?.organization_name || user?.full_name || user?.email || 'Nhà tổ chức'
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
      portalLabel="Cổng nhà tổ chức"
      roleLabel="Nhà tổ chức"
      profileTo="/organizer/profile"
      navSections={navSections}
      bottomItems={bottomItems}
      avatar={
        <ProfileAvatar
          sources={[organizerAvatarUrl, googleAvatarUrl]}
          name={organizerDisplayName}
          alt="Ảnh đại diện nhà tổ chức"
          className="size-7"
          fallback="EH"
        />
      }
    />
  )
}

function parseStoredUser() {
  return getStoredUser()
}
