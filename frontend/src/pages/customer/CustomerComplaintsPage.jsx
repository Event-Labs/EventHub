import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Clock3,
  ExternalLink,
  FileText,
  History,
  ImageIcon,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RotateCcw,
  ShieldAlert,
  Ticket,
  Upload,
  X,
  XCircle,
} from 'lucide-react'
import { renderCosmicTitle } from '@/lib/formatTitle.jsx'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { isAuthenticated as hasAuthSession, getStoredUser } from '@/lib/auth.js'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { useToast } from '@/providers/ToastProvider.jsx'
import {
  fetchMyComplaints,
  submitComplaint,
  COMPLAINT_CATEGORIES,
  getCategoryLabel,
  getCategoryBadgeClass,
  getStatusLabel,
  getStatusBadgeClass,
} from '@/services/complaints.js'
import { fetchEligibleFeedbackEvents } from '@/services/feedbacks.js'
import { uploadOrganizerDocument } from '@/services/uploads.js'

function formatDateTime(value, isEnglish = false) {
  if (!value) return 'N/A'
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return String(value)
    return new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d)
  } catch {
    return String(value)
  }
}

function getLocalizedCategoryLabel(catValue, isEnglish = false) {
  if (!isEnglish) return getCategoryLabel(catValue)
  switch (catValue) {
    case 'EVENT_CONTENT':
      return 'Event Content / Misleading Info'
    case 'ORGANIZER_SERVICE':
      return 'Organizer Service Quality'
    case 'TICKET_CHECKIN':
      return 'Ticket & Check-in Issue'
    case 'FRAUD_SCAM':
      return 'Suspected Fraud / Scam'
    case 'REFUND_ISSUE':
      return 'Payment & Refund Issue'
    case 'OTHER':
      return 'Other Issue'
    default:
      return catValue || 'Uncategorized'
  }
}

function getLocalizedStatusLabel(status, isEnglish = false) {
  if (!isEnglish) return getStatusLabel(status)
  switch (status) {
    case 'PENDING':
      return 'Pending Review'
    case 'IN_PROGRESS':
      return 'In Progress'
    case 'RESOLVED':
      return 'Resolved'
    case 'REJECTED':
      return 'Rejected'
    default:
      return status || 'Unknown'
  }
}

