import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Bell,
  Calendar,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cpu,
  ExternalLink,
  Inbox,
  Loader2,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications.js'
import { formatNotificationDisplay, stripNotificationHtml } from '@/lib/notifications.js'
import { cn } from '@/lib/utils.js'
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

export function AdminNotificationsPage() {
  const { isVietnamese } = useLanguage()
  const isEnglish = !isVietnamese
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [activeFilter, setActiveFilter] = useState('all')
  const [page, setPage] = useState(1)
  const limit = 15

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'admin', { page, activeFilter }],
    queryFn: () =>
      fetchNotifications({
        page,
        limit,
        unread_only: activeFilter === 'unread',
        target_role: 'ADMIN',
      }),
  })

  // Auto-scroll to specific notification
  useEffect(() => {
    const rawTarget =
      location.hash?.replace('#notification-', '') ||
      new URLSearchParams(location.search).get('id')
    if (!rawTarget) return
    const timer = setTimeout(() => {
      const el = document.getElementById(`notification-${rawTarget}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-2', 'ring-[#C99A47]', 'ring-offset-2', 'ring-offset-slate-900')
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-[#C99A47]', 'ring-offset-2', 'ring-offset-slate-900')
        }, 3500)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [location.hash, location.search, notificationsQuery.data])

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead({ target_role: 'ADMIN' }),
    onSuccess: () => {
      toast.success(isEnglish ? 'Marked all as read' : 'Đã đánh dấu tất cả là đã đọc')
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const rawItems = notificationsQuery.data?.items || []
  const unreadCount = notificationsQuery.data?.unread_count || 0
  const pagination = notificationsQuery.data?.pagination || { page: 1, total: 0, total_pages: 1 }

  const items = rawItems.filter((item) => {
    if (activeFilter === 'all' || activeFilter === 'unread') return true
    const title = (item.title || '').toLowerCase()
    if (activeFilter === 'events') {
      return (
        title.includes('sự kiện') ||
        title.includes('phê duyệt') ||
        title.includes('từ chối') ||
        title.includes('review') ||
        item.type === 'EVENT'
      )
    }
    if (activeFilter === 'organizers') {
      return title.includes('organizer') || title.includes('nhà tổ chức') || title.includes('hồ sơ')
    }
    if (activeFilter === 'disputes') {
      return (
        title.includes('khiếu nại') ||
        title.includes('hoàn tiền') ||
        title.includes('hoàn vé') ||
        title.includes('esp32') ||
        title.includes('thiết bị')
      )
    }
    return true
  })

  const handleNotificationClick = (item) => {
    if (!item.is_read) {
      markReadMutation.mutate(item.id)
    }
    const meta = item.metadata || {}
    if (meta.action_url) {
      navigate(meta.action_url)
      return
    }
    const title = (item.title || '').toLowerCase()
    if (title.includes('sự kiện')) {
      navigate('/admin/events/review')
      return
    }
    if (title.includes('organizer') || title.includes('hồ sơ')) {
      navigate('/admin/organizer-requests')
      return
    }
    if (title.includes('esp32') || title.includes('thiết bị')) {
      navigate('/admin/devices')
      return
    }
    if (title.includes('khiếu nại') || title.includes('hoàn')) {
      navigate('/admin/disputes')
      return
    }
  }

  const FILTERS = [
    { value: 'all', label: isEnglish ? 'All Notifications' : 'Tất cả thông báo' },
    { value: 'unread', label: isEnglish ? 'Unread' : 'Chưa đọc' },
    { value: 'events', label: isEnglish ? 'Event Approvals' : 'Duyệt sự kiện' },
    { value: 'organizers', label: isEnglish ? 'Organizer Requests' : 'Hồ sơ Organizer' },
    { value: 'disputes', label: isEnglish ? 'Complaints & Devices' : 'Khiếu nại & Thiết bị' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-[#C99A47]/15 text-[#E6C17A] border border-[#C99A47]/30">
              <Bell className="size-5" />
            </span>
            {isEnglish ? 'Admin Notifications' : 'Thông báo Quản trị viên'}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            {isEnglish
              ? 'Track event review submissions, organizer onboarding requests, check-in devices, and disputes.'
              : 'Theo dõi duyệt sự kiện, xác minh hồ sơ ban tổ chức, thiết bị check-in và xử lý khiếu nại hoàn tiền.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#C99A47]/15 text-[#E6C17A] border border-[#C99A47]/30">
              <span className="size-2 rounded-full bg-[#E6C17A] animate-pulse" />
              {unreadCount} {isEnglish ? 'unread' : 'chưa đọc'}
            </span>
          )}
          <button
            type="button"
            onClick={() => markAllMutation.mutate()}
            disabled={unreadCount === 0 || markAllMutation.isPending}
            className="inline-flex h-9.5 items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-4 text-xs font-bold text-slate-200 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {markAllMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-4" />}
            {isEnglish ? 'Mark all as read' : 'Đánh dấu tất cả đã đọc'}
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setActiveFilter(f.value)
              setPage(1)
            }}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-bold transition-all',
              activeFilter === f.value
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-md shadow-[#C99A47]/20 font-black'
                : 'border border-white/10 bg-slate-900/60 text-slate-300 hover:bg-white/10 hover:text-white',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3.5">
        {notificationsQuery.isLoading && (
          <div className="flex flex-col items-center justify-center p-12 rounded-2xl border border-white/10 bg-slate-900/50">
            <Loader2 className="size-8 animate-spin text-[#E6C17A]" />
            <p className="mt-3 text-xs text-slate-400">{isEnglish ? 'Loading notifications...' : 'Đang tải thông báo...'}</p>
          </div>
        )}

        {notificationsQuery.isError && (
          <div className="flex flex-col items-center justify-center p-12 rounded-2xl border border-red-500/20 bg-red-500/10 text-center">
            <ShieldAlert className="size-12 text-red-400 mb-3" />
            <h3 className="text-sm font-bold text-white">{isEnglish ? 'Failed to load notifications' : 'Không thể tải thông báo'}</h3>
            <p className="mt-1 text-xs text-slate-400 max-w-sm mb-4">
              {notificationsQuery.error?.message || (isEnglish ? 'An error occurred while fetching notifications.' : 'Đã có lỗi xảy ra khi tải danh sách thông báo.')}
            </p>
            <button
              type="button"
              onClick={() => notificationsQuery.refetch()}
              className="px-4 py-2 rounded-xl bg-[#C99A47] text-[#0D1B2A] text-xs font-bold hover:bg-[#E6C17A] transition"
            >
              {isEnglish ? 'Retry' : 'Thử lại'}
            </button>
          </div>
        )}

        {!notificationsQuery.isLoading && !notificationsQuery.isError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 rounded-2xl border border-white/10 bg-slate-900/40 text-center">
            <Inbox className="size-12 text-slate-500 mb-3" />
            <h3 className="text-sm font-bold text-white">{isEnglish ? 'No notifications found' : 'Không có thông báo nào'}</h3>
            <p className="mt-1 text-xs text-slate-400 max-w-sm">
              {isEnglish
                ? 'No notifications matching this category.'
                : 'Hiện không có thông báo nào trong danh mục này.'}
            </p>
          </div>
        )}

        {items.map((item) => {
          let display = { title: item.title || '', content: item.content || '', preview: '' }
          try {
            const formatted = formatNotificationDisplay(item, isEnglish)
            if (formatted) display = formatted
          } catch (e) {
            console.error('Error formatting admin notification:', item, e)
          }
          const isUnread = !item.is_read
          const meta = item.metadata || {}

          return (
            <div
              key={item.id}
              id={`notification-${item.id}`}
              onClick={() => handleNotificationClick(item)}
              className={cn(
                'group relative flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer backdrop-blur-sm',
                isUnread
                  ? 'border-[#C99A47]/40 bg-gradient-to-r from-[#C99A47]/10 via-[#0f1b33] to-[#0f1b33] shadow-lg shadow-[#C99A47]/5 hover:border-[#C99A47]/70'
                  : 'border-white/10 bg-slate-900/60 hover:bg-slate-900/90 hover:border-white/20',
              )}
            >
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                <div
                  className={cn(
                    'grid size-10 rounded-xl place-items-center shrink-0 border transition-transform group-hover:scale-105',
                    isUnread
                      ? 'bg-gradient-to-br from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] border-[#E6C17A]/50 shadow-md shadow-[#C99A47]/30'
                      : 'bg-slate-800 text-slate-300 border-white/10',
                  )}
                >
                  <Bell className="size-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#C99A47]/20 text-[#E6C17A] border border-[#C99A47]/30">
                      ADMIN
                    </span>
                    {isUnread && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {isEnglish ? 'NEW' : 'MỚI'}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">
                      {formatDateTime(item.created_at, isEnglish)}
                    </span>
                  </div>

                  <h3 className={cn('text-sm sm:text-base font-bold text-white leading-snug', isUnread && 'font-black text-[#FAF4EB]')}>
                    {display.title}
                  </h3>

                  <div
                    className="mt-1.5 text-xs sm:text-sm text-slate-300/90 leading-relaxed break-words whitespace-pre-line"
                    dangerouslySetInnerHTML={{
                      __html: typeof display.content === 'string' ? display.content : stripNotificationHtml(display.content),
                    }}
                  />
                </div>
              </div>

              {/* Action Button */}
              <div className="flex items-center justify-end gap-2 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5 w-full sm:w-auto">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E6C17A] group-hover:underline">
                  {isEnglish ? 'View details' : 'Xem chi tiết'}
                  <ExternalLink className="size-3.5" />
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="grid size-9 place-items-center rounded-xl border border-white/10 bg-slate-900/80 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-xs font-bold text-slate-300 px-3">
            {page} / {pagination.total_pages}
          </span>
          <button
            type="button"
            disabled={page >= pagination.total_pages}
            onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
            className="grid size-9 place-items-center rounded-xl border border-white/10 bg-slate-900/80 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}

export default AdminNotificationsPage
