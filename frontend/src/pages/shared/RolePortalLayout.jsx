import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, ChevronRight, LogOut, Moon, Search, Settings, Sun, X } from 'lucide-react'
import { clearAuthSession, getAuthToken } from '@/lib/auth.js'
import {
  fetchNotifications,
  getNotificationStreamUrl,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications.js'
import logoSrc from '@/assets/eventhub-logo.png'

const collapsedWidth = 76
const expandedWidth = 232
const defaultTheme = 'dark'

function getPortalThemeKey(user) {
  const accountKey = user?.id || user?.user_id || user?._id || user?.email || 'anonymous'
  return `eventhub-theme:${String(accountKey).toLowerCase()}`
}

function getStoredPortalTheme(themeKey) {
  return localStorage.getItem(themeKey) || defaultTheme
}

function applyPortalTheme(theme) {
  document.documentElement.classList.toggle('light', theme === 'light')
}

export function RolePortalLayout({
  user,
  isAllowed,
  loginRedirect = '/login',
  roleLabel,
  profileTo,
  navSections,
  bottomItems = [],
  avatar,
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const themeKey = useMemo(() => getPortalThemeKey(user), [user])
  const [theme, setTheme] = useState(() => getStoredPortalTheme(getPortalThemeKey(user)))
  const token = getAuthToken()

  useEffect(() => {
    applyPortalTheme(theme)
    return () => document.documentElement.classList.remove('light')
  }, [theme])

  const setPortalTheme = (newTheme) => {
    setTheme(newTheme)
    localStorage.setItem(themeKey, newTheme)
  }

  const logout = () => {
    clearAuthSession()
    navigate('/login', { replace: true })
  }

  if (!token) {
    return (
      <Navigate
        to={`${loginRedirect}?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    )
  }

  if (!isAllowed) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-screen bg-background text-content">
      <aside
        className={`fixed bottom-0 left-0 top-24 z-50 flex flex-col items-center gap-3 bg-transparent px-2 pb-4 transition-[width] duration-300 ease-out will-change-[width] ${
          sidebarExpanded ? 'w-[232px]' : 'w-20'
        }`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <nav
          className={`relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-border-soft/30 bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.15)] backdrop-blur-sm transition-[width] duration-300 ease-out will-change-[width] ${
            sidebarExpanded ? 'w-full' : 'w-12'
          }`}
        >
          <div
            className={`portal-sidebar-scroll flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden py-3 ${
              sidebarExpanded ? 'px-2' : 'portal-sidebar-scroll-collapsed items-center px-1'
            }`}
          >
            {navSections.map((section, sectionIndex) => (
              <SidebarSection
                key={section.label}
                section={section}
                expanded={sidebarExpanded}
                showDivider={sectionIndex > 0}
                pathname={location.pathname}
              />
            ))}
          </div>
        </nav>

        <div
          className={`flex shrink-0 flex-col items-center gap-1 overflow-hidden rounded-[2rem] border border-border-soft/30 bg-surface py-3 shadow-[0_4px_20px_rgba(0,0,0,0.15)] backdrop-blur-sm transition-[width,padding] duration-300 ease-out will-change-[width] ${
            sidebarExpanded ? 'w-full px-2' : 'w-12 items-center px-1'
          }`}
        >
          {bottomItems.map((item) => <SidebarItem key={item.label} item={item} expanded={sidebarExpanded} />)}
          {sidebarExpanded ? (
            <button
              type="button"
              onClick={logout}
              title={'\u0110\u0103ng xu\u1ea5t'}
              className="group flex h-10 w-full items-center justify-start gap-3 overflow-hidden rounded-lg px-3 text-sm font-semibold text-subtle transition-all duration-200 hover:bg-panel-soft hover:text-error"
            >
              <LogOut className="size-[18px] shrink-0" />
              <span className="portal-sidebar-label min-w-0">{'\u0110\u0103ng xu\u1ea5t'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={logout}
              title={'\u0110\u0103ng xu\u1ea5t'}
              className="grid size-10 place-items-center rounded-2xl text-subtle transition-all duration-200 hover:bg-panel-soft hover:text-error"
            >
              <LogOut className="size-[18px]" />
            </button>
          )}
        </div>
      </aside>

      <main
        className="flex flex-1 flex-col transition-[padding-left] duration-300 ease-out"
        style={{ paddingLeft: sidebarExpanded ? expandedWidth : collapsedWidth }}
      >
        <PortalTopBar
          user={user}
          avatar={avatar}
          roleLabel={roleLabel}
          profileTo={profileTo}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
          theme={theme}
          onToggleTheme={() => setPortalTheme(theme === 'light' ? 'dark' : 'light')}
        />
        <div className="flex-1 overflow-y-auto pt-20">
          <div className="mx-auto max-w-[1320px] px-6 py-6 lg:px-8">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}

function SidebarSection({ section, expanded, showDivider, pathname }) {
  const Icon = getSectionIcon(section)
  const items = section.group ? section.children : section.items

  if (!expanded) {
    return (
      <div className="flex w-full flex-col items-center gap-1">
        {showDivider && <div className="my-1 h-px w-8 bg-border-soft/30" />}
        {items.map((item) => (
          <SidebarItem
            key={item.to || item.label}
            item={item}
            expanded={false}
            active={isItemActive(item, pathname)}
            fallbackIcon={Icon}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="w-full">
      {showDivider && <div className="mx-3 my-2 h-px bg-border-soft/30" />}
      <p className="portal-sidebar-label px-3 pb-1 pt-1 text-[11px] font-extrabold uppercase tracking-wider text-muted/80">
        {section.label}
      </p>
      <div className="space-y-1">
        {items.map((item) => (
          <SidebarItem key={item.to || item.label} item={item} expanded={expanded} active={isItemActive(item, pathname)} />
        ))}
      </div>
    </div>
  )
}

function SidebarItem({ item, expanded, active, fallbackIcon }) {
  const Icon = item.icon || fallbackIcon

  if (!expanded) {
    return (
      <NavLink
        to={item.to}
        end={item.end}
        title={item.label}
        className={({ isActive }) => {
          const current = active ?? isActive
          return `grid size-10 place-items-center rounded-2xl transition-all duration-200 ${
            current
              ? 'bg-tertiary/15 text-tertiary shadow-[inset_0_1px_0_rgba(249,115,22,0.14)]'
              : 'text-subtle hover:bg-panel-soft hover:text-tertiary'
          }`
        }}
      >
        {({ isActive }) => {
          const current = active ?? isActive
          return Icon ? <Icon className={`size-[18px] ${current ? 'text-tertiary' : 'text-subtle'}`} /> : null
        }}
      </NavLink>
    )
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={item.label}
      className={({ isActive }) => {
        const current = active ?? isActive
        return `group flex h-10 w-full items-center gap-3 overflow-hidden rounded-lg px-3 text-sm font-semibold transition-all duration-200 ${
          current
            ? 'bg-tertiary/15 text-tertiary shadow-[inset_0_1px_0_rgba(249,115,22,0.14)]'
            : 'text-subtle hover:bg-panel-soft hover:text-tertiary'
        }`
      }}
    >
      {({ isActive }) => {
        const current = active ?? isActive
        return (
          <>
            {Icon && <Icon className={`size-[18px] shrink-0 ${current ? 'text-tertiary' : 'text-subtle group-hover:text-tertiary'}`} />}
            <span className="portal-sidebar-label min-w-0 flex-1">{item.label}</span>
            {current && <ChevronRight className="size-3.5 shrink-0 text-tertiary" />}
          </>
        )
      }}
    </NavLink>
  )
}

function PortalTopBar({ user, avatar, roleLabel, profileTo, searchOpen, setSearchOpen, theme, onToggleTheme }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-4 border-b border-border-soft/20 bg-background/90 px-6 py-4 shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-md">
      <div className="flex min-w-0 flex-1 items-center gap-5">
        <img
          src={logoSrc}
          alt="EventHub"
          className="logo-fixed h-10 w-[176px] shrink-0 object-cover object-center"
          style={{ filter: 'none' }}
        />
        <div className="min-w-0 flex-1">
        {searchOpen ? (
          <div className="flex h-12 w-full max-w-2xl items-center gap-2 rounded-full border border-border-soft/30 bg-surface px-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)] backdrop-blur-sm">
            <Search className="size-5 shrink-0 text-subtle" />
            <input autoFocus className="w-full bg-transparent text-base text-content outline-none placeholder:text-subtle" placeholder={'\u0054\u00ecm ki\u1ebfm...'} />
            <button type="button" onClick={() => setSearchOpen(false)} className="grid size-7 place-items-center rounded-full text-subtle hover:bg-panel-soft hover:text-content">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-12 w-full max-w-2xl items-center gap-3 rounded-full border border-border-soft/30 bg-surface px-5 text-base text-subtle shadow-[0_4px_20px_rgba(0,0,0,0.15)] backdrop-blur-sm transition hover:border-tertiary hover:text-content"
          >
            <Search className="size-5" />
            <span>{'\u0054\u00ecm ki\u1ebfm...'}</span>
          </button>
        )}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <div className="flex h-12 items-center gap-1 rounded-full border border-border-soft/30 bg-surface px-2 shadow-[0_4px_20px_rgba(0,0,0,0.15)] backdrop-blur-sm">
          <TopBarIconButton icon={theme === 'light' ? Sun : Moon} label={theme === 'light' ? '\u0043h\u1ebf \u0111\u1ed9 s\u00e1ng' : '\u0043h\u1ebf \u0111\u1ed9 t\u1ed1i'} onClick={onToggleTheme} />
          <PortalNotificationBell />
          <TopBarIconButton icon={Settings} label={'\u0043\u00e0i \u0111\u1eb7t'} />
        </div>
        <NavLink
          to={profileTo}
          className="flex h-12 items-center gap-2.5 rounded-full border border-border-soft/30 bg-surface px-3 shadow-[0_4px_20px_rgba(0,0,0,0.15)] backdrop-blur-sm transition hover:border-tertiary hover:bg-panel-soft"
          title={'\u0048\u1ed3 s\u01a1'}
        >
          {avatar}
          <div className="hidden text-left sm:block">
            <p className="text-xs font-bold leading-tight text-content">{user?.full_name?.split(' ').slice(-1)[0] || roleLabel}</p>
            <p className="text-[10px] leading-tight text-muted">{roleLabel}</p>
          </div>
          <ChevronRight className="size-3 text-subtle" />
        </NavLink>
      </div>
    </header>
  )
}

function PortalNotificationBell() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [notificationOpen, setNotificationOpen] = useState(false)
  const token = getAuthToken()

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'portal-nav'],
    queryFn: () => fetchNotifications({ limit: 5 }),
    enabled: Boolean(token),
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

  useEffect(() => {
    if (!token) return undefined

    const source = new EventSource(getNotificationStreamUrl(token))
    const handleNotification = (event) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })

      try {
        const data = JSON.parse(event.data)
        if (data?.title) {
          window.dispatchEvent(
            new CustomEvent('eventhub:toast', {
              detail: {
                message: `🔔 ${data.title}`,
                type: data.title.includes('từ chối') ? 'error' : 'success',
                duration: 6000,
              },
            }),
          )
        }
      } catch {
        // ignore JSON parse error
      }
    }

    const refreshCount = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    }

    source.addEventListener('notification', handleNotification)
    source.addEventListener('unread_count', refreshCount)
    source.onerror = () => {
      source.close()
    }

    return () => source.close()
  }, [token, queryClient])

  const notifications = notificationsQuery.data?.items || []
  const unreadCount = notificationsQuery.data?.unread_count || 0

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markReadMutation.mutate(notification.id)
    }
    setNotificationOpen(false)

    const isOrganizerPortal = location.pathname.startsWith('/organizer')
    if (notification.event_id && isOrganizerPortal) {
      navigate(`/organizer/events/${notification.event_id}`)
      return
    }
    if (notification.event?.slug) {
      navigate(`/events/${notification.event.slug}`)
      return
    }
    navigate('/notifications')
  }

  return (
    <div className="relative">
      <button
        type="button"
        title="Thông báo"
        onClick={() => setNotificationOpen((prev) => !prev)}
        className="relative grid size-9 place-items-center rounded-full text-subtle transition hover:bg-panel-soft hover:text-content"
        aria-label="Thông báo"
        aria-expanded={notificationOpen}
      >
        <Bell className="size-[16px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-tertiary px-1 text-[9px] font-extrabold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {notificationOpen && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-border-soft/40 bg-surface shadow-2xl backdrop-blur-md sm:w-96">
          <div className="flex items-center justify-between border-b border-border-soft/30 px-4 py-3">
            <div>
              <p className="text-sm font-extrabold text-content">Thông báo</p>
              <p className="text-xs text-subtle">{unreadCount} chưa đọc</p>
            </div>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={() => markAllMutation.mutate()}
                className="grid size-8 place-items-center rounded-full text-subtle hover:bg-panel-soft hover:text-tertiary"
                title="Đánh dấu tất cả đã đọc"
              >
                <CheckCheck className="size-4" />
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notificationsQuery.isLoading && (
              <p className="px-4 py-5 text-center text-xs text-subtle">Đang tải thông báo...</p>
            )}
            {!notificationsQuery.isLoading && notifications.length === 0 && (
              <p className="px-4 py-5 text-center text-xs text-subtle">Bạn chưa có thông báo nào.</p>
            )}
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleNotificationClick(notification)}
                className={`block w-full border-b border-border-soft/20 px-4 py-3 text-left transition last:border-b-0 hover:bg-panel-soft/60 ${
                  notification.is_read ? 'opacity-80' : 'bg-tertiary/[0.08]'
                }`}
              >
                <div className="flex items-start gap-3">
                  {!notification.is_read && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-tertiary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-xs font-extrabold text-content">{notification.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-4 text-subtle">{notification.content}</p>
                    <p className="mt-1 text-[10px] text-muted">
                      {formatTimeAgo(notification.created_at)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <Link
            to="/notifications"
            onClick={() => setNotificationOpen(false)}
            className="block border-t border-border-soft/30 px-4 py-2.5 text-center text-xs font-extrabold text-tertiary hover:bg-panel-soft/60"
          >
            Xem tất cả thông báo
          </Link>
        </div>
      )}
    </div>
  )
}

function formatTimeAgo(isoDate) {
  if (!isoDate) return ''
  const date = new Date(isoDate)
  const now = new Date()
  const diffSec = Math.floor((now - date) / 1000)

  if (diffSec < 60) return 'Vừa xong'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function TopBarIconButton({ icon: Icon, label, onClick }) {
  return (
    <button type="button" title={label} onClick={onClick} className="relative grid size-9 place-items-center rounded-full text-subtle transition hover:bg-panel-soft hover:text-content">
      <Icon className="size-[16px]" />
    </button>
  )
}

function getSectionIcon(section) {
  if (section.icon) return section.icon
  return section.items?.[0]?.icon || Settings
}

function isItemActive(item, pathname) {
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}
