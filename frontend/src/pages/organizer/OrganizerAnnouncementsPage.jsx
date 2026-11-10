import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CheckCircle2,
  FileText,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Mail,
  Paperclip,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Badge, OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'
import {
  fetchOrganizerAnnouncementEvents,
  fetchOrganizerAnnouncements,
  sendOrganizerAnnouncement,
} from '@/services/notifications.js'
import { uploadAnnouncementAttachment } from '@/services/uploads.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import RichTextEditor from '@/components/RichTextEditor.jsx'

const getAutoLocale = () =>
  ((typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
   (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en'))
    ? 'en-US'
    : 'vi-VN'

function formatDateTime(value) {
  const isEn = getAutoLocale() === 'en-US'
  if (!value) return isEn ? 'Not sent' : 'Chưa gửi'
  return new Intl.DateTimeFormat(getAutoLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function getFileIcon(name = '') {
  const ext = name.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) {
    return <ImageIcon className="size-4 text-emerald-400 shrink-0" />
  }
  return <FileText className="size-4 text-sky-400 shrink-0" />
}

const initialForm = {
  event_id: '',
  title: '',
  content: '',
  web: true,
  email: true,
}

const EMPTY_ITEMS = []

/** Strip all HTML tags to get plain text length for validation */
function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

export function OrganizerAnnouncementsPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(initialForm)
  const [attachments, setAttachments] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

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
    () =>
      rawEvents.filter(
        (e) =>
          ['PUBLISHED', 'COMPLETED', 'CANCELLED'].includes(e.status) ||
          Number(e.paid_orders_count || 0) > 0 ||
          (e.status !== 'DRAFT' && e.status !== 'PENDING_REVIEW') ||
          !e.status
      ),
    [rawEvents],
  )
  const announcements = announcementsQuery.data || EMPTY_ITEMS
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === form.event_id),
    [events, form.event_id],
  )

  const plainContent = useMemo(() => stripHtml(form.content), [form.content])
  const isContentEmpty = plainContent.length < 5

  const sendMutation = useMutation({
    mutationFn: sendOrganizerAnnouncement,
    onSuccess: (data) => {
      const recipientCount = Number(data?.recipients || 0)
      if (recipientCount > 0) {
        toast.success(`Đã gửi thông báo thành công tới ${recipientCount} người tham dự!`)
      } else {
        toast.success('Đã gửi thông báo thành công!')
      }
      setForm((current) => ({ ...initialForm, event_id: current.event_id }))
      setAttachments([])
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

  const handleContentChange = useCallback((value) => {
    setForm((current) => ({ ...current, content: value }))
  }, [])

  const handleImageUpload = useCallback(
    async (file) => {
      try {
        const uploaded = await uploadAnnouncementAttachment(file)
        return uploaded?.path || uploaded?.url
      } catch (err) {
        toast.error('Không thể tải ảnh lên. Vui lòng thử lại.')
        throw err
      }
    },
    [toast],
  )

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    setIsUploading(true)
    try {
      for (const file of files) {
        const uploaded = await uploadAnnouncementAttachment(file)
        if (uploaded) {
          setAttachments((prev) => [
            ...prev,
            {
              filename: uploaded.filename,
              path: uploaded.path,
              size: uploaded.size,
              contentType: uploaded.contentType,
            },
          ])
        }
      }
      toast.success(`Đã đính kèm ${files.length} tệp thành công`)
    } catch (err) {
      toast.error(err.message || 'Không thể tải tệp lên')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeAttachment = (indexToRemove) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!form.event_id) {
      toast.error('Vui lòng chọn sự kiện cần gửi thông báo.')
      return
    }

    if (isContentEmpty) {
      toast.error('Nội dung thông báo phải có ít nhất 5 ký tự.')
      return
    }

    const channels = [
      form.web ? 'web' : null,
      form.email ? 'email' : null,
    ].filter(Boolean)

    if (channels.length === 0) {
      toast.error('Vui lòng chọn ít nhất một kênh gửi (Website hoặc Email).')
      return
    }

    sendMutation.mutate({
      event_id: form.event_id,
      title: form.title.trim(),
      content: form.content,
      attachments,
      channels,
    })
  }

  return (
    <OrganizerPage
      title="Gửi Thông báo"
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <OrganizerPanel>
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="block text-base font-bold text-white mb-1.5 [html.light_&]:text-[#0D1B2A]">Sự kiện</span>
                <select
                  required
                  value={form.event_id}
                  onChange={update('event_id')}
                  className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm font-medium text-white outline-none focus:border-primary shadow-sm [html.light_&]:bg-white/90 [html.light_&]:text-[#0D1B2A] [html.light_&]:border-[#C99A47]/35"
                >
                  <option value="" className="bg-[#0b1329] text-white [html.light_&]:bg-white [html.light_&]:text-[#0D1B2A]">{eventsQuery.isLoading ? 'Đang tải sự kiện...' : 'Chọn sự kiện'}</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id} className="bg-[#0b1329] text-white [html.light_&]:bg-white [html.light_&]:text-[#0D1B2A]">
                      {event.title}{event.status === 'COMPLETED' ? ' (Đã kết thúc)' : ''}
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
                <span className="block text-base font-bold text-white mb-1.5 [html.light_&]:text-[#0D1B2A]">Kênh gửi</span>
                <div className="mt-2 flex flex-wrap gap-5 text-sm font-semibold text-content [html.light_&]:text-[#1B365D]">
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

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="block text-base font-bold text-white [html.light_&]:text-[#0D1B2A]">Nội dung</span>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.webp,.zip,.rar"
                  />

                  {/* Compact attachment icon button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E6C17A] hover:text-[#C99A47] transition cursor-pointer disabled:opacity-50 py-1 px-2 rounded-md hover:bg-[#C99A47]/10"
                    title="Đính kèm tệp (Word, PDF, Excel, ảnh, zip...)"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="size-4 animate-spin text-[#E6C17A]" />
                        <span>Đang tải tệp...</span>
                      </>
                    ) : (
                      <>
                        <Paperclip className="size-4 text-[#E6C17A]" />
                        <span>Đính kèm tệp</span>
                      </>
                    )}
                  </button>
                </div>

                <RichTextEditor
                  value={form.content}
                  onChange={handleContentChange}
                  onImageUpload={handleImageUpload}
                  placeholder="Nhập thay đổi về thời gian, địa điểm, hướng dẫn check-in hoặc cập nhật quan trọng..."
                />
                {plainContent.length > 0 && plainContent.length < 5 && (
                  <p className="mt-1.5 text-xs text-amber-400 [html.light_&]:text-amber-600">
                    Nội dung cần ít nhất 5 ký tự ({plainContent.length}/5)
                  </p>
                )}

                {/* Minimalist attachment pills list */}
                {attachments.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border-soft/60 bg-surface/70 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition [html.light_&]:bg-white [html.light_&]:text-[#0D1B2A] [html.light_&]:border-slate-200"
                      >
                        {getFileIcon(att.filename)}
                        <span className="max-w-[170px] truncate font-medium" title={att.filename}>
                          {att.filename}
                        </span>
                        {att.size && (
                          <span className="text-[10px] text-muted">({formatFileSize(att.size)})</span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(idx)}
                          className="ml-1 text-muted hover:text-red-400 p-0.5 rounded cursor-pointer transition"
                          title="Xóa tệp đính kèm"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="org-btn-primary ml-auto h-12 px-8 text-base font-bold shadow-md hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                disabled={sendMutation.isPending || isUploading || !form.event_id || (!form.web && !form.email) || isContentEmpty || !form.title.trim()}
              >
                {sendMutation.isPending ? 'Đang gửi...' : 'Gửi ngay'}
              </button>
            </form>
          </OrganizerPanel>
        </div>

        <aside className="space-y-5">
          <div>
            <h3 className="mb-3 text-base font-extrabold uppercase text-white [html.light_&]:text-[#0D1B2A]">Xem trước</h3>
            <div className="rounded-2xl border border-border-soft/30 bg-gradient-to-br from-slate-900 via-sky-950 to-blue-900 p-5 text-white shadow-xl min-h-[280px] flex flex-col [html.light_&]:bg-none [html.light_&]:bg-white/92 [html.light_&]:border-[#C99A47]/35 [html.light_&]:shadow-[0_8px_32px_rgba(27,54,93,0.08)]">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-[11px] font-bold text-primary [html.light_&]:bg-[#C99A47]/15 [html.light_&]:text-[#92400e] [html.light_&]:border [html.light_&]:border-[#C99A47]/30">EventHub</span>
                <span className="text-[11px] font-semibold text-white/50 [html.light_&]:text-[#536b88]">Vừa xong</span>
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-white/70 line-clamp-1 [html.light_&]:text-[#536b88]">
                {selectedEvent?.title || 'Sự kiện đã chọn'}
              </p>
              <p className="mt-2 text-base font-bold text-white line-clamp-2 leading-snug [html.light_&]:text-[#0D1B2A]">
                {form.title || 'Tiêu đề thông báo'}
              </p>
              <div
                className="announcement-preview mt-3 text-sm leading-relaxed text-white/90 overflow-hidden [html.light_&]:text-[#1B365D]"
                dangerouslySetInnerHTML={{
                  __html: form.content || '<p style="opacity:0.5">Nội dung thông báo sẽ hiển thị tại đây</p>',
                }}
              />

              {attachments.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/10 [html.light_&]:border-slate-200">
                  <p className="text-xs font-bold text-[#E6C17A] mb-2 flex items-center gap-1.5 [html.light_&]:text-[#92400e]">
                    <Paperclip className="size-3.5" />
                    <span>Tệp đính kèm ({attachments.length}):</span>
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-white/80 [html.light_&]:text-slate-700">
                        {getFileIcon(att.filename)}
                        <span className="truncate max-w-[200px]">{att.filename}</span>
                        {att.size && <span className="text-[10px] text-white/40 [html.light_&]:text-slate-400">({formatFileSize(att.size)})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
      <span className="block text-base font-bold text-white mb-1.5 [html.light_&]:text-[#0D1B2A]">{label}</span>
      <input
        required
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="mt-1 h-11 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary placeholder:text-muted [html.light_&]:bg-[#FAF4EB]/60 [html.light_&]:text-[#0D1B2A] [html.light_&]:border-[#C99A47]/35 [html.light_&]:placeholder:text-[#536b88]"
      />
    </label>
  )
}
