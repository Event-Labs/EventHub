import { BriefcaseBusiness, Calendar, ClipboardList, CreditCard, LayoutDashboard, ShieldCheck, Tags, Users } from 'lucide-react'
import { getStoredUser, isAdminUser } from '@/lib/auth.js'
import { ProfileAvatar } from '@/pages/shared/ProfileAvatar.jsx'
import { RolePortalLayout } from '@/pages/shared/RolePortalLayout.jsx'

const navSections = [
  {
    label: 'Tổng quan',
    items: [{ label: 'Bảng điều khiển', to: '/admin', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Quản lý người dùng',
    items: [
      { label: 'Người dùng', to: '/admin/accounts', icon: Users },
      { label: 'Yêu cầu Organizer', to: '/admin/organizer-requests', icon: ClipboardList },
    ],
  },
  {
    label: 'Sự kiện & Nội dung',
    items: [
      { label: 'Loại sự kiện', to: '/admin/events/categories', icon: Tags },
      { label: 'Duyệt sự kiện', to: '/admin/events/review', icon: Calendar },
    ],
  },
  {
    label: 'Tài chính & Gói dịch vụ',
    items: [
      { label: 'Tài chính', to: '/admin/platform-fee', icon: CreditCard },
      { label: 'Gói dịch vụ', to: '/admin/plans', icon: BriefcaseBusiness },
    ],
  },
]

const bottomItems = [{ label: 'Hồ sơ', to: '/admin/profile', icon: ShieldCheck }]

export function AdminLayout() {
  const user = parseStoredUser()

  return (
    <RolePortalLayout
      user={user}
      isAllowed={isAdminUser(user)}
      portalLabel="Admin Portal"
      roleLabel="Quản trị viên"
      profileTo="/admin/profile"
      navSections={navSections}
      bottomItems={bottomItems}
      avatar={
        <ProfileAvatar
          sources={user?.avatar_url}
          name={user?.full_name || user?.email || 'Admin'}
          alt="Ảnh đại diện quản trị viên"
          className="size-7"
          fallback="AD"
        />
      }
    />
  )
}

function parseStoredUser() {
  return getStoredUser()
}
