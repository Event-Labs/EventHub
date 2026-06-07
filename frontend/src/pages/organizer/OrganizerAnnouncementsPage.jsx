import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCircle2, Mail, Send, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, Insight, OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'
import {
  fetchOrganizerAnnouncementEvents,
  fetchOrganizerAnnouncements,
  sendOrganizerAnnouncement,
} from '@/services/notifications.js'

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
  const queryClient = useQueryClient()
  const [form, setForm] = useState(initialForm)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const eventsQuery = useQuery({
    queryKey: ['organizer-announcement-events'],
    queryFn: fetchOrganizerAnnouncementEvents,
  })

  const announcementsQuery = useQuery({
    queryKey: ['organizer-announcements'],
    queryFn: fetchOrganizerAnnouncements,
  })

  const events = eventsQuery.data || EMPTY_ITEMS
  const announcements = announcementsQuery.data || EMPTY_ITEMS
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === form.event_id),
    [events, form.event_id],
  )

  const sendMutation = useMutation({
    mutationFn: sendOrganizerAnnouncement,
    onSuccess: (data) => {
      setSuccess(`Đã gửi tới ${data.recipients} người tham dự: ${data.web_sent} web, ${data.email_sent} email.`)
      setError('')
      setForm((current) => ({ ...initialForm, event_id: current.event_id }))
      queryClient.invalidateQueries({ queryKey: ['organizer-announcements'] })
    },
    onError: (err) => {
      setSuccess('')
      setError(err.response?.data?.message || 'Không thể gửi thông báo. Vui lòng thử lại.')
    },
  })

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    setSuccess('')
    setError('')

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
      title="Gửi thông báo"
      description="Gửi cập nhật quan trọng tới người đã mua vé qua web realtime và email."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <OrganizerPanel>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-extrabold text-[#191c1e]">Thông báo mới</h3>
                <p className="mt-1 text-sm text-[#737686]">
                  Người tham dự sẽ nhận notification ngay trên web nếu đang online.
                </p>
              </div>
              <Bell className="size-6 text-primary" />
            </div>

            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="text-xs font-bold text-[#434655]">Sự kiện</span>
                <select
                  required
                  value={form.event_id}
                  onChange={update('event_id')}
                  className="mt-2 h-11 w-full rounded border border-[#c3c6d7] bg-white px-3 text-sm outline-none focus:border-primary"
                >
                  <option value="">{eventsQuery.isLoading ? 'Đang tải sự kiện...' : 'Chọn sự kiện'}</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
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
                <span className="text-xs font-bold text-[#434655]">Kênh gửi</span>
                <div className="mt-3 flex flex-wrap gap-5 text-sm font-semibold text-[#191c1e]">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.web} onChange={update('web')} className="accent-primary" />
                    <Smartphone className="size-4 text-primary" />
                    Web realtime
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.email} onChange={update('email')} className="accent-primary" />
                    <Mail className="size-4 text-primary" />
                    Email
                  </label>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-bold text-[#434655]">Nội dung</span>
                <textarea
                  required
                  minLength={5}
                  value={form.content}
                  onChange={update('content')}
                  className="mt-2 min-h-44 w-full resize-y rounded border border-[#c3c6d7] bg-white p-4 text-sm outline-none focus:border-primary"
                  placeholder="Nhập thay đổi về thời gian, địa điểm, hướng dẫn check-in hoặc cập nhật quan trọng..."
                />
              </label>

              {success && (
                <p className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm font-semibold text-green-700">
                  <CheckCircle2 className="size-4" />
                  {success}
                </p>
              )}
              {error && <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

              <button
                className="admin-primary ml-auto disabled:cursor-not-allowed disabled:opacity-60"
                disabled={sendMutation.isPending || !form.event_id || (!form.web && !form.email)}
              >
                <Send className="size-4" />
                {sendMutation.isPending ? 'Đang gửi...' : 'Gửi ngay'}
              </button>
            </form>
          </OrganizerPanel>
          <Insight title="Gợi ý vận hành">
            Với thay đổi gấp về giờ diễn, hãy bật cả Web realtime và Email để người tham dự online nhận ngay, còn người offline vẫn nhận qua hộp thư.
          </Insight>
        </div>

        <aside className="space-y-5">
          <OrganizerPanel>
            <h3 className="mb-4 text-sm font-extrabold uppercase text-[#434655]">Preview</h3>
            <div className="mx-auto max-w-72 rounded-[2rem] bg-[#111827] p-4 text-white shadow-xl">
              <div className="rounded-[1.5rem] bg-gradient-to-br from-slate-900 via-sky-900 to-blue-700 p-5">
                <p className="text-xs font-bold text-primary">EventHub</p>
                <p className="mt-6 text-xs text-slate-300">{selectedEvent?.title || 'Sự kiện đã chọn'}</p>
                <p className="mt-5 text-lg font-bold">{form.title || 'Tiêu đề thông báo'}</p>
                <p className="mt-2 line-clamp-5 text-xs leading-5 text-slate-200">
                  {form.content || 'Nội dung thông báo sẽ hiển thị tại đây.'}
                </p>
                <p className="mt-14 text-center text-3xl font-extrabold">Now</p>
              </div>
            </div>
          </OrganizerPanel>

          <OrganizerPanel>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-extrabold uppercase text-[#434655]">Lịch sử gửi</h3>
              <Badge tone="blue">{announcements.length}</Badge>
            </div>
            {announcementsQuery.isLoading && <p className="text-sm text-[#737686]">Đang tải...</p>}
            {!announcementsQuery.isLoading && announcements.length === 0 && (
              <p className="text-sm text-[#737686]">Chưa có thông báo nào.</p>
            )}
            {announcements.map((item) => (
              <div key={item.id} className="border-t border-[#e0e3e5] py-4 first:border-t-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="line-clamp-1 font-bold">{item.title}</p>
                  <Badge tone="green">Sent</Badge>
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-[#737686]">{item.event_title}</p>
                <p className="mt-1 text-xs text-[#737686]">{formatDateTime(item.sent_at || item.created_at)}</p>
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
      <span className="text-xs font-bold text-[#434655]">{label}</span>
      <input
        required
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded border border-[#c3c6d7] bg-white px-3 text-sm outline-none focus:border-primary"
      />
    </label>
  )
}
