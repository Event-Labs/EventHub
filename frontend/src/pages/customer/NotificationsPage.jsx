import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  CreditCard,
  Inbox,
  Loader2,
  Megaphone,
  UserRoundCheck,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
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
import { cn } from '@/lib/utils.js'
import { getRememberLoginPreference, setAuthSession } from '@/lib/auth.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

function isStaffInvitationNotification(notification) {
  return notification.title === 'STAFF_INVITATION' || notification.title === 'Lời mời làm staff'
}

function isStaffInvitationStoreNotification(notification) {
  return notification.title === 'STAFF_INVITATION'
}

function eventDetailPath(item) {
  const identifier = item?.event_slug || item?.event?.slug || item?.event_id
  return identifier ? `/events/${identifier}` : null
}

function parseNotificationContent(content) {
  if (!content || typeof content !== 'string' || !content.trim().startsWith('{')) return {}

  try {
    return JSON.parse(content)
  } catch {
    return {}
  }
}

function staffInvitationStatusLabel(status) {
  if (status === 'ACCEPTED') return 'Đã đồng ý'
  if (status === 'DECLINED') return 'Đã từ chối'
  return 'Đang chờ phản hồi'
}

function getStaffInvitationDetails(notification, invitationsById) {
  const invitation = invitationsById.get(notification.id)
  const meta = parseNotificationContent(notification.content)
  const status = invitation?.status || meta.status || 'PENDING'
  const role = invitation?.staff_role || meta.staff_role || 'Staff'
  const eventTitle = invitation?.event_title || notification.event?.title || 'sự kiện'
  const organizationName = invitation?.organization_name || 'Ban tổ chức'

  return {
    ...invitation,
    event_id: invitation?.event_id || notification.event_id,
    event_slug: invitation?.event_slug || notification.event?.slug,
    event_title: eventTitle,
    status,
    title: 'Lời mời làm staff',
    content: `${organizationName} mời bạn làm staff cho sự kiện "${eventTitle}" với vai trò ${role}.`,
    expires_at: invitation?.expires_at || meta.expires_at || null,
  }
}

function dedupeStaffInvitationNotifications(items) {
  const storeInviteEventIds = new Set(
    items
      .filter(isStaffInvitationStoreNotification)
      .map((item) => item.event_id)
      .filter(Boolean),
  )

  return items.filter((item) => {
    if (item.title !== 'Lời mời làm staff') return true
    return !item.event_id || !storeInviteEventIds.has(item.event_id)
  })
}

function formatDateTime(value) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function iconFor(type) {
  if (type === 'PAYMENT') return CreditCard
  if (type === 'EVENT') return CalendarDays
  if (type === 'PROMOTION') return Megaphone
  return Bell
}

const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unread', label: 'Chưa đọc' },
  { value: 'invitation', label: 'Lời mời staff' },
]

function invitationStatusStyle(status) {
  if (status === 'ACCEPTED') return 'border-success/25 bg-success/10 text-success'
  if (status === 'DECLINED') return 'border-error/25 bg-error/10 text-error'
  return 'border-warning/25 bg-warning/10 text-warning'
}

