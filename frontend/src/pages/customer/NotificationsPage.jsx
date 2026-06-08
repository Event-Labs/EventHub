import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CalendarDays, CheckCheck, CreditCard, Megaphone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications.js'
import { cn } from '@/lib/utils.js'

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
  const queryClient = useQueryClient()
  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications({ limit: 50 }),
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

  const notifications = notificationsQuery.data?.items || []
  const unreadCount = notificationsQuery.data?.unread_count || 0

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeader
        title="Thông báo"
        description={`${unreadCount} thông báo chưa đọc`}
        action={notifications.length ? (
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
      {!notificationsQuery.isLoading && notifications.length === 0 && (
        <StatePanel message="Bạn chưa có thông báo nào." />
      )}

      <div className="space-y-3">
        {notifications.map((notification) => {
          const Icon = iconFor(notification.type)
          const eventPath = notification.event?.slug
            ? `/events/${notification.event.slug}`
            : notification.event_id
              ? `/events/${notification.event_id}`
              : null

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
                        {notification.title}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-muted">{notification.content}</p>
                    </div>
                    <span className="shrink-0 text-xs text-subtle">{formatDateTime(notification.created_at)}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {eventPath && (
                      <Link className="text-sm font-bold text-primary hover:text-sky-300" to={eventPath}>
                        Xem sự kiện
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
