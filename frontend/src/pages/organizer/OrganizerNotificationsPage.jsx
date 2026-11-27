import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Calendar,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Inbox,
  Loader2,
  RotateCcw,
  ShoppingCart,
  UserCog,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications.js'
import { formatNotificationDisplay } from '@/lib/notifications.js'
import { cn } from '@/lib/utils.js'
import { sanitizeHtml } from '@/lib/sanitize.js'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { useToast } from '@/providers/ToastProvider.jsx'

function formatDateTime(value, isEnglish = false) {
  if (!value) return isEnglish ? 'N/A' : 'Chưa cập nhật'
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return isEnglish ? 'N/A' : 'Chưa cập nhật'
    return new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d)
  } catch {
    return isEnglish ? 'N/A' : 'Chưa cập nhật'
  }
}

function resolveOrganizerAction(item, isEnglish = false) {
  const meta = item?.metadata || {}
  if (meta.action_url) {
    return { to: meta.action_url, label: isEnglish ? 'View Details' : 'Xem chi tiết' }
  }
  if (item?.event_id) {
    return { to: `/organizer/events/${item.event_id}`, label: isEnglish ? 'View Event' : 'Xem sự kiện' }
  }
  const title = (item?.title || '').toLowerCase()
  if (title.includes('đơn hàng')) {
    return { to: '/organizer/orders', label: isEnglish ? 'View Orders' : 'Xem đơn hàng' }
  }
  if (title.includes('hoàn tiền') || title.includes('hoàn vé')) {
    return { to: '/organizer/refunds', label: isEnglish ? 'View Refunds' : 'Xem hoàn vé' }
  }
  if (title.includes('nhân sự') || title.includes('staff')) {
    return { to: '/organizer/staff-management', label: isEnglish ? 'Staff Management' : 'Quản lý nhân sự' }
  }
  return null
}

function getOrganizerNotificationIcon(item) {
  const title = (item?.title || '').toLowerCase()
  if (item?.type === 'EVENT' || title.includes('sự kiện') || title.includes('event')) return Calendar
  if (item?.type === 'PAYMENT' || title.includes('đơn hàng') || title.includes('order')) return ShoppingCart
  if (title.includes('hoàn')) return RotateCcw
  if (title.includes('nhân sự') || title.includes('staff')) return UserCog
  return Bell
}

