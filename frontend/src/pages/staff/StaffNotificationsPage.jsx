import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  Inbox,
  Loader2,
  MapPin,
  QrCode,
  UserCheck,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
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
import { formatNotificationDisplay } from '@/lib/notifications.js'
import { getRememberLoginPreference, setAuthSession } from '@/lib/auth.js'
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
  const queryClient = useQueryClient()
  const toast = useToast()

  const [activeFilter, setActiveFilter] = useState('all')
  const [page, setPage] = useState(1)
  const limit = 10

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
      toast.success(
        data?.message ||
          (isEnglish ? 'Invitation accepted successfully' : 'Bạn đã đồng ý tham gia làm nhân sự sự kiện!'),
      )
      queryClient.invalidateQueries({ queryKey: ['staff-invitations', 'me'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
    onError: (err) => {
      toast.error(
        err.response?.data?.message ||
          (isEnglish ? 'Failed to accept invitation' : 'Không thể chấp nhận lời mời. Vui lòng thử lại.'),
      )
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
      toast.error(
        err.response?.data?.message ||
          (isEnglish ? 'Failed to decline invitation' : 'Không thể từ chối lời mời. Vui lòng thử lại.'),
      )
    },
  })

  const rawItems = notificationsQuery.data?.items || []
  const unreadCount = notificationsQuery.data?.unread_count || 0
  const pagination = notificationsQuery.data?.pagination || { page: 1, total: 0, total_pages: 1 }

  const invitationsList = invitationsQuery.data || []
  const invitationsById = useMemo(() => new Map(invitationsList.map((inv) => [inv.id, inv])), [invitationsList])

  const items = useMemo(() => {
    return rawItems.filter((item) => {
      if (!item) return false
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
  }, [rawItems, activeFilter])

  const FILTERS = useMemo(
    () => [
      { value: 'all', label: isEnglish ? 'All Staff Notifications' : 'Tất cả thông báo' },
      { value: 'unread', label: isEnglish ? 'Unread' : 'Chưa đọc' },
      { value: 'invitations', label: isEnglish ? 'Staff Invitations' : 'Lời mời làm Staff' },
      { value: 'assignments', label: isEnglish ? 'Duty Assignments' : 'Phân công ca trực' },
    ],
    [isEnglish],
  )

  return (
    <div className="space-y-6">
      <SectionHeader
        title={isEnglish ? 'Staff Notifications' : 'Thông báo Nhân viên sự kiện'}
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
          let display = { title: notification.title || '', content: notification.content || '', preview: '' }
          try {
            const formatted = formatNotificationDisplay(notification, isEnglish)
            if (formatted) display = formatted
          } catch (e) {
            console.error('Error formatting staff notification:', notification, e)
          }

          const isUnread = !notification.is_read
          const metaJson = parseJsonMeta(notification.content)
          const isInvitation =
            notification.title === 'STAFF_INVITATION' ||
            notification.title === 'Lời mời làm staff' ||
            notification.title === 'Staff Invitation' ||
            Boolean(metaJson.invitation_id)

          const invitationId = metaJson.invitation_id || notification.id
          const liveInvitation = invitationsById.get(invitationId)
          const currentStatus = liveInvitation?.status || metaJson.status || 'PENDING'
          const role = metaJson.staff_role || 'Staff'
          const gate = metaJson.gate
          const zone = metaJson.zone
          const sessionName = metaJson.session_name
          const expiresAt = metaJson.expires_at || liveInvitation?.expires_at

          const title = isInvitation
            ? isEnglish
              ? `Staff Invitation: ${notification.event?.title || metaJson.event_title || 'Event'}`
              : `Lời mời làm nhân sự: ${notification.event?.title || metaJson.event_title || 'Sự kiện'}`
            : display.title

          const defaultAction = notification.metadata?.action_url
            ? { to: notification.metadata.action_url, label: isEnglish ? 'View Details' : 'Xem chi tiết' }
            : notification.event_id
              ? { to: `/staff/events/${notification.event_id}`, label: isEnglish ? 'Go to event dashboard' : 'Đến trang làm việc' }
              : null

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
                    isInvitation
                      ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-400'
                      : isUnread
                        ? 'border-primary/25 bg-primary/10 text-primary'
                        : 'border-white/10 bg-slate-800 text-slate-300',
                  )}
                >
                  {isInvitation ? <UserCheck className="size-5" /> : <Bell className="size-5" />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base font-extrabold text-content sm:text-lg">
                          {title}
                        </h3>
                        {isUnread && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-primary">
                            {isEnglish ? 'New' : 'Mới'}
                          </span>
                        )}
                        {isInvitation && currentStatus === 'ACCEPTED' && (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-400">
                            {isEnglish ? 'Accepted' : 'Đã chấp nhận'}
                          </span>
                        )}
                        {isInvitation && currentStatus === 'DECLINED' && (
                          <span className="rounded-full border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-400">
                            {isEnglish ? 'Declined' : 'Đã từ chối'}
                          </span>
                        )}
                        {isInvitation && currentStatus === 'PENDING' && (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-400">
                            {isEnglish ? 'Response Required' : 'Chờ phản hồi'}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-white [html.light_&]:text-[#0D1B2A]">
                      <Clock3 className="size-4 text-white [html.light_&]:text-[#0D1B2A]" /> {formatDateTime(notification.created_at, isEnglish)}
                    </span>
                  </div>

                  {/* Body Content */}
                  {isInvitation ? (
                    <div className="mt-2.5 space-y-2">
                      <p className="text-sm sm:text-base leading-relaxed text-slate-100 font-normal">
                        {metaJson.organization_name || (isEnglish ? 'Event Organizer' : 'Ban tổ chức')} đã mời bạn tham gia hỗ trợ với vai trò{' '}
                        <strong className="text-cyan-300 font-bold">{role}</strong>.
                      </p>

                      {/* Shift details badge */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-400">
                        {sessionName && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-white/10 text-slate-200">
                            <Clock className="size-3.5 text-cyan-400" />
                            {sessionName}
                          </span>
                        )}
                        {gate && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-white/10 text-slate-200">
                            <QrCode className="size-3.5 text-cyan-400" />
                            Cổng: {gate}
                          </span>
                        )}
                        {zone && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-white/10 text-slate-200">
                            <MapPin className="size-3.5 text-cyan-400" />
                            Khu vực: {zone}
                          </span>
                        )}
                        {expiresAt && currentStatus === 'PENDING' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                            <Clock3 className="size-3.5" />
                            Hạn phản hồi: {formatDateTime(expiresAt, isEnglish)}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : typeof display.content === 'string' && /<[a-z][\s\S]*>/i.test(display.content) ? (
                    <div
                      className="mt-2.5 w-full text-sm sm:text-base leading-relaxed text-slate-100 font-normal [html.light_&]:text-[#0D1B2A] break-words [overflow-wrap:anywhere] [&_p]:break-words [&_p]:[overflow-wrap:anywhere] [&_a]:text-primary [&_a]:underline [&_a]:break-all [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full [&_img]:rounded-lg"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(display.content) }}
                    />
                  ) : (
                    <p className="mt-2.5 w-full text-sm sm:text-base leading-relaxed text-slate-100 font-normal whitespace-pre-line [html.light_&]:text-[#0D1B2A] break-words [overflow-wrap:anywhere]">
                      {display.content}
                    </p>
                  )}

                  {/* Actions Row */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {isInvitation && currentStatus === 'PENDING' && (
                      <>
                        <button
                          type="button"
                          disabled={acceptMutation.isPending || declineMutation.isPending}
                          onClick={() => acceptMutation.mutate(invitationId)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 text-xs font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/20 transition-all hover:brightness-110 active:scale-95 cursor-pointer disabled:opacity-40"
                        >
                          {acceptMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                          {isEnglish ? 'Accept & Join' : 'Đồng ý tham gia'}
                        </button>
                        <button
                          type="button"
                          disabled={declineMutation.isPending || acceptMutation.isPending}
                          onClick={() => declineMutation.mutate(invitationId)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-4 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20 active:scale-95 cursor-pointer disabled:opacity-40"
                        >
                          <X className="size-3.5" />
                          {isEnglish ? 'Decline' : 'Từ chối'}
                        </button>
                      </>
                    )}

                    {isInvitation && currentStatus === 'ACCEPTED' && notification.event_id && (
                      <Link
                        to={`/staff/events/${notification.event_id}`}
                        onClick={() => {
                          if (isUnread) markReadMutation.mutate(notification.id)
                        }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-soft/40 bg-panel-soft px-4 text-sm font-bold text-content transition hover:border-primary/50 hover:text-primary"
                      >
                        {isEnglish ? 'Go to event dashboard' : 'Đến trang làm việc'} <ChevronRight className="size-4" />
                      </Link>
                    )}

                    {!isInvitation && defaultAction && (
                      <Link
                        to={defaultAction.to}
                        onClick={() => {
                          if (isUnread) markReadMutation.mutate(notification.id)
                        }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-soft/40 bg-panel-soft px-4 text-sm font-bold text-content transition hover:border-primary/50 hover:text-primary"
                      >
                        {defaultAction.label} <ChevronRight className="size-4" />
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

export default StaffNotificationsPage
