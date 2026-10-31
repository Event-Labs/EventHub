import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, NavLink, Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Compass, Heart, Home, Ticket, User } from 'lucide-react'
import {
  fetchNotifications,
  getNotificationStreamUrl,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications.js'
import { fetchAssignedStaffEvents } from '@/services/operations.js'
import { clearAuthSession, getAuthToken, getStoredUser, getStoredUserKey, getUserRoles, isAdminUser, isAuthenticated, updateStoredUser } from '@/lib/auth.js'
import { formatNotificationDisplay } from '@/lib/notifications.js'
import { ProfileAvatar } from '@/pages/shared/ProfileAvatar.jsx'
import { CustomerAiAssistantWidget } from '@/components/ai/CustomerAiAssistantWidget.jsx'
import { ActiveHoldFloatingBar } from '@/components/ActiveHoldFloatingBar.jsx'
import { CosmicStarryBackground } from '@/components/CosmicStarryBackground.jsx'
import logoSrc from '@/assets/eventhub-logo.png'

const centerNavItems = [
  ['Khám phá sự kiện', '/events', false],
  ['Sự kiện yêu thích', '/favorites', true],
  ['Vé của tôi', '/my-tickets', true],
  ['Phản hồi', '/feedback', true],
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
  `relative z-10 px-3 py-2 text-sm font-bold transition ${isActive ? 'text-[#E6C17A]' : 'text-subtle hover:text-[#E6C17A]'
  }`

function isStaffInvitationNotification(notification) {
  return notification.title === 'STAFF_INVITATION' || notification.title === 'Lời mời làm staff'
}

function isStaffInvitationStoreNotification(notification) {
  return notification.title === 'STAFF_INVITATION'
}

function getNotificationDisplay(notification) {
  return formatNotificationDisplay(notification)
}

function getNotificationTarget(notification) {
  if (isStaffInvitationNotification(notification)) return '/notifications'

  const title = (notification.title || '').toLowerCase()
  const content = (notification.content || '').toLowerCase()
  if (title.includes('organizer') || content.includes('organizer')) {
    if (title.includes('đã được duyệt') || content.includes('phê duyệt thành công')) {
      return '/organizer'
    }
    return '/organizer-request?mode=edit'
  }

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
  const [loggedIn, setLoggedIn] = useState(() => isAuthenticated())
  const [currentUser, setCurrentUser] = useState(() => (isAuthenticated() ? getStoredUser() : null))
  const [open, setOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const navRef = useRef(null)
  const navRefs = useRef({})
  const userActionsRef = useRef(null)
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

  useEffect(() => {
    document.documentElement.classList.remove('light')
  }, [pathname])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userActionsRef.current && !userActionsRef.current.contains(event.target)) {
        setOpen(false)
        setNotificationOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const logout = () => {
    clearAuthSession()
    setOpen(false)
    setNotificationOpen(false)
    navigate('/')
  }

  const currentUserRoles = getUserRoles(currentUser)
  const hasAdminRole = isAdminUser(currentUser)
  const hasOrganizerRole = currentUserRoles.includes('organizer')
  const hasStaffRole = currentUserRoles.includes('staff')

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'nav'],
    queryFn: () => fetchNotifications({ limit: 5 }),
    enabled: loggedIn && !hasAdminRole,
  })

  const staffEventsQuery = useQuery({
    queryKey: ['staff-events', 'nav'],
    queryFn: fetchAssignedStaffEvents,
    enabled: loggedIn && hasStaffRole && !hasAdminRole,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (staffEventsQuery.isSuccess && Array.isArray(staffEventsQuery.data) && staffEventsQuery.data.length === 0 && hasStaffRole) {
      const nextRoles = currentUserRoles.filter((r) => r !== 'staff')
      if (nextRoles.length === 0) nextRoles.push('customer')
      updateStoredUser({ roles: nextRoles })
    }
  }, [staffEventsQuery.isSuccess, staffEventsQuery.data, hasStaffRole, currentUserRoles])

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

  useEffect(() => {
    const handleMouseMove = (e) => {
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  if (loggedIn && hasAdminRole) {
    return <Navigate to="/admin" replace />
  }

  return (
    <div className="force-dark flex min-h-screen flex-col text-content bg-transparent relative">
      <CosmicStarryBackground />
      <div className="pointer-events-none fixed inset-0 z-50 transition-opacity duration-300 mouse-glow-overlay" />
      <header className="force-dark fixed top-2 sm:top-4 left-0 right-0 z-50 mx-auto w-[94%] sm:w-[96%] max-w-7xl rounded-full border border-border-soft bg-panel/70 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] backdrop-blur-xl transition-all duration-300">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-3 px-3 sm:px-6 lg:px-8">
          <NavLink to="/" className="flex items-center shrink-0 gap-2 sm:gap-3">
            <img
              src={logoSrc}
              alt="EventHub"
              className="h-8 sm:h-12 w-auto object-contain mix-blend-screen transition-opacity hover:opacity-80"
            />
          </NavLink>

          <nav ref={navRef} className="relative hidden items-center justify-center gap-1 md:flex flex-1">
            <span
              className="absolute bottom-0 h-0.5 rounded-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] shadow-[0_0_10px_rgba(201,154,71,0.6)] transition-all duration-300 ease-out"
              style={{
                left: navIndicator.left,
                width: navIndicator.width,
                opacity: navIndicator.visible ? 1 : 0,
              }}
            />
            {centerNavItems.map(([label, to, requiresAuth]) => {
              if (requiresAuth && !loggedIn) return null;
              if (requiresAuth && hasAdminRole) return null;
              return (
                <NavLink
                  key={label}
                  to={to}
                  ref={(el) => (navRefs.current[to] = el)}
                  className={navLinkClass}
                >
                  {label}
                </NavLink>
              )
            })}
          </nav>

          {!loggedIn ? (
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <NavLink
                to="/login"
                className="rounded-full border border-[#C99A47]/50 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-extrabold text-[#E6C17A] transition hover:border-[#E6C17A] hover:bg-[#C99A47] hover:text-[#0D1B2A] active:scale-95"
              >
                Đăng nhập
              </NavLink>
              <NavLink
                to="/register"
                className="btn-led-border active:scale-95 text-xs sm:text-sm"
              >
                <span className="btn-led-inner !px-3 sm:!px-5 !py-1.5 sm:!py-2 !text-xs sm:!text-sm">
                  Đăng ký
                </span>
              </NavLink>
            </div>
          ) : (
            <div ref={userActionsRef} className="relative flex items-center justify-end gap-2 sm:gap-3 shrink-0">
              {hasAdminRole && (
                <NavLink
                  to="/admin"
                  reloadDocument
                  className="hidden rounded-full border border-[#C99A47]/40 px-4 py-2 text-sm font-extrabold text-[#E6C17A] transition hover:border-[#E6C17A] hover:bg-[#C99A47] hover:text-[#081126] sm:inline-flex"
                >
                  Trang quản trị
                </NavLink>
              )}
              {canOpenOrganizerPortal && (
                <NavLink
                  to="/organizer"
                  className="hidden rounded-full border border-[#C99A47]/40 px-4 py-2 text-sm font-extrabold text-[#E6C17A] transition hover:border-[#E6C17A] hover:bg-[#C99A47] hover:text-[#081126] sm:inline-flex"
                >
                  Trang tổ chức
                </NavLink>
              )}
              {canOpenStaffPortal && (
                <NavLink
                  to="/staff"
                  className="hidden rounded-full border border-[#C99A47]/40 px-4 py-2 text-sm font-extrabold text-[#E6C17A] transition hover:border-[#E6C17A] hover:bg-[#C99A47] hover:text-[#081126] sm:inline-flex"
                >
                  Trang nhân sự
                </NavLink>
              )}
              <button
                type="button"
                className="relative grid size-10 place-items-center rounded-full text-subtle hover:bg-panel-soft hover:text-[#E6C17A]"
                onClick={() => {
                  setNotificationOpen((value) => !value)
                  setOpen(false)
                }}
                aria-label="Thông báo"
                aria-expanded={notificationOpen}
              >
                <Bell className="size-5" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-1 text-[10px] font-extrabold text-[#081126] shadow-sm">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                className="grid size-10 place-items-center overflow-hidden rounded-full border border-[#C99A47]/40 bg-[#C99A47] text-[#081126] transition hover:border-[#E6C17A] hover:bg-white"
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
                <div className="fixed sm:absolute inset-x-3 sm:inset-x-auto sm:right-12 top-20 sm:top-full mt-0 sm:mt-4 w-auto sm:w-[360px] overflow-hidden rounded-2xl border border-border-soft bg-slate-950 shadow-2xl z-50">
                  <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
                    <div>
                      <p className="font-display text-lg font-bold text-white">Thông báo</p>
                      <p className="text-xs text-muted">{unreadCount} chưa đọc</p>
                    </div>
                    {navNotifications.length > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllMutation.mutate()}
                        className="grid size-9 place-items-center rounded-full text-subtle hover:bg-panel-soft hover:text-[#E6C17A]"
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
                        className={`block w-full border-b border-border-soft px-4 py-3 text-left last:border-b-0 hover:bg-panel-soft ${notification.is_read ? '' : 'bg-[#C99A47]/10'
                          }`}
                      >
                        <div className="flex items-start gap-3">
                          {!notification.is_read && <span className="mt-2 size-2 rounded-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A]" />}
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
                    className="block border-t border-border-soft px-4 py-3 text-center text-sm font-bold text-[#E6C17A] hover:bg-panel-soft"
                  >
                    Xem tất cả
                  </Link>
                </div>
              )}
              {open && (
                <div className="absolute right-0 top-full mt-3 sm:mt-4 w-56 sm:w-64 overflow-hidden rounded-2xl border border-border-soft bg-slate-950 shadow-2xl z-50">
                  <div className="py-1">
                    <NavLink
                      className="block px-4 py-2 text-sm font-semibold text-subtle hover:bg-panel-soft hover:text-[#E6C17A]"
                      to={hasAdminRole ? "/admin/profile" : "/profile"}
                      onClick={() => setOpen(false)}
                    >
                      Hồ sơ cá nhân
                    </NavLink>
                  </div>

                  <div className="border-t border-border-soft py-1">
                    {!canOpenOrganizerPortal && !hasAdminRole && (
                      <NavLink
                        className="block px-4 py-2 text-sm font-semibold text-subtle hover:bg-panel-soft hover:text-[#E6C17A]"
                        to="/organizer-request"
                        onClick={() => setOpen(false)}
                      >
                        Đăng ký làm Ban Tổ Chức
                      </NavLink>
                    )}
                  </div>

                  <div className="border-t border-border-soft py-1">
                    <button
                      className="block w-full px-4 py-2 text-left text-sm font-semibold text-error hover:bg-error/10"
                      onClick={logout}
                    >
                      Đăng xuất
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main
        className={`flex-1 ${
          pathname.startsWith('/booking')
            ? 'pb-24 lg:pb-0'
            : 'pb-20 md:pb-0'
        } ${
          pathname === '/' || /^\/events\/[^/]+$/.test(pathname)
            ? ''
            : 'pt-20 sm:pt-24 lg:pt-28'
        }`}
      >
        <Outlet />
      </main>
      <footer
        className={`relative border-t border-border-soft bg-panel-soft/30 backdrop-blur-md pb-16 md:pb-0 ${
          pathname.startsWith('/booking') ||
          pathname === '/profile' ||
          pathname === '/my-tickets' ||
          pathname === '/favorites' ||
          pathname === '/feedback'
            ? 'hidden md:block'
            : ''
        }`}
      >
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--color-primary)_0%,_transparent_70%)] opacity-[0.03]" />
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_2fr] lg:px-8">
          <div>
            <img
              src={logoSrc}
              alt="EventHub"
              className="h-14 sm:h-16 w-auto object-contain mix-blend-screen"
            />
            <p className="mt-4 max-w-sm text-sm leading-6 text-subtle">
              Nền tảng khám phá sự kiện, đặt vé, quản lý vận hành và soát vé bằng mã QR
              và hỗ trợ ban tổ chức bằng AI.
            </p>
            <p className="mt-6 text-xs text-neutral">
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
      <ActiveHoldFloatingBar />
      <CustomerAiAssistantWidget key={getStoredUserKey(currentUser) || 'guest'} enabled={loggedIn && !hasAdminRole} />

      {/* ── Mobile Customer Bottom Navigation Bar ── */}
      {!pathname.startsWith('/booking') && (
        <nav className="fixed bottom-0 inset-x-0 z-40 flex h-16 items-center justify-around border-t border-white/10 bg-[#081126]/95 backdrop-blur-xl md:hidden pb-[env(safe-area-inset-bottom)] text-white shadow-[0_-4px_20px_rgba(0,0,0,0.6)]">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center py-1 transition-all ${
                isActive ? 'text-[#E6C17A] font-black' : 'text-slate-400 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Home className={`size-5 transition-transform ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(230,193,122,0.6)] text-[#E6C17A]' : ''}`} />
                <span className="text-[10px] mt-1 font-semibold leading-none">Trang chủ</span>
              </>
            )}
          </NavLink>

          <NavLink
            to="/events"
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center py-1 transition-all ${
                isActive ? 'text-[#E6C17A] font-black' : 'text-slate-400 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Compass className={`size-5 transition-transform ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(230,193,122,0.6)] text-[#E6C17A]' : ''}`} />
                <span className="text-[10px] mt-1 font-semibold leading-none">Khám phá</span>
              </>
            )}
          </NavLink>

          <NavLink
            to="/my-tickets"
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center py-1 transition-all ${
                isActive ? 'text-[#E6C17A] font-black' : 'text-slate-400 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Ticket className={`size-5 transition-transform ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(230,193,122,0.6)] text-[#E6C17A]' : ''}`} />
                <span className="text-[10px] mt-1 font-semibold leading-none">Vé của tôi</span>
              </>
            )}
          </NavLink>

          <NavLink
            to="/favorites"
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center py-1 transition-all ${
                isActive ? 'text-[#E6C17A] font-black' : 'text-slate-400 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Heart className={`size-5 transition-transform ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(230,193,122,0.6)] text-[#E6C17A]' : ''}`} />
                <span className="text-[10px] mt-1 font-semibold leading-none">Yêu thích</span>
              </>
            )}
          </NavLink>

          <NavLink
            to={loggedIn ? (hasAdminRole ? '/admin' : '/profile') : '/login'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center py-1 transition-all ${
                isActive ? 'text-[#E6C17A] font-black' : 'text-slate-400 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <User className={`size-5 transition-transform ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(230,193,122,0.6)] text-[#E6C17A]' : ''}`} />
                <span className="text-[10px] mt-1 font-semibold leading-none">{loggedIn ? 'Tôi' : 'Tài khoản'}</span>
              </>
            )}
          </NavLink>
        </nav>
      )}
    </div>
  )
}
