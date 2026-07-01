import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Home, LayoutDashboard, Settings, Settings2, ShoppingCart, User, Users } from 'lucide-react'
import { getStoredUser, getUserRoles } from '@/lib/auth.js'
import { RolePortalLayout } from '@/pages/shared/RolePortalLayout.jsx'
import { fetchOrganizerProfile } from '@/services/organizerEvents.js'
import { getProfile } from '@/services/user.service.js'
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
  const accountProfileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    enabled: isAllowed,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
  const isIndividualOrganizer = profileQuery.data?.request_type === 'INDIVIDUAL'
  const organizerAvatarUrl = profileQuery.data?.organization_avatar_url
  const googleAvatarUrl = accountProfileQuery.data?.avatar_url || user?.avatar_url
  const organizerDisplayName =
    profileQuery.data?.organization_name || user?.full_name || user?.email || 'Organizer'
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
        <OrganizerAvatar
          cloudUrl={organizerAvatarUrl}
          googleUrl={googleAvatarUrl}
          name={organizerDisplayName}
        />
      }
    />
  )
}

function parseStoredUser() {
  return getStoredUser()
}

function OrganizerAvatar({ cloudUrl, googleUrl, name }) {
  const primaryUrl = cloudUrl || googleUrl
  const sourceKey = `${cloudUrl || ''}|${googleUrl || ''}`
  const [failedImage, setFailedImage] = useState({ key: '', url: '' })
  const failedUrl = failedImage.key === sourceKey ? failedImage.url : ''

  const currentUrl = failedUrl === primaryUrl && cloudUrl && googleUrl && googleUrl !== cloudUrl
    ? googleUrl
    : primaryUrl

  if (!currentUrl || failedUrl === currentUrl) {
    return <AvatarInitials name={name} className="size-7" />
  }

  return (
    <img
      src={currentUrl}
      alt="Ảnh đại diện Organizer"
      referrerPolicy="no-referrer"
      className="size-7 rounded-full object-cover"
      onError={() => setFailedImage({ key: sourceKey, url: currentUrl })}
    />
  )
}