export function NotificationsPage() {
  const toast = useToast()
  const [activeFilter, setActiveFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [acceptedInvitationId, setAcceptedInvitationId] = useState(null)
  const queryClient = useQueryClient()
  const notificationsQuery = useQuery({
    queryKey: ['notifications', page, activeFilter],
    queryFn: () => fetchNotifications({
      page,
      limit: 5,
      ...(activeFilter === 'unread' ? { unread_only: true } : {}),
      category: activeFilter === 'invitation' ? 'invitation' : 'all',
    }),
  })
  const notificationTotalQuery = useQuery({
    queryKey: ['notifications', 'total'],
    queryFn: () => fetchNotifications({ page: 1, limit: 1 }),
  })
  const invitationsQuery = useQuery({
    queryKey: ['staff-invitations', 'me'],
    queryFn: fetchMyStaffInvitations,
  })

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      toast.success('Đã đánh dấu thông báo là đã đọc.')
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể đánh dấu thông báo. Vui lòng thử lại.'))
    },
  })

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      toast.success('Đã đánh dấu tất cả thông báo là đã đọc.')
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể đánh dấu tất cả thông báo. Vui lòng thử lại.'))
    },
  })

  const acceptInvitationMutation = useMutation({
    mutationFn: acceptStaffInvitation,
    onSuccess: (data, invitationId) => {
      if (data?.accessToken && data?.user) {
        setAuthSession({
          accessToken: data.accessToken,
          user: data.user,
          remember: getRememberLoginPreference(),
        })
      }
      toast.success(data?.message || 'Bạn đã nhận lời mời thành công.')
      setAcceptedInvitationId(invitationId)
      queryClient.invalidateQueries({ queryKey: ['staff-invitations', 'me'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể đồng ý lời mời. Vui lòng thử lại.'))
    },
  })

  const declineInvitationMutation = useMutation({
    mutationFn: declineStaffInvitation,
    onSuccess: () => {
      toast.success('Đã từ chối lời mời làm staff.')
      queryClient.invalidateQueries({ queryKey: ['staff-invitations', 'me'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể từ chối lời mời. Vui lòng thử lại.'))
    },
  })

  const notifications = notificationsQuery.data?.items || []
  const displayNotifications = dedupeStaffInvitationNotifications(notifications)
  const unreadCount = notificationsQuery.data?.unread_count || 0
  const pagination = notificationsQuery.data?.pagination || { page: 1, total: 0, total_pages: 1 }
  const invitations = invitationsQuery.data || []
  const invitationsById = new Map(invitations.map((invitation) => [invitation.id, invitation]))
  const invitationCount = invitations.length
  const filteredNotifications = displayNotifications

  const filterCounts = {
    all: notificationTotalQuery.data?.pagination?.total || 0,
    unread: unreadCount,
    invitation: invitationCount,
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <SectionHeader
        title="Trung tâm thông báo"
        description="Theo dõi cập nhật sự kiện, thanh toán và lời mời dành cho bạn."
        action={displayNotifications.length ? (
          <button
            type="button"
            onClick={() => markAllMutation.mutate()}
            disabled={unreadCount === 0 || markAllMutation.isPending}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border-soft/50 bg-panel-soft px-4 text-sm font-bold text-content transition hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            {markAllMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
            Đánh dấu tất cả đã đọc
          </button>
        ) : null}
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={Inbox} label="Tổng thông báo" value={filterCounts.all} tone="primary" />
        <SummaryCard icon={Bell} label="Chưa đọc" value={unreadCount} tone="warning" />
        <SummaryCard icon={UserRoundCheck} label="Lời mời staff" value={invitationCount} tone="success" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border-soft/40 bg-surface/85 shadow-[0_18px_55px_rgba(0,0,0,0.18)]">
        <div className="flex flex-col gap-3 border-b border-border-soft/30 bg-panel-soft/35 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-[#07122b]/60 p-1">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => {
                  setActiveFilter(filter.value)
                  setPage(1)
                }}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-bold transition',
                  activeFilter === filter.value
                    ? 'bg-primary text-[#071226] shadow-sm'
                    : 'text-subtle hover:bg-white/5 hover:text-content',
                )}
              >
                {filter.label}
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                  activeFilter === filter.value ? 'bg-[#071226]/15' : 'bg-white/5 text-muted',
                )}>
                  {filterCounts[filter.value]}
                </span>
              </button>
            ))}
          </div>
          <p className="px-1 text-xs font-semibold text-muted">
            Trang {pagination.page}/{Math.max(1, pagination.total_pages)} · {pagination.total} thông báo
          </p>
        </div>

        {notificationsQuery.isLoading && <StatePanel message="Đang tải thông báo..." loading />}
        {notificationsQuery.isError && <StatePanel message="Không thể tải thông báo." tone="error" />}
        {!notificationsQuery.isLoading && displayNotifications.length === 0 && (
          <StatePanel message="Bạn chưa có thông báo nào." />
        )}
        {!notificationsQuery.isLoading && displayNotifications.length > 0 && filteredNotifications.length === 0 && (
          <StatePanel message="Không có thông báo phù hợp với bộ lọc này." />
        )}

        <div className="divide-y divide-border-soft/25">
        {filteredNotifications.map((notification) => {
          const Icon = iconFor(notification.type)
          const isInvitation = isStaffInvitationNotification(notification)
          const invitationDetails = isInvitation ? getStaffInvitationDetails(notification, invitationsById) : null
          const eventPath = eventDetailPath(invitationDetails || notification)
          const title = invitationDetails?.title || notification.title
          const content = invitationDetails?.content || notification.content
          const invitationStatus = invitationDetails?.status
          const canRespondToInvitation = isStaffInvitationStoreNotification(notification) && invitationStatus === 'PENDING'
          const canOpenStaffPortal = isStaffInvitationStoreNotification(notification)
            && (invitationStatus === 'ACCEPTED'
              || (acceptedInvitationId === notification.id && acceptInvitationMutation.isSuccess))

          return (
            <article
              key={notification.id}
              className={cn(
                'group relative px-4 py-5 transition-colors sm:px-6',
                notification.is_read
                  ? 'bg-transparent hover:bg-panel-soft/25'
                  : 'bg-primary/[0.07] hover:bg-primary/[0.1]',
              )}
            >
              {!notification.is_read && <span className="absolute left-0 top-0 h-full w-1 bg-primary" />}
              <div className="flex gap-3 sm:gap-4">
                <span className={cn(
                  'grid size-11 shrink-0 place-items-center rounded-xl border sm:size-12',
                  isInvitation
                    ? 'border-ai/25 bg-ai/10 text-ai'
                    : 'border-primary/25 bg-primary/10 text-primary',
                )}>
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base font-extrabold text-content sm:text-lg">
                        {title}
                        </h3>
                        {!notification.is_read && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-primary">Mới</span>
                        )}
                        {invitationStatus && (
                          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide', invitationStatusStyle(invitationStatus))}>
                            {staffInvitationStatusLabel(invitationStatus)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 max-w-3xl text-sm leading-6 text-subtle">{content}</p>
                      {invitationDetails?.expires_at && invitationStatus === 'PENDING' && (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
                          <Clock3 className="size-3.5" /> Hết hạn {formatDateTime(invitationDetails.expires_at)}
                        </p>
                      )}
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted">
                      <Clock3 className="size-3.5" /> {formatDateTime(notification.created_at)}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {eventPath && (
                      <Link className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-soft/40 bg-panel-soft px-3 text-sm font-bold text-content transition hover:border-primary/50 hover:text-primary" to={eventPath}>
                        Xem sự kiện <ChevronRight className="size-4" />
                      </Link>
                    )}
                    {canRespondToInvitation && (
                      <>
                        <button
                          type="button"
                          onClick={() => acceptInvitationMutation.mutate(notification.id)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-success px-3.5 text-sm font-extrabold text-[#061225] transition hover:brightness-110 disabled:opacity-60"
                          disabled={acceptInvitationMutation.isPending || declineInvitationMutation.isPending}
                        >
                          <Check className="size-4" /> Đồng ý lời mời
                        </button>
                        <button
                          type="button"
                          onClick={() => declineInvitationMutation.mutate(notification.id)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-error/30 px-3.5 text-sm font-bold text-error transition hover:bg-error/10 disabled:opacity-60"
                          disabled={acceptInvitationMutation.isPending || declineInvitationMutation.isPending}
                        >
                          <X className="size-4" /> Từ chối
                        </button>
                      </>
                    )}
                    {canOpenStaffPortal && (
                      <Link
                        to={acceptInvitationMutation.data?.staff_portal_url || '/staff'}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-extrabold text-[#081126] transition hover:brightness-110"
                      >
                        <UserRoundCheck className="size-4" /> Mở trang nhân sự
                      </Link>
                    )}
                    {!notification.is_read && (
                      <button
                        type="button"
                        onClick={() => markReadMutation.mutate(notification.id)}
                        className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-muted transition hover:bg-white/5 hover:text-content"
                      >
                        <CheckCheck className="size-4" /> Đã đọc
                      </button>
                    )}
                  </div>
                  {acceptedInvitationId === notification.id && acceptInvitationMutation.isSuccess && (
                    <div className="mt-4 rounded-xl border border-success/25 bg-success/[0.07] px-4 py-3 text-sm">
                      <p className="font-semibold text-primary">
                        {acceptInvitationMutation.data?.message || 'Bạn đã nhận lời mời thành công.'}
                      </p>
                      <p className="mt-1 text-muted">
                        Bạn có thể mở cổng nhân sự để xem sự kiện được giao, công việc và công cụ check-in.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </article>
          )
        })}
        </div>

        {pagination.total_pages > 1 && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.total_pages}
            onPageChange={setPage}
          />
        )}
      </section>
    </div>
  )
}

function Pagination({ page, totalPages, onPageChange }) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((item) => item === 1 || item === totalPages || Math.abs(item - page) <= 1)

  return (
    <nav className="flex items-center justify-between gap-3 border-t border-border-soft/30 bg-panel-soft/25 px-4 py-4 sm:px-6" aria-label="Phân trang thông báo">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="h-9 rounded-lg border border-border-soft/40 px-3 text-sm font-bold text-subtle transition hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
      >
        Trước
      </button>
      <div className="flex items-center gap-1">
        {pages.map((item, index) => (
          <div key={item} className="flex items-center gap-1">
            {index > 0 && item - pages[index - 1] > 1 && <span className="px-1 text-muted">…</span>}
            <button
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={item === page ? 'page' : undefined}
              className={cn(
                'grid size-9 place-items-center rounded-lg text-sm font-extrabold transition',
                item === page ? 'bg-primary text-[#071226]' : 'text-subtle hover:bg-white/5 hover:text-content',
              )}
            >
              {item}
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="h-9 rounded-lg border border-border-soft/40 px-3 text-sm font-bold text-subtle transition hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
      >
        Sau
      </button>
    </nav>
  )
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  const tones = {
    primary: 'border-primary/20 bg-primary/[0.07] text-primary',
    warning: 'border-warning/20 bg-warning/[0.07] text-warning',
    success: 'border-success/20 bg-success/[0.07] text-success',
  }
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border p-4', tones[tone])}>
      <span className="grid size-10 place-items-center rounded-xl bg-current/10">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-subtle">{label}</p>
        <p className="mt-0.5 text-2xl font-black text-content">{value}</p>
      </div>
    </div>
  )
}

function StatePanel({ message, tone = 'default', loading = false }) {
  return (
    <div className={cn('flex min-h-64 flex-col items-center justify-center p-8 text-center', tone === 'error' ? 'text-error' : 'text-muted')}>
      {loading ? <Loader2 className="mb-4 size-8 animate-spin text-primary" /> : <Inbox className="mb-4 size-10 opacity-50" />}
      <p className="text-sm font-semibold">{message}</p>
    </div>
  )
}
