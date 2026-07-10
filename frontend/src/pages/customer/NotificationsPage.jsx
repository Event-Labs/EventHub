import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CalendarDays, CheckCheck, CreditCard, Megaphone } from 'lucide-react'
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

export function NotificationsPage() {
  const toast = useToast()
  const [acceptedInvitationId, setAcceptedInvitationId] = useState(null)
  const queryClient = useQueryClient()
  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications({ limit: 50 }),
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
  const invitations = invitationsQuery.data || []
  const invitationsById = new Map(invitations.map((invitation) => [invitation.id, invitation]))

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeader
        title="Thông báo"
        description={`${unreadCount} thông báo chưa đọc`}
        action={displayNotifications.length ? (
          <button
            type="button"
            onClick={() => markAllMutation.mutate()}
            className="inline-flex items-center gap-2 rounded-md border border-primary/40 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/10"
          >
            <CheckCheck className="size-4" />
            Đánh dấu đã đọc
          </button>
        ) : null}
      />

      {notificationsQuery.isLoading && <StatePanel message="Đang tải thông báo..." />}
      {notificationsQuery.isError && <StatePanel message="Không thể tải thông báo." tone="error" />}
      {!notificationsQuery.isLoading && displayNotifications.length === 0 && (
        <StatePanel message="Bạn chưa có thông báo nào." />
      )}

      <div className="space-y-3">
        {displayNotifications.map((notification) => {
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
                'rounded-lg border p-5 transition',
                notification.is_read
                  ? 'border-border-soft bg-panel'
                  : 'border-primary/50 bg-primary/10',
              )}
            >
              <div className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-display text-lg font-bold text-white">
                        {title}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-muted">{content}</p>
                      {invitationStatus && (
                        <p className="mt-2 text-xs font-bold text-primary">
                          {staffInvitationStatusLabel(invitationStatus)}
                        </p>
                      )}
                      {invitationDetails?.expires_at && invitationStatus === 'PENDING' && (
                        <p className="mt-1 text-xs text-subtle">
                          Hết hạn: {formatDateTime(invitationDetails.expires_at)}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-subtle">{formatDateTime(notification.created_at)}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {eventPath && (
                      <Link className="text-sm font-bold text-primary hover:text-sky-300" to={eventPath}>
                        Xem sự kiện
                      </Link>
                    )}
                    {canRespondToInvitation && (
                      <>
                        <button
                          type="button"
                          onClick={() => acceptInvitationMutation.mutate(notification.id)}
                          className="text-sm font-bold text-primary hover:text-sky-300 disabled:opacity-60"
                          disabled={acceptInvitationMutation.isPending || declineInvitationMutation.isPending}
                        >
                          Đồng ý
                        </button>
                        <button
                          type="button"
                          onClick={() => declineInvitationMutation.mutate(notification.id)}
                          className="text-sm font-bold text-subtle hover:text-primary disabled:opacity-60"
                          disabled={acceptInvitationMutation.isPending || declineInvitationMutation.isPending}
                        >
                          Từ chối
                        </button>
                      </>
                    )}
                    {canOpenStaffPortal && (
                      <Link
                        to={acceptInvitationMutation.data?.staff_portal_url || '/staff'}
                        className="inline-flex items-center rounded-full border border-primary/40 px-4 py-2 text-sm font-extrabold text-primary transition hover:border-primary hover:bg-primary hover:text-[#081126]"
                      >
                        Trang nhân sự
                      </Link>
                    )}
                    {!notification.is_read && (
                      <button
                        type="button"
                        onClick={() => markReadMutation.mutate(notification.id)}
                        className="text-sm font-bold text-subtle hover:text-primary"
                      >
                        Đánh dấu đã đọc
                      </button>
                    )}
                  </div>
                  {acceptedInvitationId === notification.id && acceptInvitationMutation.isSuccess && (
                    <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
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
    </div>
  )
}

function StatePanel({ message, tone = 'default' }) {
  return (
    <div className={`rounded-lg border p-6 text-center ${tone === 'error' ? 'border-error/40 bg-error/10 text-error' : 'border-border-soft bg-panel text-muted'}`}>
      {message}
    </div>
  )
}
