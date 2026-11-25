import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Calendar,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Inbox,
  Loader2,
  MapPin,
  QrCode,
  UserCheck,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications.js'
import {
  acceptStaffInvitation,
  declineStaffInvitation,
  fetchMyStaffInvitations,
} from '@/services/operations.js'
import { formatNotificationDisplay, stripNotificationHtml } from '@/lib/notifications.js'
import { getRememberLoginPreference, setAuthSession } from '@/lib/auth.js'
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

function parseJsonMeta(content) {
  if (!content || typeof content !== 'string' || !content.trim().startsWith('{')) return {}
  try {
    return JSON.parse(content)
  } catch {
    return {}
  }
}

export function StaffNotificationsPage() {
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
    queryKey: ['notifications', 'staff', { page, activeFilter }],
    queryFn: () =>
      fetchNotifications({
        page,
        limit,
        unread_only: activeFilter === 'unread',
        target_role: 'STAFF',
      }),
  })

  const invitationsQuery = useQuery({
    queryKey: ['staff-invitations', 'me'],
    queryFn: fetchMyStaffInvitations,
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
    mutationFn: () => markAllNotificationsRead({ target_role: 'STAFF' }),
    onSuccess: () => {
      toast.success(isEnglish ? 'Marked all as read' : 'Đã đánh dấu tất cả là đã đọc')
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const acceptMutation = useMutation({
    mutationFn: acceptStaffInvitation,
    onSuccess: (data) => {
      if (data?.accessToken && data?.user) {
        setAuthSession({
          accessToken: data.accessToken,
          user: data.user,
          remember: getRememberLoginPreference(),
        })
      }
      toast.success(data?.message || (isEnglish ? 'Invitation accepted successfully' : 'Bạn đã đồng ý tham gia làm nhân sự sự kiện!'))
      queryClient.invalidateQueries({ queryKey: ['staff-invitations', 'me'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || (isEnglish ? 'Failed to accept invitation' : 'Không thể chấp nhận lời mời. Vui lòng thử lại.'))
    },
  })

  const declineMutation = useMutation({
    mutationFn: declineStaffInvitation,
    onSuccess: () => {
      toast.success(isEnglish ? 'Declined invitation' : 'Đã từ chối lời mời làm staff')
      queryClient.invalidateQueries({ queryKey: ['staff-invitations', 'me'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || (isEnglish ? 'Failed to decline invitation' : 'Không thể từ chối lời mời. Vui lòng thử lại.'))
    },
  })

  const rawItems = notificationsQuery.data?.items || []
  const unreadCount = notificationsQuery.data?.unread_count || 0
  const pagination = notificationsQuery.data?.pagination || { page: 1, total: 0, total_pages: 1 }

  const invitationsList = invitationsQuery.data || []
  const invitationsById = new Map(invitationsList.map((inv) => [inv.id, inv]))

  const items = rawItems.filter((item) => {
    if (activeFilter === 'all' || activeFilter === 'unread') return true
    const title = (item.title || '').toLowerCase()
    if (activeFilter === 'invitations') {
      return title.includes('lời mời') || title.includes('invitation')
    }
    if (activeFilter === 'assignments') {
      return title.includes('phân công') || title.includes('nhiệm vụ') || title.includes('ca trực')
    }
    return true
  })

  const handleNotificationClick = (item) => {
    if (!item.is_read) {
      markReadMutation.mutate(item.id)
    }
    const meta = item.metadata || {}
    if (meta.action_url && !meta.action_url.includes('/notifications')) {
      navigate(meta.action_url)
      return
    }
    if (item.event_id) {
      navigate(`/staff/events/${item.event_id}`)
      return
    }
  }

  const FILTERS = [
    { value: 'all', label: isEnglish ? 'All Staff Notifications' : 'Tất cả thông báo' },
    { value: 'unread', label: isEnglish ? 'Unread' : 'Chưa đọc' },
    { value: 'invitations', label: isEnglish ? 'Staff Invitations' : 'Lời mời làm Staff' },
    { value: 'assignments', label: isEnglish ? 'Duty Assignments' : 'Phân công ca trực' },
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
            {isEnglish ? 'Staff Notifications' : 'Thông báo Nhân viên sự kiện'}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            {isEnglish
              ? 'Respond to staff invitations and view your assigned shifts and check-in gates.'
              : 'Phản hồi lời mời làm nhân sự, theo dõi ca trực và cổng soát vé được phân công.'}
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
      <div className="space-y-4">
        {notificationsQuery.isLoading && (
          <div className="flex flex-col items-center justify-center p-12 rounded-2xl border border-white/10 bg-slate-900/50">
            <Loader2 className="size-8 animate-spin text-cyan-400" />
            <p className="mt-3 text-xs text-slate-400">{isEnglish ? 'Loading notifications...' : 'Đang tải thông báo...'}</p>
          </div>
        )}

        {notificationsQuery.isError && (
          <div className="flex flex-col items-center justify-center p-12 rounded-2xl border border-red-500/20 bg-red-500/10 text-center">
            <Inbox className="size-12 text-red-400 mb-3" />
            <h3 className="text-sm font-bold text-white">{isEnglish ? 'Failed to load notifications' : 'Không thể tải thông báo'}</h3>
            <p className="mt-1 text-xs text-slate-400 max-w-sm mb-4">
              {notificationsQuery.error?.message || (isEnglish ? 'An error occurred while fetching notifications.' : 'Đã có lỗi xảy ra khi tải danh sách thông báo.')}
            </p>
            <button
              type="button"
              onClick={() => notificationsQuery.refetch()}
              className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold hover:bg-cyan-400 transition"
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
                ? 'You do not have any staff-related notifications at this time.'
                : 'Hiện tại bạn chưa có thông báo nhân sự nào.'}
            </p>
          </div>
        )}

        {items.map((item) => {
          let display = { title: item.title || '', content: item.content || '', preview: '' }
          try {
            const formatted = formatNotificationDisplay(item, isEnglish)
            if (formatted) display = formatted
          } catch (e) {
            console.error('Error formatting staff notification:', item, e)
          }
          const isUnread = !item.is_read
          const metaJson = parseJsonMeta(item.content)
          const isInvitation =
            item.title === 'STAFF_INVITATION' ||
            item.title === 'Lời mời làm staff' ||
            item.title === 'Staff Invitation' ||
            Boolean(metaJson.invitation_id)

          const invitationId = metaJson.invitation_id || item.id
          const liveInvitation = invitationsById.get(invitationId)
          const currentStatus = liveInvitation?.status || metaJson.status || 'PENDING'
          const role = metaJson.staff_role || 'Staff'
          const gate = metaJson.gate
          const zone = metaJson.zone
          const sessionName = metaJson.session_name
          const expiresAt = metaJson.expires_at || liveInvitation?.expires_at

          return (
            <div
              key={item.id}
              id={`notification-${item.id}`}
              onClick={() => handleNotificationClick(item)}
              className={cn(
                'group relative flex flex-col gap-4 p-5 rounded-2xl border transition-all cursor-pointer backdrop-blur-sm',
                isUnread
                  ? 'border-[#C99A47]/40 bg-gradient-to-r from-[#C99A47]/10 via-[#0f1b33] to-[#0f1b33] shadow-lg shadow-[#C99A47]/5 hover:border-[#C99A47]/70'
                  : 'border-white/10 bg-slate-900/60 hover:bg-slate-900/90 hover:border-white/20',
              )}
            >
              <div className="flex items-start gap-4 min-w-0">
                <div
                  className={cn(
                    'grid size-11 rounded-xl place-items-center shrink-0 border transition-transform group-hover:scale-105',
                    isUnread
                      ? 'bg-gradient-to-br from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] border-[#E6C17A]/50 shadow-md shadow-[#C99A47]/30'
                      : 'bg-slate-800 text-slate-300 border-white/10',
                  )}
                >
                  {isInvitation ? <UserCheck className="size-5" /> : <Bell className="size-5" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      STAFF
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
                    {isInvitation
                      ? (isEnglish
                          ? `Staff Invitation: ${item.event?.title || metaJson.event_title || 'Event'}`
                          : `Lời mời làm nhân sự: ${item.event?.title || metaJson.event_title || 'Sự kiện'}`)
                      : display.title}
                  </h3>

                  {isInvitation ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs sm:text-sm text-slate-300">
                        {metaJson.organization_name || 'Ban tổ chức'} đã mời bạn tham gia hỗ trợ với vai trò{' '}
                        <strong className="text-cyan-300">{role}</strong>.
                      </p>

                      {/* Shift details badge */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-400">
                        {sessionName && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-white/10 text-slate-200">
                            <Clock className="size-3.5 text-cyan-400" />
                            {sessionName}
                          </span>
                        )}
                        {gate && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-white/10 text-slate-200">
                            <QrCode className="size-3.5 text-cyan-400" />
                            Cổng: {gate}
                          </span>
                        )}
                        {zone && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-white/10 text-slate-200">
                            <MapPin className="size-3.5 text-cyan-400" />
                            Khu vực: {zone}
                          </span>
                        )}
                        {expiresAt && (
                          <span className="text-[11px] text-slate-400">
                            Hạn phản hồi: {formatDateTime(expiresAt, isEnglish)}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-xs sm:text-sm text-slate-300/90 leading-relaxed break-words whitespace-pre-line">
                      {display.preview || stripNotificationHtml(display.content)}
                    </p>
                  )}
                </div>
              </div>

              {/* Action row for invitations */}
              {isInvitation && (
                <div
                  className="flex items-center justify-between gap-3 pt-3 mt-1 border-t border-white/10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-xs">
                    {currentStatus === 'ACCEPTED' && (
                      <span className="inline-flex items-center gap-1.5 font-bold text-emerald-400">
                        <Check className="size-4" />
                        {isEnglish ? 'Accepted' : 'Đã chấp nhận'}
                      </span>
                    )}
                    {currentStatus === 'DECLINED' && (
                      <span className="inline-flex items-center gap-1.5 font-bold text-rose-400">
                        <X className="size-4" />
                        {isEnglish ? 'Declined' : 'Đã từ chối'}
                      </span>
                    )}
                    {currentStatus === 'PENDING' && (
                      <span className="text-slate-400 font-medium">
                        {isEnglish ? 'Response required' : 'Vui lòng xác nhận tham gia'}
                      </span>
                    )}
                  </div>

                  {currentStatus === 'PENDING' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={declineMutation.isPending || acceptMutation.isPending}
                        onClick={() => declineMutation.mutate(invitationId)}
                        className="inline-flex h-9 items-center gap-1.5 px-4 rounded-xl text-xs font-bold border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-40"
                      >
                        <X className="size-3.5" />
                        {isEnglish ? 'Decline' : 'Từ chối'}
                      </button>
                      <button
                        type="button"
                        disabled={acceptMutation.isPending || declineMutation.isPending}
                        onClick={() => acceptMutation.mutate(invitationId)}
                        className="inline-flex h-9 items-center gap-1.5 px-5 rounded-xl text-xs font-black bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-md shadow-[#C99A47]/25 hover:opacity-90 transition disabled:opacity-40"
                      >
                        {acceptMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        {isEnglish ? 'Accept & Join' : 'Đồng ý tham gia'}
                      </button>
                    </div>
                  )}

                  {currentStatus === 'ACCEPTED' && item.event_id && (
                    <Link
                      to={`/staff/events/${item.event_id}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#E6C17A] hover:underline"
                    >
                      {isEnglish ? 'Go to event dashboard' : 'Đến trang làm việc'}
                      <ExternalLink className="size-3.5" />
                    </Link>
                  )}
                </div>
              )}
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

export default StaffNotificationsPage
