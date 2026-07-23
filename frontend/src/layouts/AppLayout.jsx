import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import {
  fetchNotifications,
  getNotificationStreamUrl,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications.js'
import { fetchAssignedStaffEvents } from '@/services/operations.js'
import { clearAuthSession, getAuthToken, getStoredUser, getUserRoles, isAuthenticated } from '@/lib/auth.js'
import { AiChatWidget } from '@/components/ai/AiChatWidget.jsx'
import { ProfileAvatar } from '@/pages/shared/ProfileAvatar.jsx'
import logoSrc from '@/assets/eventhub-logo.png'

const centerNavItems = [
  ['Sự kiện', '/events'],
  ['Vé của tôi', '/my-tickets'],
  ['Phản hồi', '/feedback'],
]

const footerSections = [
  {
    title: 'Về nền tảng chúng tôi',
    links: [
      { label: 'Chính sách hệ thống', to: '/policies?policy_type=SYSTEM_POLICY' },
      { label: 'Bảo mật thông tin cá nhân', to: '/policies?policy_type=PRIVACY_POLICY' },
      { label: 'Chính sách sử dụng AI', to: '/policies?policy_type=AI_POLICY' },
      { label: 'Khiếu nại và tranh chấp', to: '/policies?policy_type=COMPLAINT_POLICY' },
    ],
  },
  {
    title: 'Dành cho Khách hàng',
    links: [
      { label: 'Điều khoản dành cho Khách hàng', to: '/policies?policy_type=TERMS_CUSTOMER' },
      { label: 'Chính sách vé', to: '/policies?policy_type=TICKET_POLICY' },
      { label: 'Thanh toán', to: '/policies?policy_type=PAYMENT_POLICY' },
      { label: 'Bảo mật thanh toán', to: '/policies?policy_type=PAYMENT_SECURITY_POLICY' },
      { label: 'Hoàn tiền', to: '/policies?policy_type=REFUND_POLICY' },
    ],
  },
  {
    title: 'Dành cho BTC',
    links: [
      { label: 'Điều khoản dành cho Nhà tổ chức', to: '/policies?policy_type=TERMS_ORGANIZER' },
      { label: 'Chính sách sự kiện', to: '/policies?policy_type=EVENT_POLICY' },
      { label: 'Gói dịch vụ Organizer', to: '/policies?policy_type=SUBSCRIPTION_POLICY' },
      { label: 'Phí nền tảng', to: '/policies?policy_type=FEE_POLICY' },
    ],
  },
  {
    title: 'Dành cho Nhân sự',
    links: [
      { label: 'Điều khoản dành cho Nhân sự', to: '/policies?policy_type=TERMS_STAFF' },
      { label: 'Soát vé và chống vé giả', to: '/policies?policy_type=CHECKIN_POLICY' },
    ],
  },
]

const navLinkClass = ({ isActive }) =>
  `relative z-10 px-3 py-2 text-sm font-bold transition ${
    isActive ? 'text-primary' : 'text-subtle hover:text-primary'
  }`

function isStaffInvitationNotification(notification) {
  return notification.title === 'STAFF_INVITATION' || notification.title === 'Lời mời làm staff'
}

function isStaffInvitationStoreNotification(notification) {
  return notification.title === 'STAFF_INVITATION'
}

function getNotificationDisplay(notification) {
  if (!isStaffInvitationNotification(notification)) {
    return {
      title: notification.title,
      content: notification.content,
    }
  }

  return {
    title: 'Lời mời làm nhân sự',
    content: 'Bạn có lời mời làm nhân sự đang chờ phản hồi.',
  }
}

function getNotificationTarget(notification) {
  if (isStaffInvitationNotification(notification)) return '/notifications'

  const eventTarget = notification.event?.slug || notification.event_id
  return eventTarget ? `/events/${eventTarget}` : '/notifications'
}

function dedupeNavNotifications(items) {
  const visibleInviteEvents = new Set(
    items
      .filter((item) => item.title === 'Lời mời làm staff')
      .map((item) => item.event_id)
      .filter(Boolean),
  )

  return items.filter((item) => {
    if (!isStaffInvitationStoreNotification(item)) return true
    return !item.event_id || !visibleInviteEvents.has(item.event_id)
  })
}

export function AppLayout() {
  const queryClient = useQueryClient()
  const [loggedIn, setLoggedIn] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [open, setOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const navRef = useRef(null)
  const navRefs = useRef({})
  const [navIndicator, setNavIndicator] = useState({ left: 0, width: 0, visible: false })
  const activeNavPath = centerNavItems.find(([, to]) => pathname === to || pathname.startsWith(`${to}/`))?.[1]

  useEffect(() => {
    const syncAuth = () => {
      const isLoggedIn = isAuthenticated()
      const parsedUser = isLoggedIn ? getStoredUser() : null

      setLoggedIn(isLoggedIn)
      setCurrentUser(parsedUser)
    }

    syncAuth()
    window.addEventListener('storage', syncAuth)
    window.addEventListener('eventhub-auth', syncAuth)
    return () => {
      window.removeEventListener('storage', syncAuth)
      window.removeEventListener('eventhub-auth', syncAuth)
    }
  }, [])

  const logout = () => {
    clearAuthSession()
    setOpen(false)
    setNotificationOpen(false)
    navigate('/')
  }

  const currentUserRoles = getUserRoles(currentUser)
  const hasOrganizerRole = currentUserRoles.includes('organizer')
  const hasStaffRole = currentUserRoles.includes('staff')

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'nav'],
    queryFn: () => fetchNotifications({ limit: 5 }),
    enabled: loggedIn,
  })

  const staffEventsQuery = useQuery({
    queryKey: ['staff-events', 'nav'],
    queryFn: fetchAssignedStaffEvents,
    enabled: loggedIn && hasStaffRole,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  useLayoutEffect(() => {
    const updateIndicator = () => {
      const navNode = navRef.current
      const activeNode = activeNavPath ? navRefs.current[activeNavPath] : null
      if (!navNode || !activeNode) {
        setNavIndicator((current) => ({ ...current, visible: false }))
        return
      }

      const navRect = navNode.getBoundingClientRect()
      const activeRect = activeNode.getBoundingClientRect()
      const width = Math.max(activeRect.width - 24, 0)
      if (!navRect.width || !activeRect.width || !width) {
        setNavIndicator((current) => ({ ...current, visible: false }))
        return
      }

      setNavIndicator({
        left: activeRect.left - navRect.left + 12,
        width,
        visible: true,
      })
    }

    const frame = window.requestAnimationFrame(updateIndicator)
    document.fonts?.ready.then(updateIndicator).catch(() => undefined)
    window.addEventListener('resize', updateIndicator)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateIndicator)
    }
  }, [activeNavPath])

  useEffect(() => {
    if (!loggedIn) return undefined

    const token = getAuthToken()
    if (!token) return undefined

    const source = new EventSource(getNotificationStreamUrl(token))
    const refreshNotifications = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    }

    source.addEventListener('notification', refreshNotifications)
    source.addEventListener('unread_count', refreshNotifications)
    source.onerror = () => {
      source.close()
    }

    return () => source.close()
  }, [loggedIn, queryClient])

  const notifications = notificationsQuery.data?.items || []
  const navNotifications = dedupeNavNotifications(notifications).slice(0, 5)
  const unreadCount = notificationsQuery.data?.unread_count || 0
  const canOpenOrganizerPortal = hasOrganizerRole
  const canOpenStaffPortal = hasStaffRole
    && (!staffEventsQuery.isSuccess || (staffEventsQuery.data || []).length > 0)

  return (
    <div className="flex min-h-screen flex-col bg-background text-content">
      <header className="sticky top-0 z-50 border-b border-primary/15 bg-[#081126]/95 shadow-xl backdrop-blur">
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <NavLink to="/" className="flex items-center gap-3">
            <img src={logoSrc} alt="EventHub" className="h-10 w-[176px] object-cover object-center mix-blend-screen" />
          </NavLink>

          <nav ref={navRef} className="relative hidden items-center justify-center gap-1 md:flex">
            <span
              className="absolute bottom-0 h-0.5 rounded-full bg-primary transition-all duration-300 ease-out"
              style={{
                left: navIndicator.left,
                width: navIndicator.width,
                opacity: navIndicator.visible ? 1 : 0,
              }}
            />
            {centerNavItems.map(([label, to]) => (
              <NavLink
                key={to}
                to={to}
                ref={(node) => {
                  navRefs.current[to] = node
                }}
                className={navLinkClass}
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {!loggedIn ? (
            <div className="flex items-center gap-3">
              <NavLink
                className="rounded-md px-4 py-2 text-sm font-bold text-subtle hover:text-primary"
                to="/login"
              >
                Đăng nhập
              </NavLink>
              <NavLink
                className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-[#081126] hover:bg-white"
                to="/register"
              >
                Đăng ký
              </NavLink>
            </div>
          ) : (
            <div className="relative flex items-center gap-3">
              {canOpenOrganizerPortal && (
                <NavLink
                  to="/organizer"
                  className="hidden rounded-full border border-primary/40 px-4 py-2 text-sm font-extrabold text-primary transition hover:border-primary hover:bg-primary hover:text-[#081126] sm:inline-flex"
                >
                  Trang tổ chức
                </NavLink>
              )}
              {canOpenStaffPortal && (
                <NavLink
                  to="/staff"
                  className="hidden rounded-full border border-primary/40 px-4 py-2 text-sm font-extrabold text-primary transition hover:border-primary hover:bg-primary hover:text-[#081126] sm:inline-flex"
                >
                  Trang nhân sự
                </NavLink>
              )}
              <button
                type="button"
                className="relative grid size-10 place-items-center rounded-full text-subtle hover:bg-panel-soft hover:text-primary"
                onClick={() => {
                  setNotificationOpen((value) => !value)
                  setOpen(false)
                }}
                aria-label="Thông báo"
                aria-expanded={notificationOpen}
              >
                <Bell className="size-5" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-extrabold text-[#081126]">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                className="grid size-10 place-items-center overflow-hidden rounded-full border border-primary/40 bg-primary text-[#081126] transition hover:border-primary hover:bg-white"
                onClick={() => {
                  setOpen((value) => !value)
                  setNotificationOpen(false)
                }}
                aria-label="Mở menu tài khoản"
                aria-expanded={open}
              >
                <ProfileAvatar
                  sources={currentUser?.avatar_url}
                  name={currentUser?.full_name || currentUser?.email || 'Tài khoản'}
                  alt="Ảnh đại diện tài khoản"
                  className="size-full"
                  fallbackClassName="bg-transparent text-[#081126] ring-0"
                  fallback="TK"
                />
              </button>
              {notificationOpen && (
                <div className="absolute right-12 top-12 w-[360px] overflow-hidden rounded-lg border border-border-soft bg-panel shadow-2xl">
                  <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
                    <div>
                      <p className="font-display text-lg font-bold text-white">Thông báo</p>
                      <p className="text-xs text-muted">{unreadCount} chưa đọc</p>
                    </div>
                    {navNotifications.length > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllMutation.mutate()}
                        className="grid size-9 place-items-center rounded-full text-subtle hover:bg-panel-soft hover:text-primary"
                        title="Đánh dấu tất cả đã đọc"
                      >
                        <CheckCheck className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notificationsQuery.isLoading && (
                      <p className="px-4 py-5 text-sm text-muted">Đang tải thông báo...</p>
                    )}
                    {!notificationsQuery.isLoading && navNotifications.length === 0 && (
                      <p className="px-4 py-5 text-sm text-muted">Bạn chưa có thông báo nào.</p>
                    )}
                    {navNotifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => {
                          if (!notification.is_read) markReadMutation.mutate(notification.id)
                          setNotificationOpen(false)
                          navigate(getNotificationTarget(notification))
                        }}
                        className={`block w-full border-b border-border-soft px-4 py-3 text-left last:border-b-0 hover:bg-panel-soft ${
                          notification.is_read ? '' : 'bg-primary/10'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {!notification.is_read && <span className="mt-2 size-2 rounded-full bg-primary" />}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-bold text-white">{getNotificationDisplay(notification).title}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{getNotificationDisplay(notification).content}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <Link
                    to="/notifications"
                    onClick={() => setNotificationOpen(false)}
                    className="block border-t border-border-soft px-4 py-3 text-center text-sm font-bold text-primary hover:bg-panel-soft"
                  >
                    Xem tất cả
                  </Link>
                </div>
              )}
              {open && (
                <div className="absolute right-0 top-12 w-56 overflow-hidden rounded-lg border border-border-soft bg-panel shadow-2xl">
                  {canOpenOrganizerPortal && (
                    <NavLink
                      className="block px-4 py-3 text-sm font-semibold text-primary hover:bg-panel-soft hover:text-white"
                      to="/organizer"
                      onClick={() => setOpen(false)}
                    >
                      Quay lại trang tổ chức
                    </NavLink>
                  )}
                  {canOpenStaffPortal && (
                    <NavLink
                      className="block px-4 py-3 text-sm font-semibold text-primary hover:bg-panel-soft hover:text-white"
                      to="/staff"
                      onClick={() => setOpen(false)}
                    >
                      Quay lại trang nhân sự
                    </NavLink>
                  )}
                  <NavLink
                    className="block px-4 py-3 text-sm font-semibold text-subtle hover:bg-panel-soft hover:text-primary"
                    to="/profile"
                    onClick={() => setOpen(false)}
                  >
                    Hồ sơ cá nhân
                  </NavLink>
                  <NavLink
                    className="block px-4 py-3 text-sm font-semibold text-subtle hover:bg-panel-soft hover:text-primary"
                    to="/my-tickets"
                    onClick={() => setOpen(false)}
                  >
                    Vé của tôi
                  </NavLink>
                  <NavLink
                    className="block px-4 py-3 text-sm font-semibold text-subtle hover:bg-panel-soft hover:text-primary"
                    to="/favorites"
                    onClick={() => setOpen(false)}
                  >
                    Sự kiện yêu thích
                  </NavLink>
                  {!canOpenOrganizerPortal && (
                    <NavLink
                      className="block px-4 py-3 text-sm font-semibold text-subtle hover:bg-panel-soft hover:text-primary"
                      to="/organizer-request"
                      onClick={() => setOpen(false)}
                    >
                      Đăng kí làm organizer
                    </NavLink>
                  )}
                  <button
                    className="block w-full px-4 py-3 text-left text-sm font-semibold text-error hover:bg-error/10"
                    onClick={logout}
                  >
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
      {loggedIn && <AiChatWidget enabled={loggedIn} />}
      <footer className="border-t border-primary/15 bg-[#081126]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_2fr] lg:px-8">
          <div>
            <img src={logoSrc} alt="EventHub" className="h-12 w-[212px] object-cover object-center mix-blend-screen" />
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
              Nền tảng khám phá sự kiện, đặt vé, quản lý vận hành và soát vé bằng mã QR
              và hỗ trợ ban tổ chức bằng AI.
            </p>
            <p className="mt-5 text-xs text-neutral">
              © 2026 EventHub. Bảo lưu mọi quyền.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {footerSections.map(({ title, links }) => (
              <div key={title} className="space-y-3">
                <h3 className="text-sm font-bold text-white">{title}</h3>
                {links.map((link) => (
                  <Link
                    key={link.label}
                    to={link.to}
                    className="block text-sm text-muted transition hover:text-primary"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