export function OrganizerNotificationsPage() {
  const { isVietnamese } = useLanguage()
  const isEnglish = !isVietnamese
  const location = useLocation()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [activeFilter, setActiveFilter] = useState('all')
  const [page, setPage] = useState(1)
  const limit = 10

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'organizer', { page, activeFilter }],
    queryFn: () =>
      fetchNotifications({
        page,
        limit,
        unread_only: activeFilter === 'unread',
        target_role: 'ORGANIZER',
      }),
  })

  // Auto-scroll to specific notification if target id is in hash or query param or custom event
  useEffect(() => {
    let activeTimer = null
    let highlightTimer = null

    const scrollToTarget = (targetId) => {
      if (!targetId) return
      setActiveFilter('all')
      setPage(1)
      if (activeTimer) clearTimeout(activeTimer)
      activeTimer = setTimeout(() => {
        const el = document.getElementById(`notification-${targetId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('ring-2', 'ring-[#C99A47]', 'ring-offset-2', 'ring-offset-slate-900', 'shadow-2xl', 'shadow-[#C99A47]/30')
          if (highlightTimer) clearTimeout(highlightTimer)
          highlightTimer = setTimeout(() => {
            el.classList.remove('ring-2', 'ring-[#C99A47]', 'ring-offset-2', 'ring-offset-slate-900', 'shadow-2xl', 'shadow-[#C99A47]/30')
          }, 3500)
        }
      }, 350)
    }

    const rawTarget =
      (location.hash?.startsWith('#notification-') ? location.hash.slice('#notification-'.length) : '') ||
      new URLSearchParams(location.search).get('id')
    if (rawTarget) {
      scrollToTarget(rawTarget)
    }

    const handleCustomScroll = (e) => {
      if (e.detail?.id) {
        scrollToTarget(e.detail.id)
      }
    }

    window.addEventListener('eventhub:scroll-notification', handleCustomScroll)
    return () => {
      if (activeTimer) clearTimeout(activeTimer)
      if (highlightTimer) clearTimeout(highlightTimer)
      window.removeEventListener('eventhub:scroll-notification', handleCustomScroll)
    }
  }, [location.hash, location.search, notificationsQuery.data])

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead({ target_role: 'ORGANIZER' }),
    onSuccess: () => {
      toast.success(isEnglish ? 'Marked all as read' : 'Đã đánh dấu tất cả là đã đọc')
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const rawItems = notificationsQuery.data?.items || []
  const unreadCount = notificationsQuery.data?.unread_count || 0
  const pagination = notificationsQuery.data?.pagination || { page: 1, total: 0, total_pages: 1 }

  // Filter client-side by category if applicable
  const items = useMemo(() => {
    return rawItems.filter((item) => {
      if (!item) return false
      if (activeFilter === 'all' || activeFilter === 'unread') return true
      const title = typeof item.title === 'string' ? item.title.toLowerCase() : ''
      const content = typeof item.content === 'string' ? item.content.toLowerCase() : ''
      if (activeFilter === 'events') {
        return (
          title.includes('sự kiện') ||
          title.includes('phê duyệt') ||
          title.includes('từ chối') ||
          title.includes('ẩn') ||
          title.includes('khôi phục') ||
          item.type === 'EVENT' ||
          title.includes('event')
        )
      }
      if (activeFilter === 'transactions') {
        return (
          title.includes('đơn hàng') ||
          title.includes('bán vé') ||
          title.includes('vé') ||
          title.includes('hoàn') ||
          title.includes('khiếu nại') ||
          content.includes('hoàn tiền') ||
          item.type === 'PAYMENT' ||
          title.includes('order') ||
          title.includes('refund')
        )
      }
      return true
    })
  }, [rawItems, activeFilter])

  const FILTERS = useMemo(
    () => [
      { value: 'all', label: isEnglish ? 'All Notifications' : 'Tất cả thông báo' },
      { value: 'unread', label: isEnglish ? 'Unread' : 'Chưa đọc' },
      { value: 'events', label: isEnglish ? 'Event Status' : 'Duyệt sự kiện' },
      { value: 'transactions', label: isEnglish ? 'Orders & Refunds' : 'Đơn hàng & Hoàn vé' },
    ],
    [isEnglish],
  )

  return (
    <div className="space-y-6">
      <SectionHeader
        title={isEnglish ? 'Organizer Notifications' : 'Thông báo Ban tổ chức'}
        className="mb-6 sm:mb-8"
        action={
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#C99A47]/15 text-[#E6C17A] border border-[#C99A47]/30">
                <span className="size-2 rounded-full bg-[#E6C17A] animate-pulse" />
                {unreadCount} {isEnglish ? 'unread' : 'chưa đọc'}
              </span>
            )}
            {rawItems.length > 0 && (
              <button
                type="button"
                onClick={() => markAllMutation.mutate()}
                disabled={unreadCount === 0 || markAllMutation.isPending}
                className="inline-flex h-10 sm:h-11 items-center gap-2 rounded-xl sm:rounded-full border border-[#C99A47] bg-[#0f1b33] px-4 sm:px-5 text-xs sm:text-sm font-extrabold text-[#E6C17A] shadow-md shadow-[#C99A47]/20 transition-all hover:bg-gradient-to-r hover:from-[#C99A47] hover:to-[#E6C17A] hover:text-[#081126] hover:shadow-lg hover:shadow-[#C99A47]/35 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:border-[#C99A47]/40 disabled:hover:bg-[#0f1b33] disabled:hover:text-[#E6C17A] cursor-pointer"
              >
                {markAllMutation.isPending ? <Loader2 className="size-4 animate-spin text-[#E6C17A]" /> : <CheckCheck className="size-4 text-[#E6C17A]" />}
                {isEnglish ? 'Mark all as read' : 'Đánh dấu tất cả đã đọc'}
              </button>
            )}
          </div>
        }
      />

      {/* ── Phần 1: Bộ lọc ── */}
      <div className="relative z-10 pt-3 sm:pt-6 mb-6 sm:mb-8 flex w-full justify-end">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => {
                setActiveFilter(filter.value)
                setPage(1)
              }}
              className={cn(
                'inline-flex h-9 shrink-0 items-center rounded-xl px-4 text-xs font-bold transition-all cursor-pointer select-none',
                activeFilter === filter.value
                  ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-md shadow-[#C99A47]/20 font-black'
                  : 'border border-white/10 bg-slate-900/60 text-slate-300 hover:bg-white/10 hover:text-white',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Phần 2: Nội dung thông báo ── */}
      <section className="relative z-10 space-y-3.5">
        {notificationsQuery.isLoading && (
          <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-8 shadow-xl">
            <StatePanel message={isEnglish ? 'Loading notifications...' : 'Đang tải thông báo...'} loading />
          </div>
        )}
        {notificationsQuery.isError && (
          <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-8 shadow-xl">
            <StatePanel
              message={isEnglish ? 'Failed to load notifications.' : 'Không thể tải thông báo.'}
              tone="error"
              onRetry={() => notificationsQuery.refetch()}
              retryLabel={isEnglish ? 'Retry' : 'Thử lại'}
            />
          </div>
        )}
        {!notificationsQuery.isLoading && !notificationsQuery.isError && rawItems.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-8 shadow-xl">
            <StatePanel message={isEnglish ? 'You have no notifications yet.' : 'Bạn chưa có thông báo nào.'} />
          </div>
        )}
        {!notificationsQuery.isLoading && !notificationsQuery.isError && rawItems.length > 0 && items.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-8 shadow-xl">
            <StatePanel message={isEnglish ? 'No notifications match this filter.' : 'Không có thông báo phù hợp với bộ lọc này.'} />
          </div>
        )}

        {items.map((notification) => {
          const Icon = getOrganizerNotificationIcon(notification)
          let display = { title: notification.title || '', content: notification.content || '', preview: '' }
          try {
            const formatted = formatNotificationDisplay(notification, isEnglish)
            if (formatted) display = formatted
          } catch (e) {
            console.error('Error formatting notification:', notification, e)
          }

          const action = resolveOrganizerAction(notification, isEnglish)
          const isUnread = !notification.is_read

          return (
            <article
              key={notification.id}
              id={`notification-${notification.id}`}
              className={cn(
                'group relative overflow-hidden rounded-2xl border p-5 sm:p-6 shadow-xl transition-all duration-300',
                isUnread
                  ? 'border-primary/30 bg-[#0f172a] hover:border-primary/50 hover:bg-[#131d38]'
                  : 'border-white/10 bg-[#0f172a] hover:border-white/20 hover:bg-[#131d38]',
              )}
            >
              {isUnread && <span className="absolute left-0 top-0 h-full w-1 bg-primary" />}
              <div className="flex gap-3 sm:gap-4">
                <span
                  className={cn(
                    'grid size-11 shrink-0 place-items-center rounded-xl border sm:size-12',
                    isUnread
                      ? 'border-primary/25 bg-primary/10 text-primary'
                      : 'border-white/10 bg-slate-800 text-slate-300',
                  )}
                >
                  <Icon className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base font-extrabold text-content sm:text-lg">
                          {display.title}
                        </h3>
                        {isUnread && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-primary">
                            {isEnglish ? 'New' : 'Mới'}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-white [html.light_&]:text-[#0D1B2A]">
                      <Clock3 className="size-4 text-white [html.light_&]:text-[#0D1B2A]" /> {formatDateTime(notification.created_at, isEnglish)}
                    </span>
                  </div>

                  {typeof display.content === 'string' && /<[a-z][\s\S]*>/i.test(display.content) ? (
                    <div
                      className="mt-2.5 w-full text-sm sm:text-base leading-relaxed text-slate-100 font-normal [html.light_&]:text-[#0D1B2A] break-words [overflow-wrap:anywhere] [&_p]:break-words [&_p]:[overflow-wrap:anywhere] [&_a]:text-primary [&_a]:underline [&_a]:break-all [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full [&_img]:rounded-lg"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(display.content) }}
                    />
                  ) : (
                    <p className="mt-2.5 w-full text-sm sm:text-base leading-relaxed text-slate-100 font-normal whitespace-pre-line [html.light_&]:text-[#0D1B2A] break-words [overflow-wrap:anywhere]">
                      {display.content}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {action && (
                      <Link
                        to={action.to}
                        onClick={() => {
                          if (isUnread) markReadMutation.mutate(notification.id)
                        }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-soft/40 bg-panel-soft px-4 text-sm font-bold text-content transition hover:border-primary/50 hover:text-primary"
                      >
                        {action.label} <ChevronRight className="size-4" />
                      </Link>
                    )}
                    {isUnread && (
                      <button
                        type="button"
                        onClick={() => markReadMutation.mutate(notification.id)}
                        className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-muted transition hover:bg-white/5 hover:text-content cursor-pointer"
                      >
                        <CheckCheck className="size-4" /> {isEnglish ? 'Read' : 'Đã đọc'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </section>

      {/* ── Phần 3: Phân trang ── */}
      {pagination.total_pages > 1 && (
        <div className="relative z-10 mt-8 flex w-full justify-center">
          <Pagination
            page={pagination.page}
            totalPages={pagination.total_pages}
            onPageChange={setPage}
            isEnglish={isEnglish}
          />
        </div>
      )}
    </div>
  )
}

function Pagination({ page, totalPages, onPageChange, isEnglish = false }) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((item) => item === 1 || item === totalPages || Math.abs(item - page) <= 1)

  return (
    <nav className="flex items-center gap-2" aria-label={isEnglish ? 'Notifications pagination' : 'Phân trang thông báo'}>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="grid size-9 sm:size-10 place-items-center rounded-full border border-white/10 bg-[#151d34] text-slate-200 transition-all hover:bg-white/10 hover:text-white disabled:border-white/5 disabled:bg-[#151d34]/40 disabled:text-slate-600 disabled:cursor-not-allowed cursor-pointer"
        aria-label={isEnglish ? 'Previous page' : 'Trang trước'}
      >
        <ChevronLeft className="size-5" />
      </button>

      {pages.map((item, index) => (
        <div key={item} className="flex items-center gap-2">
          {index > 0 && item - pages[index - 1] > 1 && (
            <span className="px-1 text-xs font-bold text-slate-500 select-none">…</span>
          )}
          <button
            type="button"
            onClick={() => onPageChange(item)}
            aria-current={item === page ? 'page' : undefined}
            className={cn(
              'grid size-9 sm:size-10 place-items-center rounded-full text-xs font-bold transition-all cursor-pointer',
              item === page
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-black shadow-md shadow-[#C99A47]/30'
                : 'border border-white/10 bg-[#151d34] text-slate-300 hover:bg-white/10 hover:text-white',
            )}
          >
            {item}
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="grid size-9 sm:size-10 place-items-center rounded-full border border-white/10 bg-[#151d34] text-slate-200 transition-all hover:bg-white/10 hover:text-white disabled:border-white/5 disabled:bg-[#151d34]/40 disabled:text-slate-600 disabled:cursor-not-allowed cursor-pointer"
        aria-label={isEnglish ? 'Next page' : 'Trang sau'}
      >
        <ChevronRight className="size-5" />
      </button>
    </nav>
  )
}

function StatePanel({ message, tone = 'default', loading = false, onRetry = null, retryLabel = 'Retry' }) {
  return (
    <div className={cn('flex min-h-64 flex-col items-center justify-center p-8 text-center', tone === 'error' ? 'text-red-400' : 'text-slate-400')}>
      {loading ? (
        <Loader2 className="mb-4 size-8 animate-spin text-[#E6C17A]" />
      ) : (
        <Inbox className="mb-4 size-10 opacity-50 text-slate-500" />
      )}
      <p className="text-sm font-semibold text-slate-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-4 py-2 rounded-xl bg-[#C99A47] text-[#0D1B2A] text-xs font-bold hover:bg-[#E6C17A] transition"
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}

export default OrganizerNotificationsPage
