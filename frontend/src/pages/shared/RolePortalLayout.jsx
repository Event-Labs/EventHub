import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, ChevronRight, Home, LogOut, Menu, Moon, Settings, Sun, X } from 'lucide-react'
import { clearAuthSession, getAuthToken, isAdminUser } from '@/lib/auth.js'
import {
  fetchNotifications,
  getNotificationStreamUrl,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications.js'
import { formatNotificationDisplay, stripNotificationHtml } from '@/lib/notifications.js'
import { CosmicSpaceBackground } from '@/components/CosmicSpaceBackground.jsx'
import { PortalCloudsBackground } from '@/components/PortalCloudsBackground.jsx'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import logoSrc from '@/assets/eventhub-logo.png'

const NAV_LABEL_MAP = {
  'Tổng quan': { vi: 'Tổng quan', en: 'Overview' },
  'Bảng điều khiển': { vi: 'Bảng điều khiển', en: 'Dashboard' },
  'Quản lý người dùng': { vi: 'Quản lý người dùng', en: 'User Management' },
  'Người dùng': { vi: 'Người dùng', en: 'Users' },
  'Ban tổ chức': { vi: 'Ban tổ chức', en: 'Organizer' },
  'Organizer': { vi: 'Ban tổ chức', en: 'Organizer' },
  'Yêu cầu Ban tổ chức': { vi: 'Yêu cầu Ban tổ chức', en: 'Organizer Requests' },
  'Yêu cầu Organizer': { vi: 'Yêu cầu Ban tổ chức', en: 'Organizer Requests' },
  'Sự kiện & Nội dung': { vi: 'Sự kiện & Nội dung', en: 'Events & Content' },
  'Loại sự kiện': { vi: 'Loại sự kiện', en: 'Categories' },
  'Duyệt sự kiện': { vi: 'Duyệt sự kiện', en: 'Event Approvals' },
  'Tài chính & Gói dịch vụ': { vi: 'Tài chính & Gói dịch vụ', en: 'Finance & Plans' },
  'Tài chính': { vi: 'Tài chính', en: 'Finance' },
  'Gói dịch vụ': { vi: 'Gói dịch vụ', en: 'Service Plans' },
  'Hồ sơ': { vi: 'Hồ sơ', en: 'Profile' },
  'Sự kiện': { vi: 'Sự kiện', en: 'Events' },
  'Tất cả sự kiện': { vi: 'Tất cả sự kiện', en: 'All Events' },
  'Bán hàng': { vi: 'Bán hàng', en: 'Sales' },
  'Đơn hàng': { vi: 'Đơn hàng', en: 'Orders' },
  'Yêu cầu hoàn vé': { vi: 'Yêu cầu hoàn vé', en: 'Refund Requests' },
  'Phân tích vé': { vi: 'Phân tích vé', en: 'Ticket Analytics' },
  'Mã khuyến mãi': { vi: 'Mã khuyến mãi', en: 'Promo Codes' },
  'Khán giả': { vi: 'Khán giả', en: 'Audience' },
  'Người tham dự': { vi: 'Người tham dự', en: 'Attendees' },
  'Check-in': { vi: 'Check-in', en: 'Check-in' },
  'Phản hồi': { vi: 'Phản hồi', en: 'Feedback' },
  'Vận hành': { vi: 'Vận hành', en: 'Operations' },
  'Địa điểm': { vi: 'Địa điểm', en: 'Venues' },
  'Quản lý nhân sự': { vi: 'Quản lý nhân sự', en: 'Staff Management' },
  'Cài đặt': { vi: 'Cài đặt', en: 'Settings' },
  'Thanh toán': { vi: 'Thanh toán', en: 'Payment' },
  'Thông báo': { vi: 'Thông báo', en: 'Announcements' },
  'Chính sách': { vi: 'Chính sách', en: 'Policies' },
  'Trang chủ': { vi: 'Trang chủ', en: 'Home' },
  'Sự kiện được giao': { vi: 'Sự kiện được giao', en: 'Assigned Events' },
  'Soát vé': { vi: 'Soát vé', en: 'Ticket Check-in' },
  'Đặt vé trực tiếp': { vi: 'Đặt vé trực tiếp', en: 'Direct Booking' },
  'Quét vé bằng mã QR': { vi: 'Quét vé bằng mã QR', en: 'QR Check-in' },
  'Soát vé thủ công': { vi: 'Soát vé thủ công', en: 'Manual Check-in' },
  'Thống kê soát vé': { vi: 'Thống kê soát vé', en: 'Check-in Statistics' },
  'Đăng xuất': { vi: 'Đăng xuất', en: 'Log out' },
}

function getNavLabel(rawLabel, isVietnamese) {
  if (!rawLabel) return ''
  if (isVietnamese) return NAV_LABEL_MAP[rawLabel]?.vi || rawLabel
  return NAV_LABEL_MAP[rawLabel]?.en || rawLabel
}

function getTranslatedRole(rawRole, isVietnamese) {
  if (!rawRole) return ''
  if (isVietnamese) return rawRole
  const lower = rawRole.toLowerCase()
  if (lower.includes('quản trị') || lower.includes('admin')) return 'ADMINISTRATOR'
  if (lower.includes('tổ chức') || lower.includes('organizer')) return 'ORGANIZER'
  if (lower.includes('nhân') || lower.includes('staff')) return 'STAFF'
  if (lower.includes('khách') || lower.includes('customer')) return 'CUSTOMER'
  return rawRole.toUpperCase()
}

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
  const { isVietnamese, t } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const panelRef = useRef(null)
  const [collapsedHeight, setCollapsedHeight] = useState(null)

  useLayoutEffect(() => {
    if (!sidebarExpanded && panelRef.current) {
      const el = panelRef.current
      const prevHeight = el.style.height
      el.style.height = 'auto'
      const h = el.scrollHeight
      el.style.height = prevHeight
      if (h > 0) {
        setCollapsedHeight(h)
      }
    }
  }, [sidebarExpanded, navSections, bottomItems])
  const themeKey = useMemo(() => getPortalThemeKey(user), [user])
  const [theme, setTheme] = useState(() => getStoredPortalTheme(getPortalThemeKey(user)))
  const token = getAuthToken()

  useEffect(() => {
    applyPortalTheme(theme)
    return () => document.documentElement.classList.remove('light')
  }, [theme])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const quickMobileItems = useMemo(() => {
    const list = []
    for (const sec of navSections || []) {
      const items = sec.group ? sec.children : sec.items
      if (items) {
        for (const it of items) {
          if (!list.some(l => l.to === it.to)) {
            list.push(it)
          }
        }
      }
    }
    return list.slice(0, 4)
  }, [navSections])

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

  if (!isAllowed) {
    if (isAdminUser(user)) {
      return <Navigate to="/admin" replace />
    }
    return <Navigate to="/" replace />
  }

  return (
    <div className="relative flex h-screen w-full min-w-0 overflow-hidden bg-background text-content transition-colors duration-500">
      {/* ── Background layer manager with smooth 1000ms cross-fade transition ── */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {/* Dark Mode Cosmos Atmosphere */}
        <div
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${theme === 'dark' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
        >
          <CosmicSpaceBackground active={theme === 'dark'} />
        </div>

        {/* Light Mode Sunlit Clouds Horizon Atmosphere */}
        <div
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${theme === 'light' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
        >
          <PortalCloudsBackground active={theme === 'light'} />
        </div>
      </div>

      {/* ── Desktop Floating Sidebar (Visible on lg: >= 1024px) ── */}
      <aside
        className={`hidden lg:flex fixed top-[80px] left-0 z-30 flex-col items-center px-3 max-h-[calc(100vh-96px)] transition-all duration-300 ease-out will-change-[width,height] ${
          sidebarExpanded ? 'w-[240px]' : 'w-20'
        }`}
        style={{
          height: sidebarExpanded
            ? 'calc(100vh - 96px)'
            : collapsedHeight
              ? `${collapsedHeight}px`
              : 'fit-content',
        }}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <div
          ref={panelRef}
          className={`glass-panel relative flex flex-col overflow-hidden rounded-[26px] h-full transition-[width] duration-300 ease-out will-change-[width] ${
            theme === 'light'
              ? 'border-[#C99A47]/30 bg-white/85 shadow-[0_8px_32px_rgba(27,54,93,0.08)]'
              : 'border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.25)]'
          } ${sidebarExpanded ? 'w-full' : 'w-14'}`}
        >
          {/* Scrollable Navigation section */}
          <div
            className={`portal-sidebar-scroll flex-1 min-h-0 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden py-2 ${
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
                theme={theme}
              />
            ))}
          </div>

          {/* Divider between navigation and bottom utility items */}
          <div className={`mx-2 my-1 h-px shrink-0 ${theme === 'light' ? 'bg-[#C99A47]/20' : 'bg-white/10'}`} />

          {/* Bottom Items (Profile, Logout) */}
          <div
            className={`mt-auto flex shrink-0 flex-col items-center gap-0.5 pb-2 pt-0.5 ${
              sidebarExpanded ? 'w-full px-2' : 'w-full items-center px-1'
            }`}
          >
            {bottomItems.map((item) => (
              <SidebarItem
                key={item.label}
                item={item}
                expanded={sidebarExpanded}
                active={isItemActive(item, location.pathname)}
                theme={theme}
              />
            ))}
            {sidebarExpanded ? (
              <button
                type="button"
                onClick={logout}
                title={isVietnamese ? 'Đăng xuất' : 'Log out'}
                className={`group flex h-10 w-full items-center justify-start gap-3 overflow-hidden rounded-xl px-3 text-[13px] font-semibold transition-all duration-200 hover:text-error ${theme === 'light'
                  ? 'text-[#1B365D] hover:bg-[#C99A47]/15'
                  : 'text-white/90 hover:bg-white/10'
                  }`}
              >
                <LogOut className={`size-[18px] shrink-0 group-hover:text-error ${theme === 'light' ? 'text-[#1B365D]' : 'text-white/80'
                  }`} />
                <span className="portal-sidebar-label min-w-0 group-hover:text-error">{isVietnamese ? 'Đăng xuất' : 'Log out'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={logout}
                title={isVietnamese ? 'Đăng xuất' : 'Log out'}
                className={`grid size-10 place-items-center rounded-xl transition-all duration-200 hover:text-error ${theme === 'light'
                  ? 'text-[#1B365D] hover:bg-[#C99A47]/15'
                  : 'text-white/80 hover:bg-white/10'
                  }`}
              >
                <LogOut className="size-[19px]" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Spacer for fixed desktop sidebar */}
      <div
        className="hidden lg:block shrink-0 transition-[width] duration-300 ease-out"
        style={{ width: sidebarExpanded ? expandedWidth : collapsedWidth }}
      />

      {/* ── Mobile Off-Canvas Drawer Backdrop ── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Mobile Off-Canvas Drawer (Slide from left) ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[290px] max-w-[85vw] flex-col overflow-hidden shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          theme === 'light'
            ? 'border-r border-[#C99A47]/30 bg-[#FDFBF7] text-[#0D1B2A]'
            : 'border-r border-white/10 bg-[#081126] text-white'
        }`}
      >
        {/* Drawer Header */}
        <div className={`flex items-center justify-between border-b px-4 py-4 ${
          theme === 'light' ? 'border-[#C99A47]/20 bg-[#F5EBDD]/60' : 'border-white/10 bg-slate-900/60'
        }`}>
          <div className="flex items-center gap-3">
            <img src={logoSrc} alt="EventHub" className="h-10 sm:h-11 w-auto object-contain" />
            <span className={`text-[11px] font-extrabold uppercase tracking-wider rounded-md px-2 py-0.5 ${
              theme === 'light' ? 'bg-[#C99A47]/20 text-[#1B365D]' : 'bg-primary/20 text-primary'
            }`}>
              {getTranslatedRole(roleLabel, isVietnamese)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className={`grid size-9 place-items-center rounded-xl transition ${
              theme === 'light' ? 'hover:bg-[#C99A47]/20 text-[#1B365D]' : 'hover:bg-white/10 text-white'
            }`}
            aria-label={isVietnamese ? 'Đóng menu' : 'Close menu'}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {navSections.map((section, sectionIndex) => (
            <SidebarSection
              key={section.label}
              section={section}
              expanded={true}
              showDivider={sectionIndex > 0}
              pathname={location.pathname}
              theme={theme}
              onItemClick={() => setMobileMenuOpen(false)}
            />
          ))}
        </div>

        {/* Drawer Bottom Actions */}
        <div className={`border-t px-3 py-3 space-y-1 ${
          theme === 'light' ? 'border-[#C99A47]/20 bg-[#F5EBDD]/40' : 'border-white/10 bg-slate-900/40'
        }`}>
          {bottomItems.map((item) => (
            <SidebarItem
              key={item.label}
              item={item}
              expanded={true}
              active={isItemActive(item, location.pathname)}
              theme={theme}
              onClick={() => setMobileMenuOpen(false)}
            />
          ))}
          <button
            type="button"
            onClick={logout}
            className={`group flex h-11 w-full items-center gap-3 rounded-[18px] px-4 text-sm font-semibold text-error transition-all hover:bg-error/10`}
          >
            <LogOut className="size-5 shrink-0" />
            <span>{isVietnamese ? 'Đăng xuất' : 'Log out'}</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="relative z-10 flex min-w-0 flex-1 flex-col overflow-x-hidden transition-all duration-300 ease-out">
        <PortalTopBar
          user={user}
          avatar={avatar}
          roleLabel={roleLabel}
          profileTo={profileTo}
          theme={theme}
          onToggleTheme={() => setPortalTheme(theme === 'light' ? 'dark' : 'light')}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />
        <div className="flex-1 overflow-y-auto overflow-x-hidden pt-20 sm:pt-[84px] pb-20 lg:pb-6 w-full min-w-0">
          <div
            className={`mx-auto w-full min-w-0 transition-all duration-300 ${
              location.pathname.includes('/events/review/')
                ? 'max-w-full px-2 sm:px-4 py-2 sm:py-3'
                : 'max-w-[1320px] px-3 sm:px-6 lg:px-8 py-4 sm:py-6'
            }`}
          >
            <Outlet />
          </div>
        </div>
      </main>

      {/* ── Mobile Bottom Navigation Bar (Thumb Dock for Phones) ── */}
      <nav className={`fixed bottom-0 inset-x-0 z-40 flex h-16 items-center justify-around border-t backdrop-blur-xl lg:hidden pb-[env(safe-area-inset-bottom)] ${
        theme === 'light'
          ? 'border-[#C99A47]/30 bg-[#FDFBF7]/95 text-[#0D1B2A] shadow-[0_-4px_20px_rgba(27,54,93,0.08)]'
          : 'border-white/10 bg-[#081126]/95 text-white shadow-[0_-4px_20px_rgba(0,0,0,0.5)]'
      }`}>
        {quickMobileItems.map((item) => {
          const active = isItemActive(item, location.pathname)
          const Icon = item.icon
          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={`flex flex-1 flex-col items-center justify-center py-1 transition-all ${
                active
                  ? (theme === 'light' ? 'text-[#C99A47] font-black' : 'text-primary font-black')
                  : (theme === 'light' ? 'text-[#1B365D]/70 hover:text-[#0D1B2A]' : 'text-white/70 hover:text-white')
              }`}
            >
              {Icon && <Icon className={`size-5 transition-transform ${active ? 'scale-110 drop-shadow' : ''}`} />}
              <span className="text-[10px] mt-1 font-semibold leading-none truncate max-w-[64px] text-center">{getNavLabel(item.label, isVietnamese)}</span>
            </NavLink>
          )
        })}
        {/* Button to open full mobile drawer */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className={`flex flex-1 flex-col items-center justify-center py-1 transition-all ${
            theme === 'light' ? 'text-[#1B365D]/70 hover:text-[#0D1B2A]' : 'text-white/70 hover:text-white'
          }`}
        >
          <Menu className="size-5" />
          <span className="text-[10px] mt-1 font-semibold leading-none">Menu</span>
        </button>
      </nav>
    </div>
  )
}

function SidebarSection({ section, expanded, showDivider, pathname, theme, onItemClick }) {
  const { isVietnamese } = useLanguage()
  const Icon = getSectionIcon(section)
  const items = section.group ? section.children : section.items
  const sectionTitle = getNavLabel(section.label, isVietnamese)

  if (!expanded) {
    return (
      <div className="flex w-full flex-col items-center gap-0.5">
        {showDivider && (
          <div className={`my-1 h-px w-6 ${theme === 'light' ? 'bg-[#C99A47]/30' : 'bg-border-soft/30'
            }`} />
        )}
        {items.map((item) => (
          <SidebarItem
            key={item.to || item.label}
            item={item}
            expanded={false}
            active={isItemActive(item, pathname)}
            fallbackIcon={Icon}
            theme={theme}
            onClick={onItemClick}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="w-full">
      {showDivider && (
        <div className={`mx-3 my-1.5 h-px ${theme === 'light' ? 'bg-[#C99A47]/20' : 'bg-white/10'
          }`} />
      )}
      <p className={`portal-sidebar-label px-3 pb-1 pt-1.5 text-[11px] font-black uppercase tracking-widest ${theme === 'light' ? 'text-[#1B365D]' : 'text-white'
        }`}>
        {sectionTitle}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <SidebarItem
            key={item.to || item.label}
            item={item}
            expanded={expanded}
            active={isItemActive(item, pathname)}
            theme={theme}
            onClick={onItemClick}
          />
        ))}
      </div>
    </div>
  )
}

function SidebarItem({ item, expanded, active, fallbackIcon, theme, onClick }) {
  const { isVietnamese } = useLanguage()
  const Icon = item.icon || fallbackIcon
  const isLight = theme === 'light'
  const displayLabel = getNavLabel(item.label, isVietnamese)

  if (!expanded) {
    return (
      <NavLink
        to={item.to}
        end={item.end}
        title={displayLabel}
        onClick={onClick}
        className={({ isActive }) => {
          const current = active ?? isActive
          if (isLight) {
            return `grid size-10 place-items-center rounded-xl transition-all duration-200 ${current
              ? 'bg-gradient-to-r from-[#C99A47]/25 to-[#E6C17A]/35 text-[#0D1B2A] border border-[#C99A47]/60 shadow-[0_2px_10px_rgba(201,154,71,0.25)]'
              : 'text-[#1B365D] hover:bg-[#C99A47]/12 hover:text-[#0D1B2A] border border-transparent'
              }`
          }
          return `grid size-10 place-items-center rounded-xl transition-all duration-200 ${current
            ? 'bg-primary/20 text-primary shadow-[inset_0_0_15px_rgba(6,182,212,0.2)] border border-primary/30'
            : 'text-white/80 hover:bg-white/10 hover:text-white border border-transparent'
            }`
        }}
      >
        {({ isActive }) => {
          const current = active ?? isActive
          if (isLight) {
            return Icon ? (
              <Icon className={`size-[19px] ${current ? 'text-[#C99A47] drop-shadow-[0_0_6px_rgba(201,154,71,0.5)]' : 'text-[#1B365D]'
                }`} />
            ) : null
          }
          return Icon ? (
            <Icon className={`size-[19px] ${current ? 'text-primary drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]' : 'text-white/80'
              }`} />
          ) : null
        }}
      </NavLink>
    )
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={displayLabel}
      onClick={onClick}
      className={({ isActive }) => {
        const current = active ?? isActive
        if (isLight) {
          return `group flex h-10 w-full items-center gap-3 overflow-hidden rounded-xl px-3 text-[13px] font-bold transition-all duration-200 ${current
            ? 'bg-gradient-to-r from-[#C99A47]/25 to-[#E6C17A]/35 text-[#0D1B2A] border border-[#C99A47]/60 shadow-[0_2px_12px_rgba(201,154,71,0.25)]'
            : 'text-[#1B365D] hover:bg-[#C99A47]/12 hover:text-[#0D1B2A] border border-transparent'
            }`
        }
        return `group flex h-10 w-full items-center gap-3 overflow-hidden rounded-xl px-3 text-[13px] font-bold transition-all duration-200 ${current
          ? 'bg-primary/20 text-primary shadow-[inset_0_0_15px_rgba(6,182,212,0.2)] border border-primary/30'
          : 'text-white hover:bg-white/10 border border-transparent'
          }`
      }}
    >
      {({ isActive }) => {
        const current = active ?? isActive
        if (isLight) {
          return (
            <>
              {Icon && (
                <Icon className={`size-[18px] shrink-0 transition-colors ${current
                  ? 'text-[#C99A47] drop-shadow-[0_0_6px_rgba(201,154,71,0.5)]'
                  : 'text-[#1B365D] group-hover:text-[#0D1B2A]'
                  }`} />
              )}
              <span className={`portal-sidebar-label min-w-0 flex-1 ${current ? 'font-black text-[#0D1B2A]' : 'text-[#1B365D] group-hover:text-[#0D1B2A]'
                }`}>{displayLabel}</span>
              {current && <ChevronRight className="size-4 shrink-0 text-[#C99A47]" />}
            </>
          )
        }
        return (
          <>
            {Icon && (
              <Icon className={`size-[18px] shrink-0 ${current ? 'text-primary drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]' : 'text-white/80 group-hover:text-white'
                }`} />
            )}
            <span className={`portal-sidebar-label min-w-0 flex-1 ${current ? 'text-primary' : 'text-white'}`}>
              {displayLabel}
            </span>
            {current && <ChevronRight className="size-4 shrink-0 text-primary" />}
          </>
        )
      }}
    </NavLink>
  )
}

function PortalTopBar({ user, avatar, roleLabel, profileTo, theme, onToggleTheme, onOpenMobileMenu }) {
  const { isVietnamese, t } = useLanguage()
  const isLight = theme === 'light'
  const isAdmin = isAdminUser(user) || roleLabel === 'Quản trị viên' || roleLabel === 'ADMINISTRATOR'
  const displayRole = getTranslatedRole(roleLabel, isVietnamese)

  return (
    <header className={`fixed inset-x-0 top-0 z-40 flex h-16 sm:h-[68px] items-center justify-between gap-2 sm:gap-4 border-b px-3 sm:px-6 lg:px-8 backdrop-blur-xl transition-colors duration-500 ${isLight
      ? 'border-[#C99A47]/30 bg-[#F5EBDD]/90 text-[#0D1B2A] shadow-[0_8px_32px_rgba(27,54,93,0.06)]'
      : 'border-white/10 bg-slate-950/80 text-white shadow-[0_8px_32px_rgba(0,0,0,0.2)]'
      }`}>
      <div className="flex items-center gap-2 sm:gap-5 min-w-0">
        {/* Mobile Hamburger Drawer Trigger */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className={`grid size-9 sm:size-10 shrink-0 place-items-center rounded-xl lg:hidden transition ${
            isLight ? 'text-[#1B365D] hover:bg-[#C99A47]/15' : 'text-white hover:bg-white/10'
          }`}
          aria-label={isVietnamese ? 'Mở menu điều hướng' : 'Open navigation menu'}
        >
          <Menu className="size-5" />
        </button>

        <NavLink
          to={isAdmin ? '/admin' : '/'}
          reloadDocument={!isAdmin}
          title={isAdmin ? (isVietnamese ? 'Về trang quản trị' : 'Back to Admin Portal') : (isVietnamese ? 'Về trang chủ' : 'Back to Home')}
          className="shrink-0 transition opacity-90 hover:opacity-100 flex items-center"
        >
          <img
            src={logoSrc}
            alt="EventHub"
            className="logo-fixed h-9 sm:h-10 lg:h-11 w-auto shrink-0 object-contain"
            style={{ filter: 'none' }}
          />
        </NavLink>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        {!isAdmin && (
          <NavLink
            to="/"
            reloadDocument
            className={`hidden md:inline-flex h-10 sm:h-10.5 items-center gap-2 rounded-full border px-4 lg:px-5 text-xs lg:text-sm font-bold transition-all ${isLight
              ? 'border-[#C99A47]/45 bg-[#C99A47]/15 text-[#1B365D] hover:bg-[#C99A47] hover:text-[#0D1B2A] shadow-sm'
              : 'border-[#C99A47]/50 bg-[#C99A47]/10 text-[#E6C17A] hover:border-[#E6C17A] hover:bg-[#C99A47] hover:text-[#081126] hover:shadow-[0_0_16px_rgba(201,154,71,0.35)]'
              }`}
            title={isVietnamese ? 'Chuyển sang trang khách hàng' : 'Switch to Customer Site'}
          >
            <Home className="size-4" />
            <span>{isVietnamese ? 'Trang khách hàng' : 'Customer Site'}</span>
          </NavLink>
        )}
        <LanguageSwitcher theme={theme} className="h-10 sm:h-10.5" />
        <div className={`glass-panel flex h-10 sm:h-10.5 items-center gap-1.5 rounded-full px-1.5 sm:px-2 shadow-inner ${isLight ? 'border-[#C99A47]/30 bg-white/70 text-[#1B365D]' : 'border-white/10'
          }`}>
          <TopBarIconButton
            icon={theme === 'light' ? Sun : Moon}
            label={theme === 'light' ? (isVietnamese ? 'Chế độ sáng' : 'Light mode') : (isVietnamese ? 'Chế độ tối' : 'Dark mode')}
            onClick={onToggleTheme}
            theme={theme}
          />
          <PortalNotificationBell theme={theme} />
        </div>
        <NavLink
          to={profileTo}
          className={`glass-panel flex h-10 sm:h-10.5 items-center gap-2.5 sm:gap-3 rounded-full pl-1.5 sm:pl-2 pr-3.5 sm:pr-4 shadow-inner transition-all ${isLight
            ? 'border-[#C99A47]/30 bg-white/70 hover:border-[#C99A47] hover:bg-white/95'
            : 'border-white/10 hover:border-primary/50 hover:bg-white/5'
            }`}
          title={isVietnamese ? 'Hồ sơ' : 'Profile'}
        >
          {avatar}
          <div className="hidden text-left sm:block">
            <p className={`text-xs sm:text-sm font-extrabold leading-tight ${isLight ? 'text-[#0D1B2A]' : 'text-white'}`}>
              {user?.full_name?.split(' ').slice(-1)[0] || displayRole}
            </p>
            <p className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-[#C99A47]' : 'text-primary'}`}>
              {displayRole}
            </p>
          </div>
          <ChevronRight className={`size-4 ${isLight ? 'text-[#1B365D]/60' : 'text-slate-400'}`} />
        </NavLink>
      </div>
    </header>
  )
}

function PortalNotificationBell({ theme }) {
  const { isVietnamese, t } = useLanguage()
  const isLight = theme === 'light'
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [notificationOpen, setNotificationOpen] = useState(false)
  const containerRef = useRef(null)
  const token = getAuthToken()

  useEffect(() => {
    if (!notificationOpen) return undefined

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setNotificationOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [notificationOpen])

  useEffect(() => {
    setNotificationOpen(false)
  }, [location.pathname])

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
          // Skip customer-targeted refund completion toast in organizer/admin portal
          if (data.title === 'Hoàn tiền vé thành công') {
            return
          }
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

    const title = (notification.title || '').toLowerCase()
    const content = (notification.content || '').toLowerCase()
    const isAdminPortal = location.pathname.startsWith('/admin')
    if (isAdminPortal) {
      if (title.includes('organizer')) {
        navigate('/admin/organizer-requests')
        return
      }
      navigate('/admin/event-review')
      return
    }

    if (title.includes('organizer') || content.includes('organizer')) {
      if (title.includes('đã được duyệt') || content.includes('phê duyệt')) {
        navigate('/organizer')
        return
      }
      navigate('/organizer-request?mode=edit')
      return
    }

    const isOrganizerPortal = location.pathname.startsWith('/organizer')
    if (notification.event_id && isOrganizerPortal) {
      navigate(`/organizer/events/${notification.event_id}`)
      return
    }
    navigate(`/notifications#notification-${notification.id}`)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        title={t('nav.notifications')}
        onClick={() => setNotificationOpen((prev) => !prev)}
        className="relative grid size-8 sm:size-8.5 place-items-center rounded-full text-subtle transition hover:bg-panel-soft hover:text-content"
        aria-label={t('nav.notifications')}
        aria-expanded={notificationOpen}
      >
        <Bell className="size-[17px] sm:size-[18px]" />
        {unreadCount > 0 && (
          <span
            className={`absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-black transition-all bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] ${isLight
              ? 'ring-1.5 ring-white shadow-[0_2px_6px_rgba(201,154,71,0.45)]'
              : 'ring-1.5 ring-[#081126] shadow-[0_2px_8px_rgba(201,154,71,0.55)]'
              }`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {notificationOpen && (
        <div className={`absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border sm:w-96 ${isLight
          ? 'border-[#C99A47]/30 bg-white text-[#0D1B2A] shadow-[0_16px_48px_rgba(27,54,93,0.15)]'
          : 'border-border-soft/40 bg-slate-950 text-white shadow-2xl'
          }`}>
          <div className={`flex items-center justify-between border-b px-4 py-3.5 ${
            isLight
              ? 'border-[#C99A47]/25 bg-gradient-to-r from-[#F5EBDD] to-[#FAF4EB]'
              : 'border-white/10 bg-[#0f1b33] shadow-sm'
          }`}>
            <div className="flex items-center gap-2.5">
              <div className={`grid size-8 place-items-center rounded-xl shrink-0 ${
                isLight ? 'bg-[#C99A47]/20 text-[#0D1B2A]' : 'bg-[#E6C17A]/15 text-[#E6C17A] border border-[#E6C17A]/20'
              }`}>
                <Bell className="size-4" />
              </div>
              <div>
                <h4 className={`text-sm sm:text-base font-black tracking-tight ${isLight ? 'text-[#0D1B2A]' : 'text-white'}`}>
                  {t('nav.notifications')}
                </h4>
                <p className={`text-xs font-medium ${isLight ? 'text-[#536b88]' : 'text-slate-400'}`}>
                  {unreadCount > 0 ? t('nav.unreadCount', { count: unreadCount }) : (isVietnamese ? 'Đã đọc tất cả thông báo' : 'All notifications read')}
                </p>
              </div>
            </div>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={() => markAllMutation.mutate()}
                className={`grid size-8 place-items-center rounded-full transition ${isLight ? 'text-[#1B365D] hover:bg-[#C99A47]/20' : 'text-subtle hover:bg-white/10 hover:text-[#E6C17A]'
                  }`}
                title={isVietnamese ? 'Đánh dấu tất cả đã đọc' : 'Mark all as read'}
              >
                <CheckCheck className="size-4" />
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notificationsQuery.isLoading && (
              <p className={`px-4 py-5 text-center text-xs ${isLight ? 'text-[#1B365D]' : 'text-subtle'}`}>
                {isVietnamese ? 'Đang tải thông báo...' : 'Loading notifications...'}
              </p>
            )}
            {!notificationsQuery.isLoading && notifications.length === 0 && (
              <p className={`px-4 py-5 text-center text-xs ${isLight ? 'text-[#1B365D]' : 'text-subtle'}`}>
                {t('nav.noNotifications')}
              </p>
            )}
            {notifications.map((notification) => {
              const display = formatNotificationDisplay(notification, !isVietnamese)
              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  className={`block w-full border-b px-4 py-3 text-left transition last:border-b-0 ${isLight
                    ? notification.is_read
                      ? 'border-[#C99A47]/15 hover:bg-[#F5EBDD]/50 text-[#0D1B2A]'
                      : 'border-[#C99A47]/20 bg-[#C99A47]/10 hover:bg-[#C99A47]/20 text-[#0D1B2A]'
                    : notification.is_read
                      ? 'border-border-soft/20 opacity-80 hover:bg-panel-soft/60'
                      : 'border-border-soft/20 bg-[#C99A47]/10 hover:bg-panel-soft/60'
                    }`}
                >
                  <div className="flex items-start gap-3">
                    {!notification.is_read && (
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${isLight ? 'bg-[#C99A47]' : 'bg-[#E6C17A]'}`} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`line-clamp-1 text-xs font-extrabold ${isLight ? 'text-[#0D1B2A]' : 'text-content'}`}>{display.title}</p>
                      <p className={`mt-1 line-clamp-2 text-xs leading-4 ${isLight ? 'text-[#1B365D]/80' : 'text-subtle'}`}>{display.preview || stripNotificationHtml(display.content)}</p>
                      <p className={`mt-1 text-[10px] ${isLight ? 'text-[#506680]' : 'text-muted'}`}>
                        {formatTimeAgo(notification.created_at, isVietnamese)}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {!location.pathname.startsWith('/admin') && (
            <Link
              to="/notifications"
              onClick={() => setNotificationOpen(false)}
              className={`block border-t px-4 py-2.5 text-center text-xs font-extrabold text-[#C99A47] hover:text-[#E6C17A] transition-colors ${isLight ? 'border-[#C99A47]/20 bg-[#F5EBDD]/50 hover:bg-[#F5EBDD]' : 'border-border-soft/30 hover:bg-white/[0.04]'
                }`}
            >
              {t('nav.viewAllNotifications')}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function formatTimeAgo(isoDate, isVietnamese = true) {
  if (!isoDate) return ''
  const date = new Date(isoDate)
  const now = new Date()
  const diffSec = Math.floor((now - date) / 1000)

  if (diffSec < 60) return isVietnamese ? 'Vừa xong' : 'Just now'
  if (diffSec < 3600) return isVietnamese ? `${Math.floor(diffSec / 60)} phút trước` : `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return isVietnamese ? `${Math.floor(diffSec / 3600)} giờ trước` : `${Math.floor(diffSec / 3600)}h ago`
  return date.toLocaleDateString(isVietnamese ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function TopBarIconButton({ icon: Icon, label, onClick, theme }) {
  const isLight = theme === 'light'
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`relative grid size-8 sm:size-8.5 place-items-center rounded-full transition ${isLight
        ? 'text-[#1B365D] hover:bg-[#C99A47]/20 hover:text-[#0D1B2A]'
        : 'text-subtle hover:bg-panel-soft hover:text-content'
        }`}
    >
      <Icon className="size-[17px] sm:size-[18px]" />
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
