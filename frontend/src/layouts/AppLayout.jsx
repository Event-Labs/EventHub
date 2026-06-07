import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, UserCircle } from 'lucide-react'
import {
  fetchNotifications,
  getNotificationStreamUrl,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications.js'

const centerNavItems = [
  ['Sự kiện', '/events'],
  ['Vé của tôi', '/my-tickets'],
  ['Phản hồi', '/feedback'],
]

const navLinkClass = ({ isActive }) =>
  `relative z-10 px-3 py-2 text-sm font-bold transition ${
    isActive ? 'text-primary' : 'text-subtle hover:text-primary'
  }`

export function AppLayout() {
  const queryClient = useQueryClient()
  const [loggedIn, setLoggedIn] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [open, setOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const navRefs = useRef({})
  const [navIndicator, setNavIndicator] = useState({ left: 0, width: 0, visible: false })
  const activeNavPath = centerNavItems.find(([, to]) => pathname === to || pathname.startsWith(`${to}/`))?.[1]

  useEffect(() => {
    const syncAuth = () => {
      const isLoggedIn =
        Boolean(localStorage.getItem('eventhub-token')) ||
        localStorage.getItem('eventhub-auth') === 'true'
      const storedUser = localStorage.getItem('eventhub-user')
      let parsedUser = null

      if (isLoggedIn && storedUser) {
        try {
          parsedUser = JSON.parse(storedUser)
        } catch {
          parsedUser = null
        }
      }

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
    localStorage.removeItem('eventhub-auth')
    localStorage.removeItem('eventhub-token')
    localStorage.removeItem('eventhub-user')
    window.dispatchEvent(new Event('eventhub-auth'))
    setOpen(false)
    setNotificationOpen(false)
    navigate('/')
  }

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'nav'],
    queryFn: () => fetchNotifications({ limit: 5 }),
    enabled: loggedIn,
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
      const activeNode = activeNavPath ? navRefs.current[activeNavPath] : null
      if (!activeNode) {
        setNavIndicator((current) => ({ ...current, visible: false }))
        return
      }

      setNavIndicator({
        left: activeNode.offsetLeft + 12,
        width: Math.max(activeNode.offsetWidth - 24, 0),
        visible: true,
      })
    }

    updateIndicator()
    window.addEventListener('resize', updateIndicator)
    return () => window.removeEventListener('resize', updateIndicator)
  }, [activeNavPath])

  useEffect(() => {
    if (!loggedIn) return undefined

    const token = localStorage.getItem('eventhub-token')
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
  const unreadCount = notificationsQuery.data?.unread_count || 0

  return (
    <div className="flex min-h-screen flex-col bg-background text-content">
      <header className="sticky top-0 z-50 border-b border-border-soft bg-[#0d1422]/95 shadow-xl backdrop-blur">
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <NavLink to="/" className="flex items-center gap-3">
            <span className="font-display text-xl font-extrabold text-primary">
              EventHub
            </span>
          </NavLink>

          <nav className="relative hidden items-center justify-center gap-1 md:flex">
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
                className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-slate-950 hover:bg-sky-300"
                to="/register"
              >
                Đăng ký
              </NavLink>
            </div>
          ) : (
            <div className="relative flex items-center gap-3">
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
                  <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-extrabold text-slate-950">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                className="grid size-10 place-items-center overflow-hidden rounded-full border border-primary/40 bg-primary text-slate-950 transition hover:border-primary hover:bg-sky-300"
                onClick={() => {
                  setOpen((value) => !value)
                  setNotificationOpen(false)
                }}
                aria-label="Mở menu tài khoản"
                aria-expanded={open}
              >
                {currentUser?.avatar_url ? (
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.full_name || 'Tài khoản'}
                    className="size-full rounded-full object-cover"
                  />
                ) : (
                  <UserCircle className="size-7" />
                )}
              </button>
              {notificationOpen && (
                <div className="absolute right-12 top-12 w-[360px] overflow-hidden rounded-lg border border-border-soft bg-panel shadow-2xl">
                  <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
                    <div>
                      <p className="font-display text-lg font-bold text-white">Thông báo</p>
                      <p className="text-xs text-muted">{unreadCount} chưa đọc</p>
                    </div>
                    {notifications.length > 0 && (
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
                    {!notificationsQuery.isLoading && notifications.length === 0 && (
                      <p className="px-4 py-5 text-sm text-muted">Bạn chưa có thông báo nào.</p>
                    )}
                    {notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => {
                          if (!notification.is_read) markReadMutation.mutate(notification.id)
                          const eventTarget = notification.event?.slug || notification.event_id
                          setNotificationOpen(false)
                          if (eventTarget) navigate(`/events/${eventTarget}`)
                        }}
                        className={`block w-full border-b border-border-soft px-4 py-3 text-left last:border-b-0 hover:bg-panel-soft ${
                          notification.is_read ? '' : 'bg-primary/10'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {!notification.is_read && <span className="mt-2 size-2 rounded-full bg-primary" />}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-bold text-white">{notification.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{notification.content}</p>
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
                  <NavLink
                    className="block px-4 py-3 text-sm font-semibold text-subtle hover:bg-panel-soft hover:text-primary"
                    to="/organizer-request"
                    onClick={() => setOpen(false)}
                  >
                    Đăng kí làm organizer
                  </NavLink>
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
      <footer className="border-t border-border-soft bg-[#0d1422]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_2fr] lg:px-8">
          <div>
            <div className="font-display text-2xl font-extrabold text-primary">
              EventHub
            </div>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
              Nền tảng khám phá sự kiện, đặt vé, quản lý vận hành, check-in QR
              và hỗ trợ ban tổ chức bằng AI.
            </p>
            <p className="mt-5 text-xs text-neutral">
              © 2026 EventHub. All rights reserved.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            {[
              ['EventHub', 'Về EventHub', 'Liên hệ', 'Chính sách hoàn vé'],
              [
                'Hỗ trợ',
                'Trung tâm trợ giúp',
                'Hướng dẫn ban tổ chức',
                'AI FAQ',
              ],
              ['Pháp lý', 'Điều khoản', 'Bảo mật', 'Phí nền tảng'],
            ].map(([title, ...links]) => (
              <div key={title} className="space-y-3">
                <h3 className="text-sm font-bold text-white">{title}</h3>
                {links.map((link, index) =>
                  title === 'EventHub' && index === 2 ? (
                    <Link
                      key={link}
                      to="/policies"
                      className="block text-sm text-muted transition hover:text-primary"
                    >
                      {link}
                    </Link>
                  ) : (
                    <a
                      key={link}
                      href="#"
                      className="block text-sm text-muted transition hover:text-primary"
                    >
                      {link}
                    </a>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
