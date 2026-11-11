import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  Phone,
  ShieldAlert,
  Ticket,
  Upload,
  X,
} from 'lucide-react'
import { useToast } from '@/providers/ToastProvider.jsx'
import { getStoredUser } from '@/lib/auth.js'
import { COMPLAINT_CATEGORIES, submitComplaint } from '@/services/complaints.js'
import { uploadOrganizerDocument } from '@/services/uploads.js'
import { fetchEligibleFeedbackEvents } from '@/services/feedbacks.js'

export function CustomerComplaintModal({
  isOpen,
  onClose,
  initialData = {},
  onSuccess,
}) {
  const toast = useToast()
  const currentUser = getStoredUser()
  const [selectedEventId, setSelectedEventId] = useState(initialData.eventId || '')
  const [category, setCategory] = useState(initialData.category || 'EVENT_CONTENT')
  const [title, setTitle] = useState(initialData.title || '')
  const [description, setDescription] = useState(initialData.description || '')
  const [contactEmail, setContactEmail] = useState(currentUser?.email || initialData.contactEmail || '')
  const [contactPhone, setContactPhone] = useState(currentUser?.phone || initialData.contactPhone || '')
  
  // File uploads
  const [evidenceFiles, setEvidenceFiles] = useState([]) // Array of File
  const [previewUrls, setPreviewUrls] = useState([]) // Array of string
  const [submitting, setSubmitting] = useState(false)

  // Query events the user attended/booked if no event is pre-selected
  const eventsQuery = useQuery({
    queryKey: ['complaint-eligible-events'],
    queryFn: fetchEligibleFeedbackEvents,
    enabled: isOpen && !initialData.eventId,
  })

  const eligibleEvents = Array.isArray(eventsQuery.data) ? eventsQuery.data : []

  if (!isOpen) return null

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || [])
    if (evidenceFiles.length + files.length > 4) {
      toast.error('Chỉ được tải lên tối đa 4 ảnh minh chứng.')
      return
    }

    const validFiles = []
    const newPreviews = []

    files.forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`Ảnh "${file.name}" vượt quá 5MB.`)
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
    URL.revokeObjectURL(previewUrls[index])
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!title.trim()) {
      toast.error('Vui lòng nhập tiêu đề khiếu nại.')
      return
    }

    if (!description.trim()) {
      toast.error('Vui lòng nhập nội dung chi tiết khiếu nại.')
      return
    }

    setSubmitting(true)
    try {
      // 1. Upload evidence files if any
      const uploadedUrls = []
      for (const file of evidenceFiles) {
        const uploadRes = await uploadOrganizerDocument(file, { imageOnly: true })
        if (uploadRes?.secure_url || uploadRes?.url) {
          uploadedUrls.push(uploadRes.secure_url || uploadRes.url)
        }
      }

      // 2. Submit complaint
      const finalEventId = initialData.eventId || (selectedEventId ? selectedEventId : null)
      const payload = {
        eventId: finalEventId,
        organizerId: initialData.organizerId || null,
        ticketId: initialData.ticketId || null,
        orderId: initialData.orderId || null,
        category,
        title: title.trim(),
        description: description.trim(),
        evidenceUrls: uploadedUrls,
        contactEmail: contactEmail?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
      }

      const res = await submitComplaint(payload)
      toast.success(res?.message || 'Đã gửi khiếu nại lên Ban Quản trị EventHub thành công!')

      // Reset and close
      previewUrls.forEach((u) => URL.revokeObjectURL(u))
      setEvidenceFiles([])
      setPreviewUrls([])
      if (onSuccess) onSuccess(res?.data)
      onClose()
    } catch (err) {
      console.error('Submit complaint error:', err)
      toast.error(err.response?.data?.message || err.message || 'Không thể gửi khiếu nại lúc này.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl border border-rose-500/30 bg-[#0f172a] p-6 shadow-2xl text-white space-y-5">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-rose-500/30 to-amber-500/20 text-rose-400 border border-rose-500/30 shrink-0">
              <ShieldAlert className="size-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                Gửi Khiếu nại lên Quản trị viên
              </h3>
              <p className="text-xs text-slate-400">
                EventHub cam kết bảo vệ quyền lợi và bảo mật thông tin của khách hàng
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Associated Context Banner if present */}
        {(initialData.eventTitle || initialData.ticketCode || initialData.organizerName) && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 space-y-1.5 text-xs">
            <span className="font-bold text-[11px] uppercase tracking-wider text-slate-400 block">
              Thông tin đối tượng liên quan
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300">
              {initialData.eventTitle && (
                <div className="flex items-center gap-1.5 truncate">
                  <Calendar className="size-3.5 text-amber-400 shrink-0" />
                  <span className="font-semibold text-white truncate" title={initialData.eventTitle}>
                    {initialData.eventTitle}
                  </span>
                </div>
              )}
              {initialData.organizerName && (
                <div className="flex items-center gap-1.5 truncate">
                  <Building2 className="size-3.5 text-purple-400 shrink-0" />
                  <span className="truncate">BTC: {initialData.organizerName}</span>
                </div>
              )}
              {initialData.ticketCode && (
                <div className="flex items-center gap-1.5 truncate">
                  <Ticket className="size-3.5 text-sky-400 shrink-0" />
                  <span className="font-mono">Mã vé: {initialData.ticketCode}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Complaint Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Optional Event Picker if not prefilled */}
          {!initialData.eventId && (
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: '#e2e8f0' }}>
                Sự kiện liên quan (Tùy chọn)
              </label>
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                style={{ backgroundColor: '#0f172a', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                className="w-full rounded-xl border px-3 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
              >
                <option value="" className="bg-slate-900 text-white">
                  -- Khiếu nại chung hệ thống (không thuộc sự kiện cụ thể) --
                </option>
                {eligibleEvents.map((ev) => (
                  <option key={ev.id} value={ev.id} className="bg-slate-900 text-white">
                    {ev.title}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px]" style={{ color: '#94a3b8' }}>
                Nếu khiếu nại của bạn về một sự kiện cụ thể đã tham gia, vui lòng chọn sự kiện tương ứng.
              </p>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: '#e2e8f0' }}>
              Danh mục khiếu nại <span className="text-rose-400">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ backgroundColor: '#0f172a', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
              className="w-full rounded-xl border px-3 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
            >
              {COMPLAINT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value} className="bg-slate-900 text-white">
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: '#e2e8f0' }}>
              Tiêu đề phản ánh / khiếu nại <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              placeholder="Ví dụ: BTC hủy sự kiện đột xuất không hỗ trợ, Không thể check-in vào cửa..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              style={{ backgroundColor: '#0f172a', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
              className="w-full rounded-xl border px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Detailed description */}
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: '#e2e8f0' }}>
              Nội dung chi tiết <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={4}
              placeholder="Mô tả cụ thể sự việc: thời gian xảy ra, thái độ hoặc hành vi của Ban tổ chức, thiệt hại hoặc khó khăn gặp phải..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ backgroundColor: '#0f172a', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
              className="w-full rounded-xl border p-3.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>

          {/* Evidence Image Upload */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-300">
                Hình ảnh minh chứng / Bằng chứng (Tối đa 4 ảnh)
              </label>
              <span className="text-[11px] text-slate-400">
                {evidenceFiles.length}/4 ảnh
              </span>
            </div>

            {/* Image Preview Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {previewUrls.map((url, idx) => (
                <div
                  key={idx}
                  className="relative group aspect-square rounded-xl overflow-hidden border border-white/15 bg-slate-950"
                >
                  <img
                    src={url}
                    alt={`Evidence ${idx + 1}`}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(idx)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-rose-400 hover:bg-rose-500 hover:text-white transition opacity-90 group-hover:opacity-100"
                    title="Xóa ảnh"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}

              {evidenceFiles.length < 4 && (
                <label className="flex flex-col items-center justify-center aspect-square rounded-xl border border-dashed border-white/20 bg-white/[0.03] hover:bg-white/[0.07] hover:border-rose-400/50 cursor-pointer transition text-center p-2">
                  <Camera className="size-5 text-slate-400 mb-1" />
                  <span className="text-[10px] font-semibold text-slate-300">Thêm ảnh</span>
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
            <p className="mt-1 text-[11px] text-slate-500">
              Đính kèm ảnh chụp màn hình tin nhắn, biên lai, vé hoặc video minh chứng để Quản trị viên xử lý nhanh hơn.
            </p>
          </div>

          {/* Contact Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold mb-1" style={{ color: '#e2e8f0' }}>
                Email nhận phản hồi
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="email@example.com"
                  style={{ backgroundColor: '#0f172a', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                  className="w-full rounded-xl border py-2 pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold mb-1" style={{ color: '#e2e8f0' }}>
                Số điện thoại liên hệ
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="0912 345 678"
                  style={{ backgroundColor: '#0f172a', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                  className="w-full rounded-xl border py-2 pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl px-4 py-2.5 text-xs font-semibold hover:bg-white/10 transition cursor-pointer"
              style={{ color: '#cbd5e1' }}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !description.trim()}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold shadow-lg shadow-amber-500/25 hover:brightness-110 active:scale-95 transition disabled:opacity-50 cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #C99A47, #E6C17A)',
                color: '#081126',
              }}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" style={{ color: '#081126' }} />
                  <span style={{ color: '#081126' }}>Đang gửi khiếu nại...</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="size-4" style={{ color: '#081126' }} />
                  <span style={{ color: '#081126' }}>Gửi khiếu nại lên Admin</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CustomerComplaintModal

