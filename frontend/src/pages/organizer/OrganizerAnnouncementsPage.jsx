import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Mail, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'
import {
  fetchOrganizerAnnouncementEvents,
  fetchOrganizerAnnouncements,
  sendOrganizerAnnouncement,
} from '@/services/notifications.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

function formatDateTime(value) {
  if (!value) return 'Chưa gửi'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const initialForm = {
  event_id: '',
  title: '',
  content: '',
  web: true,
  email: true,
}

const EMPTY_ITEMS = []

export function OrganizerAnnouncementsPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(initialForm)

  const eventsQuery = useQuery({
    queryKey: ['organizer-announcement-events'],
    queryFn: fetchOrganizerAnnouncementEvents,
  })

  const announcementsQuery = useQuery({
    queryKey: ['organizer-announcements'],
    queryFn: fetchOrganizerAnnouncements,
  })

  const rawEvents = eventsQuery.data || EMPTY_ITEMS
  const events = useMemo(
    () => rawEvents.filter((e) => !e.status || e.status === 'PUBLISHED'),
    [rawEvents],
  )
  const announcements = announcementsQuery.data || EMPTY_ITEMS
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === form.event_id),
    [events, form.event_id],
  )

  const sendMutation = useMutation({
    mutationFn: sendOrganizerAnnouncement,
    onSuccess: (data) => {
      toast.success(`Đã gửi tới ${data.recipients} người tham dự: ${data.web_sent} web, ${data.email_sent} email.`)
      setForm((current) => ({ ...initialForm, event_id: current.event_id }))
      queryClient.invalidateQueries({ queryKey: ['organizer-announcements'] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể gửi thông báo. Vui lòng thử lại.'))
    },
  })

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const channels = [
      form.web ? 'web' : null,
      form.email ? 'email' : null,
    ].filter(Boolean)

    sendMutation.mutate({
      event_id: form.event_id,
      title: form.title.trim(),
      content: form.content.trim(),
      channels,
    })
  }

  return (
    <OrganizerPage
      title="Gửi Thông báo"
      description="Gửi cập nhật quan trọng tới người đã mua vé qua hệ thống và email"
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <OrganizerPanel>
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="block text-base font-bold text-white mb-1.5">Sự kiện</span>
                <select
                  required
                  value={form.event_id}
                  onChange={update('event_id')}
                  className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm font-medium text-white outline-none focus:border-primary shadow-sm"
                >
                  <option value="" className="bg-[#0b1329] text-white">{eventsQuery.isLoading ? 'Đang tải sự kiện...' : 'Chọn sự kiện'}</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id} className="bg-[#0b1329] text-white">
                      {event.title}
                    </option>
                  ))}
                </select>
              </label>

              <Field
                label="Tiêu đề"
                value={form.title}
                onChange={update('title')}
                placeholder="Ví dụ: Thay đổi thời gian check-in"
              />

              <div>
                <span className="block text-base font-bold text-white mb-1.5">Kênh gửi</span>
                <div className="mt-2 flex flex-wrap gap-5 text-sm font-semibold text-content">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.web} onChange={update('web')} className="accent-primary" />
                    Website
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.email} onChange={update('email')} className="accent-primary" />
                    Email
                  </label>
                </div>
              </div>

              <label className="block">
                <span className="block text-base font-bold text-white mb-1.5">Nội dung</span>
                <textarea
                  required
                  minLength={5}
                  value={form.content}
                  onChange={update('content')}
                  className="mt-1 min-h-44 w-full resize-y rounded-xl border border-border-soft/40 bg-panel-soft p-4 text-sm text-content outline-none focus:border-primary placeholder:text-muted"
                  placeholder="Nhập thay đổi về thời gian, địa điểm, hướng dẫn check-in hoặc cập nhật quan trọng..."
                />
              </label>

              <button
                className="org-btn-primary ml-auto h-12 px-8 text-base font-bold shadow-md hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                disabled={sendMutation.isPending || !form.event_id || (!form.web && !form.email)}
              >
                {sendMutation.isPending ? 'Đang gửi...' : 'Gửi ngay'}
              </button>
            </form>
          </OrganizerPanel>
        </div>

        <aside className="space-y-5">
          <div>
            <h3 className="mb-3 text-base font-extrabold uppercase text-white">Xem trước</h3>
            <div className="rounded-2xl border border-border-soft/30 bg-gradient-to-br from-slate-900 via-sky-950 to-blue-900 p-5 text-white shadow-xl min-h-[280px] flex flex-col">
              <p className="text-xs font-bold text-primary tracking-wide">EventHub</p>
              <p className="mt-3 text-sm font-medium text-white/80 line-clamp-2 leading-snug">
                {selectedEvent?.title || 'Sự kiện đã chọn'}
              </p>
              <p className="mt-2.5 text-lg font-bold text-white line-clamp-2 leading-snug">
                {form.title || 'Tiêu đề thông báo'}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/90 whitespace-pre-wrap flex-1 line-clamp-6">
                {form.content || 'Nội dung thông báo sẽ hiển thị tại đây'}
              </p>
            </div>
          </div>

          <OrganizerPanel>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-extrabold uppercase text-subtle">Lịch sử gửi</h3>
              <Badge tone="blue">{announcements.length}</Badge>
            </div>
            {announcementsQuery.isLoading && <p className="text-sm text-muted">Đang tải...</p>}
            {!announcementsQuery.isLoading && announcements.length === 0 && (
              <p className="text-sm text-muted">Chưa có thông báo nào.</p>
            )}
            {announcements.map((item) => (
              <div key={item.id} className="border-t border-border-soft/20 py-4 first:border-t-0 text-content">
                <div className="flex items-center justify-between gap-3">
                  <p className="line-clamp-1 font-bold">{item.title}</p>
                  <Badge tone="green">Đã gửi</Badge>
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-muted">{item.event_title}</p>
                <p className="mt-1 text-xs text-muted">{formatDateTime(item.sent_at || item.created_at)}</p>
              </div>
            ))}
          </OrganizerPanel>
        </aside>
      </div>
    </OrganizerPage>
  )
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="block text-base font-bold text-white mb-1.5">{label}</span>
      <input
        required
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="mt-1 h-11 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary placeholder:text-muted"
      />
    </label>
  )
}