export function CustomerComplaintsPage() {
  const { isEnglish } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const isAuthenticated = hasAuthSession()
  const currentUser = getStoredUser()

  // Redirect if not logged in
  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
    }
  }, [isAuthenticated, location.pathname, location.search, navigate])

  // Form State
  const [selectedEventId, setSelectedEventId] = useState('')
  const [category, setCategory] = useState('EVENT_CONTENT')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [evidenceFiles, setEvidenceFiles] = useState([]) // File[]
  const [previewUrls, setPreviewUrls] = useState([]) // string[]
  const [submitting, setSubmitting] = useState(false)

  // Query eligible attended/booked events for the dropdown
  const eventsQuery = useQuery({
    queryKey: ['complaint-eligible-events'],
    queryFn: fetchEligibleFeedbackEvents,
    enabled: Boolean(isAuthenticated),
  })

  // Pre-fill from query params if given
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const eventIdParam = params.get('eventId')
    if (eventIdParam) {
      setSelectedEventId(eventIdParam)
    }
  }, [location.search])

  // Query complaints history
  const complaintsQuery = useQuery({
    queryKey: ['my-complaints'],
    queryFn: fetchMyComplaints,
    enabled: Boolean(isAuthenticated),
    refetchInterval: 30_000,
  })

  const eligibleEvents = Array.isArray(eventsQuery.data) ? eventsQuery.data : []
  const complaints = Array.isArray(complaintsQuery.data) ? complaintsQuery.data : []

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          // ignore
        }
      })
    }
  }, [previewUrls])

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || [])
    if (evidenceFiles.length + files.length > 4) {
      toast.error(
        isEnglish
          ? 'You can only upload up to 4 evidence photos.'
          : 'Chỉ được tải lên tối đa 4 ảnh minh chứng.'
      )
      return
    }

    const validFiles = []
    const newPreviews = []

    files.forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(
          isEnglish
            ? `File "${file.name}" exceeds 5MB limit.`
            : `Ảnh "${file.name}" vượt quá 5MB.`
        )
        return
      }
      validFiles.push(file)
      newPreviews.push(URL.createObjectURL(file))
    })

    setEvidenceFiles((prev) => [...prev, ...validFiles])
    setPreviewUrls((prev) => [...prev, ...newPreviews])
    e.target.value = ''
  }

  const handleRemoveFile = (index) => {
    try {
      URL.revokeObjectURL(previewUrls[index])
    } catch {
      // ignore
    }
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index))
  }

  const handleResetForm = () => {
    setTitle('')
    setDescription('')
    setSelectedEventId('')
    setCategory('EVENT_CONTENT')
    previewUrls.forEach((u) => {
      try {
        URL.revokeObjectURL(u)
      } catch {
        // ignore
      }
    })
    setEvidenceFiles([])
    setPreviewUrls([])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!title.trim()) {
      toast.error(
        isEnglish
          ? 'Please enter a complaint title.'
          : 'Vui lòng nhập tiêu đề phản ánh / khiếu nại.'
      )
      return
    }

    if (!description.trim()) {
      toast.error(
        isEnglish
          ? 'Please enter detailed description.'
          : 'Vui lòng nhập nội dung chi tiết khiếu nại.'
      )
      return
    }

    setSubmitting(true)
    try {
      // 1. Upload evidence images if any
      const uploadedUrls = []
      for (const file of evidenceFiles) {
        const uploadRes = await uploadOrganizerDocument(file, { imageOnly: true })
        if (uploadRes?.secure_url || uploadRes?.url) {
          uploadedUrls.push(uploadRes.secure_url || uploadRes.url)
        }
      }

      // 2. Submit complaint payload
      const payload = {
        eventId: selectedEventId ? selectedEventId : null,
        organizerId: null,
        ticketId: null,
        orderId: null,
        category,
        title: title.trim(),
        description: description.trim(),
        evidenceUrls: uploadedUrls,
        contactEmail: currentUser?.email?.trim() || null,
        contactPhone: currentUser?.phone?.trim() || null,
      }

      const res = await submitComplaint(payload)
      toast.success(
        res?.message ||
        (isEnglish
          ? 'Complaint submitted to Admin successfully!'
          : 'Đã gửi khiếu nại lên Ban Quản trị EventHub thành công!')
      )

      // Refresh list & reset form
      queryClient.invalidateQueries({ queryKey: ['my-complaints'] })
      handleResetForm()
    } catch (err) {
      console.error('Submit complaint error:', err)
      toast.error(
        err.response?.data?.message ||
        err.message ||
        (isEnglish
          ? 'Failed to submit complaint. Please try again.'
          : 'Không thể gửi khiếu nại lúc này. Vui lòng thử lại.')
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="force-dark mx-auto max-w-7xl px-3.5 sm:px-6 lg:px-8 pt-0 sm:pt-1 pb-10 text-slate-100">
      {/* Standard Customer SectionHeader (matching all customer role pages) */}
      <SectionHeader
        title={isEnglish ? 'Complaints & Inquiries' : 'Khiếu nại & Phản ánh'}
        description={
          isEnglish
            ? 'Submit direct reports or inquiries to EventHub Admin for prompt assistance.'
            : 'Gửi phản ánh hoặc khiếu nại tới Ban Quản trị EventHub để được hỗ trợ và giải quyết nhanh nhất.'
        }
      />

      {/* Main 2-Column Layout: Form on the Left, History on the Right */}
      <div className="grid gap-6 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_430px] items-start relative">
        {/* Left Column: Direct Embedded Complaint Form */}
        <div className="space-y-4">
          <section className="glass-panel rounded-[28px] border border-white/15 bg-slate-900/80 backdrop-blur-xl p-5 sm:p-6 lg:p-7 shadow-2xl relative">
            {/* Subtle radial cosmic glow */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_#C99A47_0%,_transparent_65%)] opacity-5 pointer-events-none rounded-[28px]" />

            <form id="complaint-form" onSubmit={handleSubmit} className="space-y-5">
              {/* Related Event (Optional) */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  {isEnglish ? 'Related Event (Optional)' : 'Sự kiện liên quan (Tùy chọn)'}
                </label>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  style={{ backgroundColor: '#0f172a', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                  className="cosmic-input w-full cursor-pointer text-sm"
                >
                  <option value="" className="bg-slate-900 text-white">
                    {isEnglish
                      ? '-- General platform issue (Not related to a specific event) --'
                      : '-- Khiếu nại chung hệ thống (không thuộc sự kiện cụ thể) --'}
                  </option>
                  {eligibleEvents.map((ev) => (
                    <option key={ev.id} value={ev.id} className="bg-slate-900 text-white">
                      {ev.title}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-400">
                  {isEnglish
                    ? 'If your report concerns a specific event you attended or booked, please select it.'
                    : 'Nếu khiếu nại của bạn về một sự kiện cụ thể đã tham gia, vui lòng chọn sự kiện tương ứng.'}
                </p>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  {isEnglish ? 'Complaint Category' : 'Danh mục khiếu nại'}{' '}
                  <span className="text-rose-400 font-bold">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{ backgroundColor: '#0f172a', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                  className="cosmic-input w-full cursor-pointer text-sm"
                >
                  {COMPLAINT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value} className="bg-slate-900 text-white">
                      {getLocalizedCategoryLabel(c.value, isEnglish)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  {isEnglish ? 'Complaint Subject / Title' : 'Tiêu đề phản ánh / khiếu nại'}{' '}
                  <span className="text-rose-400 font-bold">*</span>
                </label>
                <input
                  type="text"
                  placeholder={
                    isEnglish
                      ? 'e.g. Organizer cancelled abruptly with no support, Check-in failed at gate...'
                      : 'Ví dụ: BTC hủy sự kiện đột xuất không hỗ trợ, Không thể check-in vào cửa...'
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  style={{ backgroundColor: '#0f172a', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                  className="cosmic-input w-full text-sm"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  {isEnglish ? 'Detailed Description' : 'Nội dung chi tiết'}{' '}
                  <span className="text-rose-400 font-bold">*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder={
                    isEnglish
                      ? 'Describe what happened: date/time, organizer actions, damages or issues experienced...'
                      : 'Mô tả cụ thể sự việc: thời gian xảy ra, thái độ hoặc hành vi của Ban tổ chức, thiệt hại hoặc khó khăn gặp phải...'
                  }
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ backgroundColor: '#0f172a', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                  className="cosmic-input w-full leading-relaxed text-sm"
                  required
                />
              </div>

              {/* Evidence Upload */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-white">
                    {isEnglish
                      ? 'Evidence / Attachment Photos (Max 4 images)'
                      : 'Hình ảnh minh chứng / Bằng chứng (Tối đa 4 ảnh)'}
                  </label>
                  <span className="text-xs text-slate-400 font-medium">
                    {evidenceFiles.length}/4 {isEnglish ? 'photos' : 'ảnh'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {previewUrls.map((url, idx) => (
                    <div
                      key={idx}
                      className="relative group aspect-square rounded-xl overflow-hidden border border-white/15 bg-slate-950 shadow-md"
                    >
                      <img
                        src={url}
                        alt={`Evidence ${idx + 1}`}
                        className="size-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(idx)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/80 text-rose-400 hover:bg-rose-500 hover:text-white transition cursor-pointer"
                        title={isEnglish ? 'Remove image' : 'Xóa ảnh'}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}

                  {evidenceFiles.length < 4 && (
                    <label className="flex flex-col items-center justify-center aspect-square rounded-xl border border-dashed border-white/20 bg-white/[0.03] hover:bg-white/[0.08] hover:border-amber-400/50 cursor-pointer transition text-center p-2">
                      <Camera className="size-5 text-slate-400 mb-1" />
                      <span className="text-xs font-semibold text-slate-300">
                        {isEnglish ? 'Add photo' : 'Thêm ảnh'}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-0.5">JPG, PNG, WEBP</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-400 leading-normal">
                  {isEnglish
                    ? 'Attach receipts, tickets, screenshots of chat messages, or payment proofs to accelerate verification.'
                    : 'Đính kèm ảnh chụp màn hình tin nhắn, biên lai, vé hoặc bằng chứng để Quản trị viên xử lý nhanh hơn.'}
                </p>
              </div>
            </form>
          </section>

          {/* Action Buttons (outside form card) */}
          <div className="flex flex-wrap items-center justify-end gap-3.5 pt-1">
            <button
              type="button"
              onClick={handleResetForm}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-7 py-3 text-sm font-bold text-slate-300 hover:bg-white/10 hover:text-white active:scale-95 transition cursor-pointer"
            >
              {isEnglish ? 'Clear' : 'Làm mới'}
            </button>

            <button
              type="submit"
              form="complaint-form"
              disabled={submitting || !title.trim() || !description.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-3 text-sm font-bold shadow-lg shadow-amber-500/20 hover:brightness-110 active:scale-95 transition disabled:opacity-50 cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #C99A47, #E6C17A)',
                color: '#081126',
              }}
            >
              {submitting && (
                <Loader2 className="size-4 animate-spin text-[#081126]" />
              )}
              <span className="text-[#081126]">
                {submitting
                  ? isEnglish
                    ? 'Submitting...'
                    : 'Đang gửi...'
                  : isEnglish
                    ? 'Submit Complaint'
                    : 'Gửi đơn khiếu nại'}
              </span>
            </button>
          </div>
        </div>

        {/* Right Column: Sent Complaints History List (Sidebar) */}
        <aside className="space-y-4 lg:sticky lg:top-20">
          <div className="glass-panel rounded-[28px] border border-white/15 bg-slate-900/80 backdrop-blur-xl p-5 sm:p-6 shadow-xl">
            {/* Header of Sidebar */}
            <div className="flex items-center justify-between pb-3.5 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2.5">
                <History className="size-4.5 text-amber-400" />
                <h3 className="font-bold text-base text-white">
                  {isEnglish ? 'Complaint History' : 'Lịch sử khiếu nại'}
                </h3>
              </div>
              <span
                className="rounded-full bg-white/10 border border-white/15 px-2.5 py-0.5 text-xs font-bold"
                style={{ color: '#fcd34d' }}
              >
                {complaints.length}
              </span>
            </div>

            {/* Content of Sidebar */}
            {complaintsQuery.isLoading ? (
              <div className="py-8 text-center space-y-2">
                <Loader2 className="size-5 animate-spin mx-auto text-amber-400" />
                <p className="text-xs text-slate-400">
                  {isEnglish ? 'Loading history...' : 'Đang tải lịch sử...'}
                </p>
              </div>
            ) : complaints.length === 0 ? (
              <div className="py-6 sm:py-8 text-center text-slate-400 space-y-1.5">
                <p className="text-sm font-semibold text-white">
                  {isEnglish ? 'No complaints yet' : 'Chưa có khiếu nại nào'}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                  {isEnglish
                    ? 'Fill in the form on the left to submit a report or inquiry directly to Admin.'
                    : 'Điền form bên trái để gửi phản ánh hoặc khiếu nại tới Ban Quản trị.'}
                </p>
              </div>
            ) : (
              /* Scrollable list of complaint cards */
              <div className="max-h-[calc(100vh-220px)] overflow-y-auto space-y-3.5 pr-1 scrollbar-thin">
                {complaints.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 space-y-3 hover:border-amber-400/40 transition shadow-sm"
                  >
                    {/* Header: ID, Date & Badges */}
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-sky-400">
                            #{String(item.id || '').slice(0, 8)}
                          </span>
                          <span className="text-slate-600 text-xs">•</span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Clock className="size-3 text-slate-500" />
                            {formatDateTime(item.created_at, isEnglish)}
                          </span>
                        </div>
                        <div>
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${getCategoryBadgeClass(
                              item.category
                            )}`}
                          >
                            {getLocalizedCategoryLabel(item.category, isEnglish)}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${getStatusBadgeClass(
                          item.status
                        )}`}
                      >
                        {getLocalizedStatusLabel(item.status, isEnglish)}
                      </span>
                    </div>

                    {/* Associated Event Context if any */}
                    {(item.event_title || item.organizer_name || item.ticket_code) && (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-[11px] text-slate-300 space-y-1">
                        {item.event_title && (
                          <div className="flex items-center gap-1.5 font-semibold text-white truncate">
                            <Calendar className="size-3 text-amber-400 shrink-0" />
                            <span className="truncate" title={item.event_title}>
                              {item.event_title}
                            </span>
                          </div>
                        )}
                        {item.organizer_name && (
                          <div className="flex items-center gap-1.5 text-slate-300 truncate">
                            <Building2 className="size-3 text-purple-400 shrink-0" />
                            <span className="truncate">BTC: {item.organizer_name}</span>
                          </div>
                        )}
                        {item.ticket_code && (
                          <div className="flex items-center gap-1.5 font-mono text-sky-400 truncate">
                            <Ticket className="size-3 shrink-0" />
                            <span>Vé: {item.ticket_code}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Complaint Content */}
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white leading-snug">
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line line-clamp-4">
                        {item.description}
                      </p>
                    </div>

                    {/* Evidence Thumbnails */}
                    {Array.isArray(item.evidence_urls) && item.evidence_urls.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-white/5">
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                          <ImageIcon className="size-3 text-slate-400" />
                          {isEnglish ? 'Evidence:' : 'Ảnh minh chứng:'}
                        </span>
                        <div className="flex gap-1.5 flex-wrap">
                          {item.evidence_urls.map((imgUrl, idx) => (
                            <a
                              key={idx}
                              href={imgUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="size-12 rounded-lg overflow-hidden border border-white/15 bg-black block group relative"
                              title={isEnglish ? 'View full image' : 'Xem ảnh gốc'}
                            >
                              <img
                                src={imgUrl}
                                alt={`Evidence ${idx + 1}`}
                                className="size-full object-cover group-hover:scale-105 transition"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Admin Resolution Note */}
                    {item.admin_note && (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-emerald-400 text-[11px]">
                          <CheckCircle2 className="size-3.5 shrink-0" />
                          <span>
                            {isEnglish ? 'Admin Resolution:' : 'Phản hồi từ Ban Quản trị:'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-100 pl-5 leading-relaxed">
                          &ldquo;{item.admin_note}&rdquo;
                        </p>
                        {item.resolved_at && (
                          <p className="text-[10px] text-slate-400 pl-5 pt-0.5">
                            {formatDateTime(item.resolved_at, isEnglish)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default CustomerComplaintsPage
