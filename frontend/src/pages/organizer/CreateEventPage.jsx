import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Sparkles, Wand2, X as CloseIcon, Check, RefreshCw, Layers } from 'lucide-react'
import { fetchEventCategories } from '@/services/events.js'
import {
  createOrganizerEvent,
  fetchOrganizerEvent,
  fetchOrganizerVenues,
  submitOrganizerEvent,
  updateOrganizerEvent,
  generateAiEventContent,
} from '@/services/organizerEvents.js'
import { getVenueSeatMaps } from '@/services/organizerVenues.js'
import { assignZones, getSeatMap } from '@/services/organizerSeatMaps.js'
import { SeatMapPreview } from './SeatMapEditor.jsx'
import { ConfirmModal } from './OrganizerComponents.jsx'
import { uploadEventBanner, uploadEventThumbnail, uploadPolicyDocument, uploadOrganizerDocument } from '@/services/uploads.js'
import { fetchCurrentPlan } from '@/services/subscriptions.js'
import RichTextEditor from '@/components/RichTextEditor.jsx'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { AiEventContentGeneratorModal } from './AiEventContentGeneratorModal.jsx'

const STEP_LABELS = [
  'Thông tin sự kiện',
  'Ngày giờ & Địa điểm',
  'Hạng vé & Sơ đồ ghế',
  'Chính sách & Cài đặt',
  'Xem trước & Gửi duyệt',
]

const INITIAL_FORM = {
  title: '',
  category_id: '',
  tags: [],
  format: 'OFFLINE',
  visibility: 'PUBLIC',
  short_description: '',
  description: `<p><strong>[Tóm tắt ngắn gọn về sự kiện:</strong> Nội dung chính của sự kiện, điểm đặc sắc nhất và lý do khiến người tham gia không nên bỏ lỡ]</p><br/><p><strong>Chi tiết sự kiện:</strong></p><ul><li>Chương trình chính: [Liệt kê những hoạt động nổi bật trong sự kiện: các phần trình diễn, khách mời đặc biệt, lịch trình các tiết mục cụ thể nếu có.]</li><li>Khách mời: [Thông tin về các khách mời đặc biệt, nghệ sĩ, diễn giả sẽ tham gia sự kiện. Có thể bao gồm phần mô tả ngắn gọn về họ và những gì họ sẽ mang lại cho sự kiện.]</li><li>Trải nghiệm đặc biệt: [Nếu có các hoạt động đặc biệt khác như workshop, khu trải nghiệm, photo booth, khu vực check-in hay các phần quà/ưu đãi dành riêng cho người tham dự.]</li></ul><br/><p><strong>[Chèn ảnh sơ đồ chỗ ngồi tại đây]</strong></p><br/><p><strong>Điều khoản và điều kiện:</strong></p><p>[TnC] sự kiện</p><p>Lưu ý về điều khoản trẻ em</p><p>Lưu ý về điều khoản VAT</p>`,
  thumbnail_url: '',
  banner_url: '',
  sessions: [],
  ticketTypes: [],
  seating_rules: {
    require_adjacent_seats: false,
    require_same_row: false,
    disallow_single_seat_left: false,
  },
  refund_policy: {
    allow_refunds: false,
    deadline_days: 7,
    policy_file_url: null,
    policy_file_name: null,
    policy_file_size: null,
    permit_files: [],
  },
  additional_terms: '',
  require_attendee_info: false,
  terms_accepted: false,
}

function Icon({ name, className = '', style = {} }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={style}>
      {name}
    </span>
  )
}

function combineDateTime(date, time) {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}`)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

function splitDateTime(iso) {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { date: '', time: '' }

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  }
}

function newClientKey() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function checkSessionsOverlap(sessions) {
  if (!Array.isArray(sessions) || sessions.length <= 1) return null
  for (let i = 0; i < sessions.length; i++) {
    const sA = sessions[i]
    if (!sA.start_date || !sA.start_time || !sA.end_date || !sA.end_time) continue
    const startA = new Date(`${sA.start_date}T${sA.start_time}`).getTime()
    const endA = new Date(`${sA.end_date}T${sA.end_time}`).getTime()
    if (isNaN(startA) || isNaN(endA)) continue

    for (let j = i + 1; j < sessions.length; j++) {
      const sB = sessions[j]
      if (!sB.start_date || !sB.start_time || !sB.end_date || !sB.end_time) continue
      const startB = new Date(`${sB.start_date}T${sB.start_time}`).getTime()
      const endB = new Date(`${sB.end_date}T${sB.end_time}`).getTime()
      if (isNaN(startB) || isNaN(endB)) continue

      if (startA < endB && startB < endA) {
        return {
          sessionA: sA,
          sessionB: sB,
          nameA: sA.session_name?.trim() || `Phiên ${i + 1}`,
          nameB: sB.session_name?.trim() || `Phiên ${j + 1}`,
          keyA: sA.id || sA.clientKey,
          keyB: sB.id || sB.clientKey,
        }
      }
    }
  }
  return null
}

function calculateEventCompleteness(formData) {
  const titleValid = Boolean(formData.title?.trim())
  const categoryValid = Boolean(formData.category_id)
  const shortDescValid = Boolean(formData.short_description?.trim())
  const descText = (formData.description || '').replace(/<[^>]*>/g, '').trim()
  const hasDescImg = (formData.description || '').includes('<img')
  const descValid = Boolean(descText || hasDescImg)
  const thumbValid = Boolean(formData.thumbnail_url)
  const bannerValid = Boolean(formData.banner_url)

  const hasSessions = Boolean(formData.sessions && formData.sessions.length > 0)
  const overlapInfo = hasSessions ? checkSessionsOverlap(formData.sessions) : null
  const hasDifferentDaySessions = hasSessions && formData.sessions.some(
    (s) => s.start_date && s.end_date && s.start_date !== s.end_date
  )

  const sessionsValid = hasSessions && !hasDifferentDaySessions && !overlapInfo && formData.sessions.every((s) => {
    if (!s.start_date || !s.start_time || !s.end_date || !s.end_time || !s.venue_id) return false
    if (s.start_date !== s.end_date) return false
    const start = new Date(`${s.start_date}T${s.start_time}`)
    const end = new Date(`${s.end_date}T${s.end_time}`)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return false
    if (s.checkin_start_date || s.checkin_start_time) {
      if (!s.checkin_start_date || !s.checkin_start_time) return false
      if (s.checkin_start_date !== s.start_date) return false
      const checkin = new Date(`${s.checkin_start_date}T${s.checkin_start_time}`)
      if (isNaN(checkin.getTime()) || checkin > start) return false
    }
    return true
  })

  const ticketsValid = hasSessions && formData.sessions.every((s) => {
    const key = s.id || s.clientKey
    const tickets = (formData.ticketTypes || []).filter((tt) => String(tt.session_key) === String(key))
    if (!tickets.length) return false
    return tickets.every((tt) => (
      Boolean(tt.name?.trim()) &&
      tt.price !== '' &&
      tt.price !== null &&
      tt.price !== undefined &&
      Number(tt.price) >= 0 &&
      Boolean(tt.quantity) &&
      Number(tt.quantity) > 0
    ))
  })

  const seatMapValid = hasSessions && formData.sessions.every((s) => {
    if (s.seating_type === 'ASSIGNED') {
      return Boolean(s.seat_map_id)
    }
    return true
  })

  const policyFileUrl = formData.refund_policy?.policy_file_url
  const hasTerms = Boolean(formData.additional_terms?.trim())
  const policiesValid = Boolean(hasTerms || policyFileUrl)

  const permitFiles = formData.refund_policy?.permit_files || []
  const permitsValid = Boolean(permitFiles.length > 0)

  const termsAccepted = Boolean(formData.terms_accepted)

  const checklist = [
    {
      id: 'title_category',
      step: 1,
      label: 'Tên & Danh mục sự kiện',
      completed: Boolean(titleValid && categoryValid),
      detail: !titleValid
        ? 'Chưa nhập tên sự kiện'
        : !categoryValid
        ? 'Chưa chọn danh mục'
        : 'Đã hoàn tất',
    },
    {
      id: 'descriptions',
      step: 1,
      label: 'Mô tả ngắn & Chi tiết',
      completed: Boolean(shortDescValid && descValid),
      detail: !shortDescValid
        ? 'Chưa nhập mô tả ngắn'
        : !descValid
        ? 'Chưa nhập mô tả chi tiết'
        : 'Đã hoàn tất',
    },
    {
      id: 'media',
      step: 1,
      label: 'Ảnh Thumbnail & Banner',
      completed: Boolean(thumbValid && bannerValid),
      detail: !thumbValid && !bannerValid
        ? 'Chưa tải thumbnail và banner'
        : !thumbValid
        ? 'Chưa tải ảnh thumbnail'
        : !bannerValid
        ? 'Chưa tải ảnh banner'
        : 'Đã tải đủ ảnh',
    },
    {
      id: 'sessions',
      step: 2,
      label: 'Lịch trình & Địa điểm',
      completed: sessionsValid,
      detail: !hasSessions
        ? 'Cần tạo ít nhất 1 phiên sự kiện'
        : hasDifferentDaySessions
        ? 'Có phiên bắt đầu và kết thúc khác ngày (chỉ trong 1 ngày)'
        : overlapInfo
        ? `Trùng giờ: "${overlapInfo.nameA}" và "${overlapInfo.nameB}"`
        : !sessionsValid
        ? 'Phiên chưa đủ ngày giờ hoặc chưa chọn địa điểm'
        : `${formData.sessions.length} phiên hợp lệ`,
    },
    {
      id: 'tickets',
      step: 3,
      label: 'Hạng vé sự kiện',
      completed: ticketsValid,
      detail: !hasSessions
        ? 'Cần tạo phiên trước khi tạo vé'
        : !ticketsValid
        ? 'Mỗi phiên cần ít nhất 1 loại vé hợp lệ (tên, giá >= 0, số lượng > 0)'
        : 'Đã cấu hình đủ loại vé',
    },
    {
      id: 'seat_map',
      step: 3,
      label: 'Sơ đồ ghế (Phiên có ghế)',
      completed: seatMapValid,
      detail: !seatMapValid
        ? 'Có phiên chọn chỗ ngồi nhưng chưa gắn sơ đồ ghế'
        : 'Sơ đồ ghế hợp lệ',
    },
    {
      id: 'policies',
      step: 4,
      label: 'Chính sách & Điều khoản tham dự',
      completed: policiesValid,
      detail: !policiesValid
        ? 'Cần nhập điều khoản tham dự hoặc tải file chính sách'
        : policyFileUrl
        ? `Đã đính kèm file: ${formData.refund_policy?.policy_file_name || 'chính sách'}`
        : 'Đã thiết lập điều khoản tham dự',
    },
    {
      id: 'permits',
      step: 4,
      label: 'Giấy phép tổ chức & Giấy tờ liên quan',
      completed: permitsValid,
      detail: !permitsValid
        ? 'Cần tải lên giấy phép tổ chức hoặc giấy tờ liên quan'
        : `Đã tải lên ${permitFiles.length} tài liệu pháp lý`,
    },
    {
      id: 'review_terms',
      step: 5,
      label: 'Cam kết & Xác nhận xuất bản',
      completed: termsAccepted,
      detail: !termsAccepted
        ? 'Cần xác nhận cam kết điều khoản ở Bước 5'
        : 'Đã cam kết tuân thủ quy định',
    },
  ]

  const total = checklist.length
  const completedCount = checklist.filter((item) => item.completed).length
  const percent = Math.round((completedCount / total) * 100)
  const isReady = percent === 100 && checklist.every((item) => item.completed)
  const missingItems = checklist.filter((item) => !item.completed)

  return {
    checklist,
    completedCount,
    total,
    percent,
    isReady,
    missingItems,
  }
}

function WizardStepper({ currentStep, maxCompletedStep, onStepClick }) {
  const progress = ((currentStep - 1) / (STEP_LABELS.length - 1)) * 100

  return (
    <div className="mb-10 w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between relative">
        <div className="absolute top-5 left-0 w-full h-[2px] bg-border-soft/30 -z-10" />
        <div
          className="absolute top-5 left-0 h-[2px] bg-tertiary -z-10 transition-all"
          style={{ width: `${progress}%` }}
        />
        {STEP_LABELS.map((label, index) => {
          const step = index + 1
          const isActive = step === currentStep
          const isCompleted = step < currentStep
          const isClickable = step <= maxCompletedStep

          return (
            <button
              key={label}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(step)}
              className={`flex flex-col items-center gap-2 relative ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-sm transition-all z-10 ${isActive
                  ? 'bg-tertiary text-white shadow-md'
                  : isCompleted
                    ? 'bg-tertiary text-white'
                    : 'bg-panel-soft border-2 border-border-soft/50 text-content/80'
                  }`}
              >
                {isCompleted && !isActive ? (
                  <Icon name="check" className="text-[20px]" />
                ) : (
                  step
                )}
              </div>
              <span
                className={`font-medium text-[13px] leading-[18px] text-center max-w-[120px] ${isActive || isCompleted ? 'text-primary font-bold' : 'text-subtle'
                  }`}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SetupProgressWidget({ completeness, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-border-soft/30 bg-surface shadow-[0_4px_24px_rgba(0,0,0,0.18)] ${className}`}>
      <div className="border-b border-border-soft/30 bg-panel-soft/60 px-6 py-4 flex items-center justify-between">
        <h3 className="text-xs font-extrabold text-content uppercase tracking-wider flex items-center gap-2">
          <Icon name="monitoring" className="text-tertiary text-base" />
          Tiến độ thiết lập
        </h3>
        <span className={`text-xs font-bold ${completeness?.isReady ? 'text-success' : 'text-tertiary'}`}>
          {completeness?.percent ?? 0}%
        </span>
      </div>
      <div className="p-6 space-y-3">
        <div className="w-full h-2 bg-panel-soft rounded-full overflow-hidden border border-border-soft/20">
          <div
            className={`h-full rounded-full transition-all duration-500 ${completeness?.isReady ? 'bg-success' : 'bg-tertiary'}`}
            style={{ width: `${completeness?.percent ?? 0}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-subtle pt-1">
          <span>Mục hoàn thành</span>
          <strong className="text-content font-bold">
            {completeness?.completedCount ?? 0}/{completeness?.total ?? 0} mục
          </strong>
        </div>
      </div>
    </div>
  )
}

function Step1EventInfo({
  formData,
  setFormData,
  categories,
  tagInput,
  setTagInput,
  onThumbnailUpload,
  onBannerUpload,
  uploadingThumb,
  uploadingBanner,
  completeness,
}) {
  const [isAiModalOpen, setIsAiModalOpen] = useState(false)

  const addTag = () => {
    const tag = tagInput.trim()
    if (!tag || formData.tags.includes(tag)) return
    setFormData((prev) => ({ ...prev, tags: [...prev.tags, tag] }))
    setTagInput('')
  }

  return (
    <div className="grid grid-cols-12 gap-6 items-start">
      <div className="col-span-12 lg:col-span-8 space-y-4 pb-8">
        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 hover:border-border-soft/60 transition-shadow shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[20px] font-semibold flex items-center gap-2 text-content">
              <Icon name="info" className="text-tertiary" />
              Thông tin cơ bản
            </h3>
            <button
              type="button"
              onClick={() => setIsAiModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 active:scale-95"
            >
              <Sparkles className="size-4 animate-pulse" />
              ✨ Tạo nội dung với AI
            </button>
          </div>
          <div className="space-y-6">
            <div>
              <label className="block text-[13px] font-medium mb-2 text-subtle">Tên sự kiện*</label>
              <input
                className="w-full px-4 py-2.5 border border-border-soft/40 rounded-lg text-sm bg-panel-soft text-content focus:ring-2 focus:ring-secondary/30 focus:border-tertiary outline-none transition"
                placeholder="Ví dụ: Hội nghị Công nghệ Toàn cầu 2024"
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-medium mb-2 text-subtle">Danh mục*</label>
                <select
                  className="w-full px-4 py-2.5 border border-border-soft/40 rounded-lg text-sm bg-panel-soft text-content focus:ring-2 focus:ring-secondary/30 outline-none"
                  value={formData.category_id}
                  onChange={(e) => setFormData((p) => ({ ...p, category_id: e.target.value }))}
                >
                  <option value="">Chọn danh mục</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-2 text-subtle">Tags</label>
                <div className="flex flex-wrap gap-2 items-center p-1.5 border border-border-soft/40 rounded-lg bg-panel-soft">
                  {formData.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 px-2 py-1 bg-tertiary/15 text-tertiary rounded text-xs font-semibold"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((p) => ({
                            ...p,
                            tags: p.tags.filter((t) => t !== tag),
                          }))
                        }
                      >
                        <Icon name="close" className="text-[14px] hover:text-error" />
                      </button>
                    </span>
                  ))}
                  <input
                    className="border-none bg-transparent outline-none p-1 text-sm flex-1 min-w-[80px] text-content placeholder:text-muted"
                    placeholder="Thêm tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag()
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <h3 className="text-[20px] font-semibold mb-6 flex items-center gap-2 text-content">
            <Icon name="description" className="text-tertiary" />
            Mô tả
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-[13px] font-medium text-subtle">Mô tả ngắn*</label>
                <span className="text-xs text-muted">{formData.short_description.length} / 150</span>
              </div>
              <textarea
                className="w-full px-4 py-2.5 border border-border-soft/40 rounded-lg text-sm bg-panel-soft text-content focus:ring-2 focus:ring-secondary/30 outline-none resize-none placeholder:text-muted"
                placeholder="Tóm tắt ngắn gọn về sự kiện của bạn..."
                rows={2}
                maxLength={150}
                value={formData.short_description}
                onChange={(e) => setFormData((p) => ({ ...p, short_description: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium mb-2 text-subtle">* Thông tin sự kiện</label>
              <RichTextEditor
                value={formData.description}
                onChange={(val) => setFormData((p) => ({ ...p, description: val }))}
              />
            </div>
          </div>
        </section>

        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <h3 className="text-[20px] font-semibold mb-6 flex items-center gap-2 text-content">
            <Icon name="image" className="text-tertiary" />
            Ảnh sự kiện
          </h3>
          <div className="flex flex-col md:flex-row gap-6 h-auto md:h-[240px]">
            <div className="w-full md:w-1/3 flex flex-col">
              <label className="block text-[13px] font-medium mb-2 text-subtle shrink-0">Ảnh đại diện (1:1)*</label>
              <label className="flex-1 w-full rounded-xl flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-border-soft/40 hover:border-tertiary cursor-pointer overflow-hidden transition bg-panel-soft">
                {formData.thumbnail_url ? (
                  <img src={formData.thumbnail_url} alt="Thumbnail" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Icon name="cloud_upload" className="text-muted mb-2" style={{ fontSize: 32 }} />
                    <p className="text-xs font-semibold mb-1 text-subtle">{uploadingThumb ? 'Đang tải lên...' : 'Nhấn để tải lên'}</p>
                    <p className="text-[10px] text-muted">Khuyên dùng: 1080x1080px</p>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingThumb}
                  onChange={(e) => onThumbnailUpload(e.target.files?.[0])}
                />
              </label>
            </div>
            <div className="w-full md:w-2/3 flex flex-col">
              <label className="block text-[13px] font-medium mb-2 text-subtle shrink-0">Ảnh bìa (16:9)*</label>
              <label className="flex-1 w-full rounded-xl flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-border-soft/40 hover:border-tertiary cursor-pointer overflow-hidden transition bg-panel-soft">
                {formData.banner_url ? (
                  <img src={formData.banner_url} alt="Banner" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Icon name="landscape" className="text-muted mb-2" style={{ fontSize: 40 }} />
                    <p className="text-xs font-semibold mb-1 text-subtle">{uploadingBanner ? 'Đang tải lên...' : 'Kéo thả hoặc nhấn để chọn file'}</p>
                    <p className="text-[10px] text-muted">Khuyên dùng: 1920x1080px. JPG, PNG (Tối đa 5MB)</p>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingBanner}
                  onChange={(e) => onBannerUpload(e.target.files?.[0])}
                />
              </label>
            </div>
          </div>
        </section>
      </div >

      <div className="col-span-12 lg:col-span-4 space-y-6 sticky top-24">
        <SetupProgressWidget completeness={completeness} />

        <div className="bg-surface border border-border-soft/30 rounded-xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
          <div className="relative aspect-video bg-panel-soft">
            {formData.banner_url ? (
              <img src={formData.banner_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center opacity-40">
                <Icon name="image" className="text-muted" style={{ fontSize: 48 }} />
              </div>
            )}
            <div className="absolute top-3 left-3 px-2 py-1 bg-panel-soft/80 backdrop-blur-md rounded text-[10px] font-bold uppercase text-subtle">
              Xem trước
            </div>
          </div>
          <div className="p-5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className={`text-[20px] font-semibold leading-tight ${formData.title ? 'text-content' : 'text-muted italic'}`}>
                  {formData.title || 'Sự kiện không tiêu đề'}
                </h4>
                <p className="text-xs text-muted mt-1 italic">
                  {categories.find((c) => c.id === formData.category_id)?.name || 'Chưa chọn danh mục'}
                </p>
              </div>
              <span className="px-2 py-1 bg-panel-soft text-subtle rounded text-xs font-semibold border border-border-soft/30">Bản nháp</span>
            </div>
            <div className="flex items-center gap-2">
              <Icon name="location_on" className="text-tertiary text-[18px]" />
              <span className="text-sm text-content">{formData.format === 'ONLINE' ? 'Sự kiện trực tuyến' : formData.format === 'HYBRID' ? 'Sự kiện kết hợp' : 'Sự kiện trực tiếp'}</span>
            </div>
          </div>
        </div>
      </div>

      <AiEventContentGeneratorModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        categories={categories}
        initialCategory={categories.find((c) => c.id === formData.category_id)?.name || ''}
        eventId={formData.id || null}
        onApply={(generated) => {
          setFormData((prev) => ({
            ...prev,
            title: generated.title || prev.title,
            short_description: generated.short_description || prev.short_description,
            description: generated.description || generated.content_html || prev.description,
            tags: Array.from(new Set([...prev.tags, ...(generated.tags || [])])),
          }))
          setIsAiModalOpen(false)
        }}
      />
    </div>
  )
}


function Step2ScheduleVenue({ formData, setFormData, venues, completeness }) {
  const currentDate = new Date()
  const today = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
  const [expandedSessions, setExpandedSessions] = useState(() => {
    return formData.sessions.reduce((acc, s) => ({ ...acc, [s.id || s.clientKey]: true }), {})
  })

  const sessionOverlapInfo = useMemo(() => checkSessionsOverlap(formData.sessions), [formData.sessions])

  const toggleSession = (key) => setExpandedSessions((p) => ({ ...p, [key]: !p[key] }))

  const addSession = () => {
    const key = newClientKey()
    setFormData((p) => ({
      ...p,
      sessions: [
        ...p.sessions,
        {
          clientKey: key,
          session_name: '',
          start_date: '',
          start_time: '',
          end_date: '',
          end_time: '',
          venue_id: '',
          checkin_start_time: '',
          seat_map_id: null,
          seating_type: 'GENERAL',
          zone_assignments: [],
        },
      ],
    }))
    setExpandedSessions((p) => ({ ...p, [key]: true }))
  }

  const updateSession = (key, field, value) => {
    setFormData((p) => {
      let nextTickets = p.ticketTypes;
      const nextSessions = p.sessions.map((s) => {
        if (String(s.id || s.clientKey) === String(key)) {
          if (field === 'venue_id' && s.venue_id !== value) {
            nextTickets = nextTickets.filter(tt => String(tt.session_key) !== String(key) || !tt.is_seated);
            return { ...s, [field]: value, seat_map_id: null, zone_assignments: [] };
          }
          return { ...s, [field]: value };
        }
        return s;
      });
      return { ...p, sessions: nextSessions, ticketTypes: nextTickets };
    })
  }

  const updateSessionFields = (key, fieldsObj) => {
    setFormData((p) => {
      let nextTickets = p.ticketTypes;
      const nextSessions = p.sessions.map((s) => {
        if (String(s.id || s.clientKey) === String(key)) {
          let updated = { ...s, ...fieldsObj };
          if (fieldsObj.venue_id !== undefined && s.venue_id !== fieldsObj.venue_id) {
            nextTickets = nextTickets.filter(tt => String(tt.session_key) !== String(key) || !tt.is_seated);
            updated = { ...updated, seat_map_id: null, zone_assignments: [] };
          }
          return updated;
        }
        return s;
      });
      return { ...p, sessions: nextSessions, ticketTypes: nextTickets };
    })
  }

  const removeSession = (key) => {
    setFormData((p) => ({
      ...p,
      sessions: p.sessions.filter((s) => String(s.id || s.clientKey) !== String(key)),
      ticketTypes: p.ticketTypes.filter((tt) => String(tt.session_key) !== String(key)),
    }))
  }

  const selectedVenue = venues.find((v) => v.id === formData.sessions[0]?.venue_id)

  return (
    <div className="grid grid-cols-12 gap-6 items-start">
      <div className="col-span-12 lg:col-span-8 space-y-4 pb-8">
        <section className="bg-surface rounded-xl border border-border-soft/30 p-8 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Icon name="calendar_today" className="text-tertiary" />
              <h2 className="text-[20px] font-semibold text-content">Lịch sự kiện</h2>
            </div>
            <button
              type="button"
              onClick={addSession}
              className="flex items-center gap-2 px-4 py-2 text-primary font-medium text-sm hover:bg-tertiary/10 rounded-lg transition"
            >
              <Icon name="add" className="text-[18px]" />
              Thêm phiên
            </button>
          </div>

          {sessionOverlapInfo && (
            <div className="mb-6 p-4 rounded-xl border border-error/50 bg-error/10 text-error flex items-start gap-3 shadow-sm">
              <Icon name="warning" className="text-xl shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-bold">Trùng lặp thời gian giữa các phiên sự kiện:</div>
                <p className="mt-1 text-xs leading-relaxed text-error/90">
                  Phiên <strong>"{sessionOverlapInfo.nameA}"</strong> và phiên <strong>"{sessionOverlapInfo.nameB}"</strong> có thời gian diễn ra trùng nhau. Mỗi phiên phải kết thúc trong cùng một ngày và các phiên không được diễn ra đồng thời. Vui lòng điều chỉnh thời gian để các phiên tách biệt.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {formData.sessions.map((session, index) => {
              const key = session.id || session.clientKey
              const isExpanded = expandedSessions[key]
              const isDifferentDate = Boolean(session.start_date && session.end_date && session.start_date !== session.end_date)
              const isOverlapped = Boolean(
                sessionOverlapInfo &&
                (String(key) === String(sessionOverlapInfo.keyA) || String(key) === String(sessionOverlapInfo.keyB))
              )

              return (
                <div
                  key={key}
                  className={`border rounded-xl relative overflow-hidden mb-4 shadow-sm transition-all ${
                    isDifferentDate || isOverlapped ? 'border-error/80 ring-1 ring-error/30 bg-error/5' : 'border-border-soft/40 bg-panel-soft/30'
                  }`}
                >
                  <div
                    className="p-5 flex items-center justify-between cursor-pointer hover:bg-surface/70 transition-colors"
                    onClick={() => toggleSession(key)}
                  >
                    <div className="flex items-center gap-3 w-1/2">
                      <div className="text-tertiary flex items-center justify-center">
                        <Icon name={isExpanded ? 'expand_less' : 'expand_more'} className="text-[24px]" />
                      </div>
                      <input
                        type="text"
                        value={session.session_name || ''}
                        placeholder={`Phiên ${index + 1}`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateSession(key, 'session_name', e.target.value)}
                        className="font-bold text-content text-[15px] bg-transparent border-b border-transparent focus:border-tertiary focus:outline-none focus:ring-0 px-2 py-1 w-full"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {isDifferentDate && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-error/15 text-error flex items-center gap-1">
                          <Icon name="error" className="text-xs" /> Khác ngày
                        </span>
                      )}
                      {isOverlapped && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-error/15 text-error flex items-center gap-1">
                          <Icon name="schedule" className="text-xs" /> Trùng giờ
                        </span>
                      )}
                      {formData.sessions.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeSession(key); }}
                          className="text-muted hover:text-error transition p-2"
                          title="Xóa phiên"
                        >
                          <Icon name="delete" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-6 pt-4 border-t border-border-soft/30 bg-panel-soft/10">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                        <div>
                          <label className="text-[13px] text-subtle block mb-2 font-medium">Thời gian bắt đầu*</label>
                          <input
                            type="datetime-local"
                            className="w-full h-11 px-4 rounded-lg border border-border-soft/40 bg-panel-soft text-content text-sm focus:border-tertiary focus:ring-1 focus:ring-secondary/30 outline-none"
                            value={session.start_date && session.start_time ? `${session.start_date}T${session.start_time}` : ''}
                            onChange={(e) => {
                              const val = e.target.value
                              if (!val) {
                                updateSessionFields(key, { start_date: '', start_time: '' })
                              } else {
                                const [d, t] = val.split('T')
                                const updates = { start_date: d || '', start_time: t || '' }
                                if (d) {
                                  // Rule: Single-day session. Auto-synchronize end_date and checkin_start_date with start_date
                                  updates.end_date = d
                                  if (!session.checkin_start_date || session.checkin_start_date === session.start_date) {
                                    updates.checkin_start_date = d
                                  }
                                }
                                updateSessionFields(key, updates)
                              }
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-[13px] text-subtle block mb-2 font-medium">Thời gian kết thúc*</label>
                          <input
                            type="datetime-local"
                            className="w-full h-11 px-4 rounded-lg border border-border-soft/40 bg-panel-soft text-content text-sm focus:border-tertiary focus:ring-1 focus:ring-secondary/30 outline-none"
                            value={session.end_date && session.end_time ? `${session.end_date}T${session.end_time}` : ''}
                            onChange={(e) => {
                              const val = e.target.value
                              if (!val) {
                                updateSessionFields(key, { end_date: '', end_time: '' })
                              } else {
                                const [d, t] = val.split('T')
                                // Enforce same calendar day if start_date exists
                                const targetDate = session.start_date || d || ''
                                updateSessionFields(key, { end_date: targetDate, end_time: t || '' })
                              }
                            }}
                          />
                        </div>
                      </div>

                      {isDifferentDate && (
                        <div className="mb-4 p-3 rounded-xl border border-error/40 bg-error/10 text-error text-xs flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-semibold">
                            <Icon name="error" className="text-base shrink-0" />
                            <span>
                              Ngày bắt đầu (<strong>{session.start_date}</strong>) và ngày kết thúc (<strong>{session.end_date}</strong>) khác nhau. Mỗi phiên phải kết thúc trong cùng ngày.
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => updateSessionFields(key, { end_date: session.start_date })}
                            className="px-3 py-1.5 bg-error text-white font-bold rounded-lg shadow-sm hover:bg-error/90 transition text-xs shrink-0"
                          >
                            Đồng bộ ngày kết thúc về {session.start_date}
                          </button>
                        </div>
                      )}

                      {isOverlapped && sessionOverlapInfo && (
                        <div className="mb-4 p-3 rounded-xl border border-error/40 bg-error/10 text-error text-xs flex items-center gap-2">
                          <Icon name="warning" className="text-base shrink-0" />
                          <span>
                            Phiên này đang bị trùng thời gian với <strong>"{String(key) === String(sessionOverlapInfo.keyA) ? sessionOverlapInfo.nameB : sessionOverlapInfo.nameA}"</strong>. Các phiên không được diễn ra đồng thời.
                          </span>
                        </div>
                      )}

                      <div className="mb-4">
                        <label className="text-[13px] text-subtle block mb-2 font-medium">Thời gian check-in (Tùy chọn)</label>
                        <input
                          type="datetime-local"
                          className="w-full h-11 px-4 rounded-lg border border-border-soft/40 bg-panel-soft text-content text-sm focus:border-tertiary outline-none"
                          value={session.checkin_start_date && session.checkin_start_time ? `${session.checkin_start_date}T${session.checkin_start_time}` : ''}
                          onChange={(e) => {
                            const val = e.target.value
                            if (!val) {
                              updateSessionFields(key, { checkin_start_date: '', checkin_start_time: '' })
                            } else {
                              const [d, t] = val.split('T')
                              updateSessionFields(key, { checkin_start_date: session.start_date || d || '', checkin_start_time: t || '' })
                            }
                          }}
                        />
                      </div>

                      {(() => {
                        if (!session.start_date || !session.start_time) return null
                        const startMs = new Date(`${session.start_date}T${session.start_time}`).getTime()
                        const nowMs = Date.now()
                        const hoursDiff = (startMs - nowMs) / (60 * 60 * 1000)
                        if (hoursDiff <= 48 && hoursDiff > 0) {
                          return (
                            <div className="mb-4 p-4 rounded-xl border border-warning/30 bg-warning/10 text-warning text-xs space-y-1.5">
                              <div className="flex items-center gap-1.5 font-bold">
                                <Icon name="warning" className="text-sm text-warning" />
                                <span>Cảnh báo tạo phiên sát giờ ({Math.round(hoursDiff * 10) / 10} giờ tới):</span>
                              </div>
                              <p className="leading-relaxed">
                                Phiên này sẽ bắt đầu trong vòng 48h tới. Khi sự kiện được Admin phê duyệt, hệ thống sẽ tự động bật chế độ <strong>Khóa thời gian (Time-Lock 48h)</strong>. Lúc đó bạn sẽ không thể tự do chỉnh sửa thông tin/suất diễn trừ khi liên hệ Admin trợ giúp.
                              </p>
                            </div>
                          )
                        }
                        return null
                      })()}

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-[13px] text-subtle block font-medium">Chọn địa điểm*</label>
                          <button
                            type="button"
                            onClick={() => window.open('/organizer/venues', '_blank')}
                            className="text-[13px] text-primary hover:underline font-semibold"
                          >
                            + Tạo địa điểm mới
                          </button>
                        </div>
                        <select
                          className="w-full h-11 px-4 rounded-lg border border-border-soft/40 bg-panel-soft text-content text-sm focus:border-tertiary outline-none"
                          value={session.venue_id || ''}
                          onChange={(e) => updateSession(key, 'venue_id', e.target.value)}
                        >
                          <option value="">Chọn địa điểm</option>
                          {venues.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}{v.city ? ` (${v.city})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {!formData.sessions.length && (
              <button
                type="button"
                onClick={addSession}
                className="w-full py-8 border-2 border-dashed border-border-soft/40 rounded-xl text-subtle hover:border-tertiary hover:text-tertiary transition"
              >
                + Thêm phiên đầu tiên
              </button>
            )}
          </div>
        </section>

        {
          selectedVenue && (
            <section className="bg-surface rounded-xl border border-border-soft/30 p-8 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
              <div className="flex items-center gap-3 mb-6">
                <Icon name="location_on" className="text-tertiary" />
                <h2 className="text-[20px] font-semibold text-content">Chi tiết địa điểm</h2>
              </div>
              <div className="p-6 bg-panel-soft rounded-xl border border-border-soft/30">
                <h3 className="text-[20px] font-semibold text-content">{selectedVenue.name}</h3>
                <p className="text-sm text-subtle flex items-center gap-1 mt-2">
                  <Icon name="pin_drop" className="text-[16px]" />
                  {[selectedVenue.address_line, selectedVenue.district, selectedVenue.city].filter(Boolean).join(', ')}
                </p>
                {(selectedVenue.max_seats > 0 || selectedVenue.seat_count > 0) && (
                  <p className="text-sm mt-2 text-subtle">
                    Sức chứa tối đa: <span className="font-bold text-content">{selectedVenue.max_seats || selectedVenue.seat_count} người</span> (Gồm ghế + khu vực đứng)
                  </p>
                )}
              </div>
            </section>
          )
        }
      </div >

      <div className="col-span-12 lg:col-span-4 sticky top-24 space-y-6">
        <SetupProgressWidget completeness={completeness} />

        <div className="bg-surface rounded-xl border border-border-soft/30 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
          <div className="bg-tertiary/15 p-6 border-b border-border-soft/30">
            <h3 className="text-[20px] font-semibold text-content mb-4">{formData.title || 'Sự kiện nháp'}</h3>
            <div className="space-y-3 text-sm text-subtle">
              <div className="flex items-center gap-2">
                <Icon name="calendar_month" className="text-sm" />
                <span>{formData.sessions.length} phiên</span>
              </div>
              {selectedVenue && (
                <div className="flex items-center gap-2">
                  <Icon name="location_on" className="text-sm" />
                  <span>{selectedVenue.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div >
  )
}

function formatPriceString(val) {
  if (val === '' || val === null || val === undefined) return ''
  const num = typeof val === 'number' ? val : Number(String(val).replace(/\D/g, ''))
  if (isNaN(num)) return ''
  return num.toLocaleString('vi-VN')
}

function parsePriceNumber(str) {
  if (!str) return ''
  const cleaned = String(str).replace(/\D/g, '')
  return cleaned === '' ? '' : Number(cleaned)
}

function getGroupedMapItems(seatMap) {
  if (!seatMap) return []

  const countsByZoneId = (seatMap.seats || []).reduce((acc, seat) => {
    if (seat.is_disabled || !seat.zone_id) return acc
    acc[seat.zone_id] = (acc[seat.zone_id] || 0) + 1
    return acc
  }, {})

  const seatedItems = (seatMap.zones || []).map((zone, index) => ({
    groupKey: `seated:${zone.id || index}`,
    name: (zone.name || 'Khu vực').trim(),
    isSeated: true,
    zoneIds: zone.id ? [zone.id] : [],
    standingAreaIds: [],
    totalQuantity: countsByZoneId[zone.id] || 0,
    colors: [zone.color || '#3B82F6'],
  }))

  const standingItems = (seatMap.config?.standingAreas || []).map((area, index) => ({
    groupKey: `standing:${area.id || index}`,
    name: (area.name || 'Vùng đứng').trim(),
    isSeated: false,
    zoneIds: [],
    standingAreaIds: area.id ? [area.id] : [],
    totalQuantity: Number(area.capacity || 0),
    colors: [area.color || '#EF4444'],
  }))

  return [...seatedItems, ...standingItems]
}

function TicketDescriptionModal({ isOpen, ticketName, initialDescription, onSave, onClose }) {
  const [desc, setDesc] = useState(initialDescription || '')

  useEffect(() => {
    setDesc(initialDescription || '')
  }, [initialDescription, isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4">
      <div className="w-full max-w-md rounded-2xl border border-border-soft/40 bg-surface p-6 shadow-2xl space-y-4 text-content">
        <div className="flex items-center justify-between border-b border-border-soft/30 pb-3">
          <h3 className="text-base font-extrabold text-content">
            Mô tả loại vé: <span className="text-tertiary">{ticketName}</span>
          </h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-content text-sm font-bold">✕</button>
        </div>
        <div>
          <label className="text-xs text-subtle font-semibold mb-1.5 block">Nội dung mô tả vé (quyền lợi, lối đi, quà tặng...):</label>
          <textarea
            rows={4}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="VD: Bao gồm nước ngọt + snack miễn phí, vị trí gần sân khấu..."
            className="w-full rounded-xl border border-border-soft/40 bg-panel-soft p-3 text-xs text-content outline-none focus:border-tertiary shadow-inner leading-relaxed"
            autoFocus
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-subtle hover:bg-panel-soft hover:text-content transition"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(desc)
            }}
            className="org-btn-primary px-5 py-2 text-xs"
          >
            Lưu mô tả
          </button>
        </div>
      </div>
    </div>
  )
}

function Step3TicketsSeats({ formData, setFormData, venues, completeness }) {
  const [activeTab, setActiveTab] = useState(0)
  const [seatMapOptions, setSeatMapOptions] = useState({})
  const [loadedSeatMap, setLoadedSeatMap] = useState(null)
  const [loadingMaps, setLoadingMaps] = useState(false)
  const [showSyncConfirm, setShowSyncConfirm] = useState(false)
  const [descModalState, setDescModalState] = useState({
    isOpen: false,
    ticketName: '',
    initialDescription: '',
    onSave: null,
  })

  const sessions = formData.sessions
  const activeSession = sessions[activeTab]
  const sessionKey = activeSession ? activeSession.id || activeSession.clientKey : null
  const seatingType = activeSession?.seating_type || 'GENERAL'
  const venue = venues.find((v) => v.id === activeSession?.venue_id)

  const handleSyncSessionConfig = () => {
    if (!activeSession) return
    setFormData((p) => {
      let copiedCount = 0;
      const newSessions = p.sessions.map((s) => {
        if (String(s.id || s.clientKey) === String(sessionKey)) return s;
        if (s.venue_id !== activeSession.venue_id) return s;
        copiedCount++;
        return {
          ...s,
          seating_type: activeSession.seating_type,
          seat_map_id: activeSession.seat_map_id,
          zone_assignments: activeSession.zone_assignments ? [...activeSession.zone_assignments] : []
        }
      });

      if (copiedCount === 0 && p.sessions.length > 1) {
        window.dispatchEvent(new CustomEvent('eventhub:toast', { detail: { type: 'warning', message: 'Không có phiên nào khác cùng địa điểm để đồng bộ.' } }))
        return p;
      }

      const newTicketTypes = p.ticketTypes.filter((t) => String(t.session_key) === String(sessionKey))
      for (const s of newSessions) {
        if (String(s.id || s.clientKey) === String(sessionKey) || s.venue_id !== activeSession.venue_id) continue
        const cloned = newTicketTypes.map(t => {
          const idStr = String(t.id || t.clientKey);
          return {
            ...t,
            id: idStr.startsWith('tmp-') ? null : undefined,
            clientKey: newClientKey(),
            session_key: s.id || s.clientKey
          };
        })
        newTicketTypes.push(...cloned)
      }

      const untouchedTicketTypes = p.ticketTypes.filter((t) => {
        const sess = p.sessions.find(x => String(x.id || x.clientKey) === String(t.session_key));
        return sess && sess.venue_id !== activeSession.venue_id && String(sess.id || sess.clientKey) !== String(sessionKey);
      });

      return { ...p, sessions: newSessions, ticketTypes: [...newTicketTypes, ...untouchedTicketTypes] }
    })
    window.dispatchEvent(new CustomEvent('eventhub:toast', { detail: { type: 'success', message: 'Đã áp dụng cấu hình cho các phiên cùng địa điểm.' } }))
    setShowSyncConfirm(false)
  }

  const sessionTickets = formData.ticketTypes.filter((tt) => tt.session_key === sessionKey)

  useEffect(() => {
    if (!activeSession?.venue_id) return
    let cancelled = false
    setSeatMapOptions((prev) => {
      if (prev[activeSession.venue_id]) return prev
      return prev
    })
    if (seatMapOptions[activeSession.venue_id]) return
    getVenueSeatMaps(activeSession.venue_id)
      .then((maps) => {
        if (cancelled) return
        setSeatMapOptions((prev) => (prev[activeSession.venue_id] ? prev : { ...prev, [activeSession.venue_id]: maps }))
      })
      .catch(console.error)
    return () => {
      cancelled = true
    }
  }, [activeSession?.venue_id])

  useEffect(() => {
    if (!activeSession?.seat_map_id) {
      setLoadedSeatMap(null)
      return
    }
    setLoadingMaps(true)
    getSeatMap(activeSession.seat_map_id)
      .then((sm) => {
        setLoadedSeatMap(sm)
        if (sessionKey) {
          const groups = getGroupedMapItems(sm)
          setFormData((p) => {
            const currentSessionTickets = p.ticketTypes.filter((tt) => String(tt.session_key) === String(sessionKey))
            const missingGroups = groups.filter((group) => !currentSessionTickets.some((ticket) => {
              if (group.isSeated !== Boolean(ticket.is_seated)) return false
              if (group.isSeated) {
                return group.zoneIds.some((id) => id === ticket.zone_id || (ticket.zone_ids || []).includes(id))
              }
              return group.standingAreaIds.some(
                (id) => id === ticket.standing_area_id || (ticket.standing_area_ids || []).includes(id),
              )
            }))
            if (missingGroups.length === 0) return p

            const newTickets = missingGroups.map((g) => ({
              clientKey: newClientKey(),
              session_key: sessionKey,
              name: g.name,
              description: '',
              price: '',
              quantity: g.totalQuantity,
              is_seated: g.isSeated,
              zone_ids: g.zoneIds,
              standing_area_ids: g.standingAreaIds,
              zone_id: g.zoneIds[0] || null,
              standing_area_id: g.standingAreaIds[0] || null,
            }))

            return {
              ...p,
              ticketTypes: [...p.ticketTypes, ...newTickets],
            }
          })
        }
      })
      .catch(console.error)
      .finally(() => setLoadingMaps(false))
  }, [activeSession?.seat_map_id, sessionKey])

  const updateActiveSession = (updates) => {
    setFormData((p) => ({
      ...p,
      sessions: p.sessions.map((s, i) => (i === activeTab ? { ...s, ...updates } : s)),
    }))
  }

  const setSeatingType = (type) => {
    if (!sessionKey) return
    updateActiveSession({
      seating_type: type,
      seat_map_id: type === 'ASSIGNED' ? activeSession.seat_map_id : null,
      zone_assignments: type === 'ASSIGNED' ? activeSession.zone_assignments || [] : [],
    })
    if (type === 'GENERAL') {
      setLoadedSeatMap(null)
      setFormData((p) => ({
        ...p,
        ticketTypes: p.ticketTypes
          .filter((tt) => tt.session_key !== sessionKey)
          .concat(
            p.ticketTypes.filter((tt) => tt.session_key === sessionKey).length
              ? []
              : [
                {
                  clientKey: newClientKey(),
                  session_key: sessionKey,
                  name: '',
                  description: '',
                  price: '',
                  quantity: 1,
                  is_seated: false,
                },
              ],
          ),
      }))
    } else {
      setFormData((p) => ({
        ...p,
        ticketTypes: p.ticketTypes.filter((tt) => tt.session_key !== sessionKey),
      }))
    }
  }

  const handleSeatMapSelect = async (seatMapId) => {
    if (!sessionKey || !seatMapId) return
    try {
      const sm = await getSeatMap(seatMapId)
      setLoadedSeatMap(sm)
      const groups = getGroupedMapItems(sm)
      const allNewTickets = []
      const zoneAssignments = []

      groups.forEach((group) => {
        const clientKey = newClientKey()
        allNewTickets.push({
          clientKey,
          session_key: sessionKey,
          name: group.name,
          description: '',
          price: '',
          quantity: group.totalQuantity,
          is_seated: group.isSeated,
          zone_ids: group.zoneIds,
          standing_area_ids: group.standingAreaIds,
          zone_id: group.zoneIds[0] || null,
          standing_area_id: group.standingAreaIds[0] || null,
        })

        group.zoneIds.forEach((zId) => {
          zoneAssignments.push({
            zone_id: zId,
            ticket_type_local_id: clientKey,
          })
        })
      })

      updateActiveSession({ seat_map_id: seatMapId, zone_assignments: zoneAssignments })
      setFormData((p) => ({
        ...p,
        ticketTypes: [...p.ticketTypes.filter((tt) => tt.session_key !== sessionKey), ...allNewTickets],
      }))
    } catch (err) {
      console.error(err)
    }
  }

  const addTicketType = () => {
    if (!sessionKey) return
    setFormData((p) => ({
      ...p,
      ticketTypes: [
        ...p.ticketTypes,
        {
          clientKey: newClientKey(),
          session_key: sessionKey,
          name: '',
          description: '',
          price: '',
          quantity: 1,
          is_seated: false,
        },
      ],
    }))
  }

  const updateTicket = (key, field, value) => {
    setFormData((p) => ({
      ...p,
      ticketTypes: p.ticketTypes.map((tt) =>
        String(tt.id || tt.clientKey) === String(key) ? { ...tt, [field]: value } : tt,
      ),
    }))
  }

  const removeTicket = (key) => {
    setFormData((p) => ({
      ...p,
      ticketTypes: p.ticketTypes.filter((tt) => String(tt.id || tt.clientKey) !== String(key)),
    }))
  }

  const totalQty = formData.ticketTypes.reduce((sum, tt) => sum + Number(tt.quantity || 0), 0)
  const totalRevenue = formData.ticketTypes.reduce(
    (sum, tt) => sum + Number(tt.price || 0) * Number(tt.quantity || 0),
    0,
  )

  const venueSeatMaps = seatMapOptions[activeSession?.venue_id] || []
  const unassignedCount = loadedSeatMap
    ? (loadedSeatMap.seats || []).filter((s) => !s.zone_id && !s.is_disabled).length
    : 0

  return (
    <div className="grid grid-cols-12 items-start gap-6">
      <div className="col-span-12 space-y-6 pb-24 lg:col-span-8">
        {sessions.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft/30 pb-4">
            <div className="flex flex-wrap gap-2">
              {sessions.map((s, i) => (
                <button
                  key={s.id || s.clientKey}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${activeTab === i
                    ? 'border-tertiary bg-tertiary/10 text-primary'
                    : 'border-border-soft/40 text-subtle hover:border-tertiary/50'
                    }`}
                >
                  {s.session_name || `Phiên ${i + 1}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <h2 className="mb-4 text-[20px] font-semibold text-content">Loại tổ chức</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setSeatingType('GENERAL')}
              className={`rounded-xl border-2 p-5 text-left transition ${seatingType === 'GENERAL'
                ? 'border-tertiary bg-tertiary/10'
                : 'border-border-soft/40 hover:border-tertiary/50'
                }`}
            >
              <p className="mt-2 font-bold text-content">Không chỗ ngồi</p>
              <p className="text-sm text-subtle">Vé phổ thông / Không chọn chỗ</p>
            </button>
            <button
              type="button"
              onClick={() => setSeatingType('ASSIGNED')}
              className={`rounded-xl border-2 p-5 text-left transition ${seatingType === 'ASSIGNED'
                ? 'border-tertiary bg-tertiary/10'
                : 'border-border-soft/40 hover:border-tertiary/50'
                }`}
            >

              <p className="mt-2 font-bold text-content">Có chỗ ngồi</p>
              <p className="text-sm text-subtle">Chọn chỗ ngồi trên sơ đồ ghế</p>
            </button>
          </div>
        </section>

        {seatingType === 'ASSIGNED' && (
          <>
            <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
              <h2 className="mb-2 text-[20px] font-semibold text-content">Cấu hình quy tắc chỗ ngồi</h2>
              <p className="mb-4 text-sm text-subtle">
                Cấu hình quy tắc khi người dùng chọn ghế (áp dụng cho các session có chỗ ngồi).
              </p>
              <div className="space-y-3">
                {[
                  {
                    key: 'require_adjacent_seats',
                    label: 'Bắt buộc chọn ghế liền kề',
                  },
                  { key: 'require_same_row', label: 'Bắt buộc cùng một hàng' },
                  { key: 'disallow_single_seat_left', label: 'Không cho phép để lại ghế lẻ' },
                ].map((rule) => (
                  <label
                    key={rule.key}
                    className="flex items-center gap-3 rounded-lg border border-border-soft/30 bg-panel-soft/40 px-4 py-3 text-sm text-content hover:border-border-soft/60 transition cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-tertiary"
                      checked={Boolean(formData.seating_rules?.[rule.key])}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          seating_rules: {
                            ...(p.seating_rules || {}),
                            [rule.key]: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span className="font-semibold">{rule.label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
              <h2 className="mb-2 text-[20px] font-semibold text-content">Sơ đồ ghế</h2>
              <p className="mb-4 text-sm text-subtle">
                Chọn sơ đồ cho địa điểm &quot;{venue?.name || '...'}&quot;
              </p>
              <select
                className="h-11 w-full rounded-lg border border-border-soft/40 bg-panel-soft text-content px-4 text-sm focus:border-tertiary outline-none"
                value={activeSession?.seat_map_id || ''}
                onChange={(e) => handleSeatMapSelect(e.target.value)}
              >
                <option value="">-- Chọn sơ đồ --</option>
                {venueSeatMaps.map((sm) => (
                  <option key={sm.id} value={sm.id}>
                    {sm.name} ({sm.seat_count || 0} ghế, {sm.zone_count || 0} khu vực)
                  </option>
                ))}
              </select>
              {loadingMaps && (
                <p className="mt-2 text-sm text-muted">Đang tải sơ đồ...</p>
              )}
              {loadedSeatMap && (
                <div className="mt-4 w-full">
                  <SeatMapPreview
                    seatMap={loadedSeatMap}
                    seats={loadedSeatMap.seats}
                    zones={loadedSeatMap.zones}
                    height={380}
                  />
                </div>
              )}
            </section>

            {loadedSeatMap && (() => {
              const groupedItems = getGroupedMapItems(loadedSeatMap)

              return (
                <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-4">
                  <div>
                    <h2 className="text-[20px] font-semibold text-content">Gán giá & mô tả vé theo từng khu vực</h2>
                    <p className="text-sm text-subtle mt-1">
                      Mỗi khu vực hoặc vùng đứng trên sơ đồ có một dòng riêng để thiết lập giá và mô tả.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-soft/30 text-left text-xs uppercase tracking-wider text-muted">
                          <th className="py-3 pr-4">Khu vực / Vùng</th>
                          <th className="py-3 pr-4">Hình thức</th>
                          <th className="py-3 pr-4">Sức chứa</th>
                          <th className="py-3 pr-4">Tên loại vé & Mô tả</th>
                          <th className="py-3">Giá vé (VND)*</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-soft/20">
                        {groupedItems.map((group) => {
                          const ticket = sessionTickets.find((tt) => {
                            if (group.isSeated) {
                              return Boolean(tt.is_seated) && group.zoneIds.some(
                                (id) => id === tt.zone_id || (tt.zone_ids || []).includes(id),
                              )
                            }
                            return !tt.is_seated && group.standingAreaIds.some(
                              (id) => id === tt.standing_area_id || (tt.standing_area_ids || []).includes(id),
                            )
                          })

                          const ticketKey = ticket ? ticket.id || ticket.clientKey : null

                          const ensureGroupTicket = (extraFields = {}) => {
                            if (ticketKey) {
                              setFormData((p) => ({
                                ...p,
                                ticketTypes: p.ticketTypes.map((tItem) => {
                                  const currentKey = tItem.id || tItem.clientKey
                                  if (currentKey === ticketKey) {
                                    return { ...tItem, ...extraFields }
                                  }
                                  return tItem
                                }),
                              }))
                              return ticketKey
                            }

                            const newKey = newClientKey()
                            const newTicket = {
                              clientKey: newKey,
                              session_key: sessionKey,
                              name: group.name,
                              description: '',
                              price: '',
                              quantity: group.totalQuantity,
                              is_seated: group.isSeated,
                              zone_ids: group.zoneIds,
                              standing_area_ids: group.standingAreaIds,
                              zone_id: group.zoneIds[0] || null,
                              standing_area_id: group.standingAreaIds[0] || null,
                              ...extraFields,
                            }
                            setFormData((p) => ({
                              ...p,
                              ticketTypes: [...p.ticketTypes, newTicket],
                            }))
                            return newKey
                          }

                          return (
                            <tr key={group.groupKey} className="hover:bg-panel-soft/30 transition text-content border-b border-border-soft/20">
                              <td className="py-4 pr-4 align-top">
                                <div className="flex items-center gap-2">
                                  <div className="flex -space-x-1">
                                    {group.colors.map((c, i) => (
                                      <span key={i} className="h-3.5 w-3.5 rounded-full border border-white/20 shrink-0" style={{ background: c }} />
                                    ))}
                                  </div>
                                  <span className="font-extrabold text-sm">{group.name}</span>
                                </div>
                              </td>

                              <td className="py-4 pr-4 align-top">
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${group.isSeated ? 'bg-primary/10 text-primary' : 'bg-tertiary/10 text-tertiary'}`}>
                                  {group.isSeated ? 'Ghế ngồi' : 'Vé đứng (GA)'}
                                </span>
                              </td>

                              <td className="py-4 pr-4 font-bold text-sm align-top">
                                {group.totalQuantity.toLocaleString('vi-VN')} {group.isSeated ? 'ghế' : 'chỗ'}
                              </td>

                              <td className="py-4 pr-4 align-top space-y-2">
                                <div>
                                  <input
                                    type="text"
                                    className="h-9 w-full max-w-[240px] rounded-lg border border-border-soft/40 bg-panel-soft px-3 text-xs font-bold text-content outline-none focus:border-tertiary shadow-inner"
                                    value={ticket?.name ?? group.name}
                                    onChange={(e) => {
                                      ensureGroupTicket({ name: e.target.value })
                                    }}
                                    placeholder="Tên loại vé..."
                                  />
                                </div>
                                <div>
                                  {ticket?.description?.trim() ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDescModalState({
                                          isOpen: true,
                                          ticketName: ticket?.name || group.name,
                                          initialDescription: ticket.description || '',
                                          onSave: (newDesc) => {
                                            ensureGroupTicket({ description: newDesc })
                                            setDescModalState({ isOpen: false })
                                          },
                                        })
                                      }}
                                      className="flex items-center gap-1.5 rounded-lg border border-tertiary/30 bg-tertiary/10 px-2.5 py-1 text-xs font-semibold text-tertiary hover:bg-tertiary/20 transition max-w-[280px] text-left truncate"
                                      title={ticket.description}
                                    >
                                      <span className="truncate">{ticket.description}</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDescModalState({
                                          isOpen: true,
                                          ticketName: ticket?.name || group.name,
                                          initialDescription: '',
                                          onSave: (newDesc) => {
                                            ensureGroupTicket({ description: newDesc })
                                            setDescModalState({ isOpen: false })
                                          },
                                        })
                                      }}
                                      className="flex items-center gap-1 rounded-lg border border-border-soft/40 bg-panel-soft px-2.5 py-1 text-xs font-semibold text-subtle hover:text-tertiary hover:border-tertiary/50 transition"
                                    >
                                      <span>+ Thêm mô tả</span>
                                    </button>
                                  )}
                                </div>
                              </td>

                              <td className="py-4 align-top">
                                <input
                                  type="text"
                                  placeholder="VD: 500.000"
                                  className="h-9 w-36 rounded-lg border border-border-soft/40 bg-panel-soft px-3 text-sm font-extrabold text-content outline-none focus:border-tertiary shadow-inner"
                                  value={ticket?.price !== undefined && ticket?.price !== null ? formatPriceString(ticket.price) : ''}
                                  onChange={(e) => {
                                    const rawNum = parsePriceNumber(e.target.value)
                                    ensureGroupTicket({ price: rawNum })
                                  }}
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )
            })()}
          </>
        )}

        {seatingType === 'GENERAL' && (
          <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-[20px] font-semibold text-content">Cơ cấu loại vé</h2>
                <p className="text-sm text-subtle">Thiết lập các mức giá vé và số lượng bán ra.</p>
              </div>
              <button
                type="button"
                onClick={addTicketType}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-primary hover:bg-tertiary/10 transition"
              >
                <Icon name="add" />
                Thêm loại vé
              </button>
            </div>
            <div className="space-y-4">
              {sessionTickets.map((tt) => {
                const key = tt.id || tt.clientKey
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-border-soft/30 bg-panel-soft p-4 hover:border-tertiary/50 transition"
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs text-muted">Tên vé*</label>
                        <input
                          className="w-full rounded-lg border border-border-soft/40 bg-surface text-content px-3 py-2 text-sm focus:border-tertiary outline-none font-bold"
                          value={tt.name}
                          onChange={(e) => updateTicket(key, 'name', e.target.value)}
                          placeholder="VD: Early Bird, VIP"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted">Giá vé (VND)*</label>
                        <input
                          type="text"
                          className="w-full rounded-lg border border-border-soft/40 bg-surface text-content px-3 py-2 text-sm focus:border-tertiary outline-none font-extrabold"
                          value={formatPriceString(tt.price)}
                          onChange={(e) => updateTicket(key, 'price', parsePriceNumber(e.target.value))}
                          placeholder="VD: 500.000"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted">Số lượng*</label>
                        <input
                          type="number"
                          min="1"
                          className="w-full rounded-lg border border-border-soft/40 bg-surface text-content px-3 py-2 text-sm focus:border-tertiary outline-none font-bold"
                          value={tt.quantity}
                          onChange={(e) => updateTicket(key, 'quantity', Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between pt-2 border-t border-border-soft/20">
                      {tt.description?.trim() ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDescModalState({
                              isOpen: true,
                              ticketName: tt.name || 'Loại vé',
                              initialDescription: tt.description || '',
                              onSave: (newDesc) => {
                                updateTicket(key, 'description', newDesc)
                                setDescModalState({ isOpen: false })
                              },
                            })
                          }}
                          className="flex items-center gap-1.5 rounded-lg border border-tertiary/30 bg-tertiary/10 px-3 py-1.5 text-xs font-semibold text-tertiary hover:bg-tertiary/20 transition max-w-[400px] truncate"
                        >
                          <span className="truncate">Mô tả: {tt.description}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setDescModalState({
                              isOpen: true,
                              ticketName: tt.name || 'Loại vé',
                              initialDescription: '',
                              onSave: (newDesc) => {
                                updateTicket(key, 'description', newDesc)
                                setDescModalState({ isOpen: false })
                              },
                            })
                          }}
                          className="flex items-center gap-1 rounded-lg border border-border-soft/40 bg-surface px-3 py-1.5 text-xs font-semibold text-subtle hover:text-tertiary hover:border-tertiary/50 transition"
                        >
                          <span>+ Thêm mô tả vé</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeTicket(key)}
                        className="text-muted hover:text-error transition"
                      >
                        <Icon name="delete" />
                      </button>
                    </div>
                  </div>
                )
              })}
              {!sessionTickets.length && (
                <p className="py-6 text-center text-sm text-subtle">
                  Chưa có loại vé. Nhấn &quot;Thêm loại vé&quot;.
                </p>
              )}
            </div>
          </section>
        )}
        {sessions.length > 1 && (
          <div className="pt-8 border-t border-border-soft/30 w-full mt-4">
            <button
              type="button"
              onClick={() => setShowSyncConfirm(true)}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-tertiary/10 text-tertiary shadow-sm px-6 py-4 text-sm font-bold border border-tertiary/30 hover:bg-tertiary hover:text-white transition-all transform hover:scale-[1.01]"
            >
              <Icon name="content_copy" className="text-[20px]" />
              Sao chép Bố cục Sơ đồ & Vé cho TẤT CẢ các phiên khác cùng địa điểm
            </button>
            <p className="text-center text-xs text-subtle mt-3 font-medium">Thay vì phải làm lại thủ công, bạn có thể đồng bộ cấu hình hiện tại sang tất cả các phiên cùng sự kiện.</p>
          </div>
        )}

        <ConfirmModal
          open={showSyncConfirm}
          title="Đồng bộ cấu hình phiên"
          message="Bạn có chắc chắn muốn áp dụng cấu hình sơ đồ ghế và vé của phiên này cho các phiên khác CÙNG ĐỊA ĐIỂM? Đối với các phiên khác địa điểm, cấu hình sẽ không được áp dụng."
          confirmText="Đồng bộ ngay"
          cancelText="Hủy"
          tone="primary"
          onConfirm={handleSyncSessionConfig}
          onCancel={() => setShowSyncConfirm(false)}
        />

        <TicketDescriptionModal
          {...descModalState}
          onClose={() => setDescModalState({ isOpen: false, ticketName: '', initialDescription: '', onSave: null })}
        />
      </div>

      <div className="col-span-12 space-y-6 lg:col-span-4 lg:sticky lg:top-20">
        <SetupProgressWidget completeness={completeness} />

        <div className="overflow-hidden rounded-2xl border border-border-soft/30 bg-surface shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
          <div className="border-b border-border-soft/30 bg-panel-soft/60 px-6 py-4">
            <h3 className="text-xs font-extrabold text-content uppercase tracking-wider">Tóm tắt sự kiện</h3>
          </div>
          <div className="space-y-4 p-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-subtle font-medium">Loại vé</span>
              <span className="font-extrabold text-content bg-panel-soft px-3 py-1 rounded-xl border border-border-soft/20">{formData.ticketTypes.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-subtle font-medium">Tổng số lượng</span>
              <span className="font-extrabold text-content bg-panel-soft px-3 py-1 rounded-xl border border-border-soft/20">{totalQty.toLocaleString('vi-VN')}</span>
            </div>
            <div className="border-t border-border-soft/30 pt-4 space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-subtle block">Tổng Doanh Thu</span>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-black text-tertiary tracking-tight">
                  {totalRevenue.toLocaleString('vi-VN')}
                </span>
                <span className="text-xs font-extrabold text-tertiary uppercase">VND</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step4PoliciesSettings({ formData, setFormData, completeness }) {
  const { refund_policy: rp } = formData
  const [uploadingPolicy, setUploadingPolicy] = useState(false)
  const [uploadingPermits, setUploadingPermits] = useState(false)
  const policyFileInputRef = useRef(null)
  const permitFileInputRef = useRef(null)
  const toast = useToast()

  const handlePolicyFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // If file is plain text, read content directly into additional_terms
    if (file.name.endsWith('.txt') || file.type === 'text/plain') {
      const reader = new FileReader()
      reader.onload = (event) => {
        const textContent = event.target?.result
        if (typeof textContent === 'string' && textContent.trim()) {
          setFormData((p) => ({
            ...p,
            additional_terms: p.additional_terms
              ? `${p.additional_terms}\n\n${textContent.trim()}`
              : textContent.trim(),
          }))
          toast.success('Đã import nội dung chính sách từ file .txt')
        }
      }
      reader.readAsText(file)
    }

    try {
      setUploadingPolicy(true)
      const res = await uploadPolicyDocument(file)
      setFormData((p) => ({
        ...p,
        refund_policy: {
          ...p.refund_policy,
          policy_file_url: res.url,
          policy_file_name: res.file_name || file.name,
          policy_file_size: res.file_size || file.size,
        },
      }))
      toast.success('Đã tải lên file chính sách sự kiện!')
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Không thể tải lên file chính sách.')
    } finally {
      setUploadingPolicy(false)
      if (policyFileInputRef.current) policyFileInputRef.current.value = ''
    }
  }

  const handleRemovePolicyFile = () => {
    setFormData((p) => ({
      ...p,
      refund_policy: {
        ...p.refund_policy,
        policy_file_url: null,
        policy_file_name: null,
        policy_file_size: null,
      },
    }))
    toast.info('Đã xóa file chính sách đính kèm.')
  }

  const handlePermitFilesChange = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    try {
      setUploadingPermits(true)
      const uploadedList = []
      for (const file of files) {
        const res = await uploadOrganizerDocument(file)
        uploadedList.push({
          id: `permit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: res.file_name || file.name,
          url: res.url,
          size: res.file_size || file.size,
          type: res.mime_type || file.type,
          uploaded_at: new Date().toISOString(),
        })
      }

      setFormData((p) => {
        const existing = Array.isArray(p.refund_policy?.permit_files) ? p.refund_policy.permit_files : []
        return {
          ...p,
          refund_policy: {
            ...p.refund_policy,
            permit_files: [...existing, ...uploadedList],
          },
        }
      })
      toast.success(`Đã tải lên thành công ${uploadedList.length} tài liệu pháp lý!`)
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Không thể tải lên tài liệu pháp lý.')
    } finally {
      setUploadingPermits(false)
      if (permitFileInputRef.current) permitFileInputRef.current.value = ''
    }
  }

  const handleRemovePermitFile = (permitId) => {
    setFormData((p) => {
      const existing = Array.isArray(p.refund_policy?.permit_files) ? p.refund_policy.permit_files : []
      return {
        ...p,
        refund_policy: {
          ...p.refund_policy,
          permit_files: existing.filter((f) => f.id !== permitId),
        },
      }
    })
    toast.info('Đã xóa tài liệu khỏi danh sách.')
  }

  const permitFiles = Array.isArray(rp?.permit_files) ? rp.permit_files : []

  return (
    <div className="grid grid-cols-12 gap-6 items-start">
      <div className="col-span-12 lg:col-span-8 space-y-6 pb-8">
        {/* Section 1: Attendee Info */}
        <section className="bg-surface rounded-xl border border-border-soft/30 p-6 hover:shadow-md transition-shadow shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
                <Icon name="contacts" />
              </div>
              <div>
                <h3 className="text-[20px] font-semibold text-content">Thông tin người tham dự</h3>
                <p className="text-xs text-subtle mt-0.5">Thu thập thông tin cá nhân cho từng người sở hữu vé</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={Boolean(formData.require_attendee_info)}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    require_attendee_info: e.target.checked,
                  }))
                }
              />
              <div className="w-11 h-6 bg-border-soft/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-tertiary" />
              <span className="ml-3 text-sm font-medium text-content">Yêu cầu thu thập</span>
            </label>
          </div>
          <p className="mt-4 text-sm text-subtle">
            Bật tính năng này để yêu cầu người mua cung cấp thông tin (như họ tên, số điện thoại, ngày sinh) cho <b>TỪNG</b> vé họ mua trước khi hoàn tất đăng ký.
          </p>
        </section>

        {/* Section 2: Policies & Terms + Policy File Import */}
        <section className="bg-surface rounded-xl border border-border-soft/30 p-6 hover:shadow-md transition-shadow shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
                <Icon name="gavel" />
              </div>
              <div>
                <h3 className="text-[20px] font-semibold text-content">Chính sách & Điều khoản tham dự</h3>
                <p className="text-xs text-subtle mt-0.5">Quy định vé, độ tuổi tham gia hoặc điều khoản riêng của ban tổ chức</p>
              </div>
            </div>
          </div>

          {/* Import Policy File Card */}
          <div className="p-4 rounded-xl bg-panel-soft/60 border border-border-soft/40 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon name="upload_file" className="text-tertiary text-lg" />
                <span className="text-xs font-bold text-content uppercase tracking-wider">
                  Import file chính sách sự kiện
                </span>
              </div>
              <div>
                <input
                  type="file"
                  ref={policyFileInputRef}
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={handlePolicyFileChange}
                />
                <button
                  type="button"
                  disabled={uploadingPolicy}
                  onClick={() => policyFileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-soft/60 bg-surface text-xs font-semibold text-content hover:bg-panel-soft transition shadow-sm disabled:opacity-50"
                >
                  {uploadingPolicy ? (
                    <>
                      <div className="size-3.5 border-2 border-tertiary border-t-transparent rounded-full animate-spin" />
                      <span>Đang tải file...</span>
                    </>
                  ) : (
                    <>
                      <Icon name="attach_file" className="text-[16px] text-tertiary" />
                      <span>{rp?.policy_file_url ? 'Thay đổi file' : 'Chọn file (.pdf, .docx, .txt)'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {rp?.policy_file_url ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border-soft/60 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                    <Icon name="description" className="text-lg" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-content truncate">
                      {rp.policy_file_name || 'chinh-sach-su-kien.pdf'}
                    </p>
                    <p className="text-[11px] text-muted">
                      {formatFileSize(rp.policy_file_size)} · <span className="text-success font-medium">Đã đính kèm</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={rp.policy_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded bg-panel-soft hover:bg-panel-soft/80 text-xs font-medium text-tertiary flex items-center gap-1 transition"
                  >
                    <Icon name="open_in_new" className="text-[14px]" />
                    <span>Xem file</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleRemovePolicyFile}
                    className="p-1 rounded text-subtle hover:text-error hover:bg-error/10 transition"
                    title="Xóa file chính sách"
                  >
                    <Icon name="delete" className="text-[18px]" />
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted leading-relaxed">
                Bạn có thể tải file chính sách chi tiết (PDF hoặc Word). Nếu chọn file <b>.txt</b>, nội dung văn bản sẽ tự động được điền vào ô điều khoản bên dưới.
              </p>
            )}
          </div>

          <div>
            <label className="text-[13px] text-subtle block mb-2 font-medium">
              Nội dung điều khoản & quy định cho người tham gia
            </label>
            <textarea
              className="w-full border border-border-soft/40 rounded-xl px-4 py-3 text-sm h-36 resize-none outline-none bg-panel-soft text-content placeholder:text-muted focus:border-tertiary focus:ring-1 focus:ring-tertiary transition"
              placeholder="Nhập hoặc import các điều khoản, quy định độ tuổi, trang phục, hoặc hướng dẫn bổ sung cho người giữ vé..."
              value={formData.additional_terms}
              onChange={(e) => setFormData((p) => ({ ...p, additional_terms: e.target.value }))}
            />
          </div>
        </section>

        {/* Section 3: Event Organization Permits & Legal Documents */}
        <section className="bg-surface rounded-xl border border-border-soft/30 p-6 hover:shadow-md transition-shadow shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
                <Icon name="verified_user" />
              </div>
              <div>
                <h3 className="text-[20px] font-semibold text-content">Giấy phép tổ chức sự kiện & Giấy tờ liên quan</h3>
                <p className="text-xs text-subtle mt-0.5">Hồ sơ pháp lý bắt buộc để Ban quản trị phê duyệt sự kiện</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-subtle leading-relaxed">
            Vui lòng đính kèm các giấy tờ chứng minh sự kiện được phép tổ chức, bao gồm: <b>Giấy phép biểu diễn / tổ chức sự kiện</b> do cơ quan thẩm quyền cấp (Sở Văn hóa, UBND...), <b>hợp đồng thuê địa điểm</b> hoặc các biên bản thỏa thuận liên quan.
          </p>

          {/* Upload Permit Dropzone */}
          <div className="p-4 rounded-xl border-2 border-dashed border-border-soft/60 bg-panel-soft/30 hover:bg-panel-soft/60 transition text-center space-y-3">
            <input
              type="file"
              multiple
              ref={permitFileInputRef}
              accept=".pdf,.docx,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={handlePermitFilesChange}
            />
            <div className="flex flex-col items-center justify-center py-2">
              <div className="size-12 rounded-full bg-tertiary/10 text-tertiary flex items-center justify-center mb-2">
                <Icon name="note_add" className="text-2xl" />
              </div>
              <p className="text-sm font-semibold text-content">
                Tải lên giấy phép & tài liệu sự kiện
              </p>
              <p className="text-xs text-muted mt-1">
                Hỗ trợ định dạng PDF, Word (DOCX) hoặc hình ảnh (PNG, JPG) · Tối đa 10MB/file
              </p>
              <button
                type="button"
                disabled={uploadingPermits}
                onClick={() => permitFileInputRef.current?.click()}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-tertiary text-white text-xs font-bold shadow-md hover:bg-orange-600 transition disabled:opacity-50 cursor-pointer"
              >
                {uploadingPermits ? (
                  <>
                    <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang tải tài liệu lên...</span>
                  </>
                ) : (
                  <>
                    <Icon name="upload" className="text-base" />
                    <span>Chọn file tài liệu</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Uploaded Permits List */}
          {permitFiles.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-subtle px-1">
                <span>Tài liệu đã đính kèm ({permitFiles.length})</span>
                <span className="text-success flex items-center gap-1 font-semibold">
                  <Icon name="check_circle" className="text-xs" />
                  Đã tải đủ giấy tờ
                </span>
              </div>
              <div className="space-y-2">
                {permitFiles.map((file) => (
                  <div
                    key={file.id || file.url}
                    className="flex items-center justify-between p-3 rounded-xl bg-panel-soft border border-border-soft/40 shadow-sm hover:border-border-soft transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-9 rounded-lg bg-tertiary/10 text-tertiary flex items-center justify-center shrink-0">
                        <Icon
                          name={
                            file.type?.includes('pdf') || file.name?.endsWith('.pdf')
                              ? 'picture_as_pdf'
                              : file.type?.includes('image')
                              ? 'image'
                              : 'description'
                          }
                          className="text-lg"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-content truncate">{file.name}</p>
                        <p className="text-[11px] text-muted">
                          {formatFileSize(file.size)} · {file.uploaded_at ? new Date(file.uploaded_at).toLocaleDateString('vi-VN') : 'Đã tải lên'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-surface hover:bg-surface/80 border border-border-soft/50 text-xs font-medium text-tertiary flex items-center gap-1 transition"
                      >
                        <Icon name="visibility" className="text-[14px]" />
                        <span>Xem</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemovePermitFile(file.id)}
                        className="p-1 rounded text-subtle hover:text-error hover:bg-error/10 transition"
                        title="Xóa tài liệu"
                      >
                        <Icon name="delete" className="text-[18px]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/20 flex items-start gap-2.5 text-xs text-warning">
              <Icon name="info" className="text-base shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Chưa có giấy phép nào được đính kèm:</strong> Để sự kiện được kiểm duyệt và công khai bán vé, bạn cần cung cấp giấy phép tổ chức sự kiện hoặc hợp đồng địa điểm liên quan.
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Right Column: Sidebar */}
      <div className="col-span-12 lg:col-span-4 sticky top-24 space-y-6">
        <SetupProgressWidget completeness={completeness} />

        <div className="bg-surface rounded-xl border border-border-soft/30 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
          <div className="bg-panel-soft p-4 border-b border-border-soft/30">
            <h3 className="font-bold flex items-center gap-2 text-content">
              <Icon name="description" className="text-tertiary" />
              Tóm tắt cài đặt & chính sách
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Icon name="check_circle" className="text-success text-lg mt-0.5" />
              <div>
                <p className="text-sm font-bold text-content">Thông tin người tham dự</p>
                <p className="text-xs text-muted">
                  {formData.require_attendee_info
                    ? 'Yêu cầu nhập thông tin từng vé'
                    : 'Không bắt buộc nhập thông tin'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Icon
                name={formData.additional_terms?.trim() || rp?.policy_file_url ? 'check_circle' : 'info'}
                className={formData.additional_terms?.trim() || rp?.policy_file_url ? 'text-success text-lg mt-0.5' : 'text-muted text-lg mt-0.5'}
              />
              <div>
                <p className="text-sm font-bold text-content">Chính sách sự kiện</p>
                <p className="text-xs text-muted">
                  {rp?.policy_file_url
                    ? `Đã đính kèm file (${rp.policy_file_name || 'file'})`
                    : formData.additional_terms?.trim()
                    ? 'Đã nhập điều khoản tham dự'
                    : 'Chưa nhập hoặc tải file chính sách'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Icon
                name={permitFiles.length > 0 ? 'check_circle' : 'warning'}
                className={permitFiles.length > 0 ? 'text-success text-lg mt-0.5' : 'text-warning text-lg mt-0.5'}
              />
              <div>
                <p className="text-sm font-bold text-content">Giấy phép tổ chức</p>
                <p className="text-xs text-muted">
                  {permitFiles.length > 0
                    ? `Đã đính kèm ${permitFiles.length} tài liệu pháp lý`
                    : 'Chưa tải lên giấy phép tổ chức'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step5ReviewSubmit({ formData, setFormData, categories, venues, completeness, onGoToStep }) {
  const categoryName = categories.find((c) => c.id === formData.category_id)?.name
  const firstSession = formData.sessions[0]
  const venue = venues.find((v) => v.id === firstSession?.venue_id)

  const groupedTickets = []
  formData.ticketTypes.forEach((tt) => {
    const key = `${tt.name}_${tt.price}_${tt.is_seated}`
    let group = groupedTickets.find((g) => g.key === key)
    if (!group) {
      group = { key, name: tt.name, price: tt.price, is_seated: tt.is_seated, totalQty: 0, sessions: [] }
      groupedTickets.push(group)
    }
    group.totalQty += Number(tt.quantity || 0)
    const session = formData.sessions.find((s) => (s.id || s.clientKey) === tt.session_key)
    if (session) {
      const ms = new Date(`${session.start_date}T${session.start_time}`).getTime() || 0
      group.sessions.push({
        name: session.session_name || `Phiên ${formData.sessions.indexOf(session) + 1}`,
        qty: tt.quantity,
        timeMs: ms
      })
    }
  })

  // Sort sessions inside each group chronologically
  groupedTickets.forEach(group => {
    group.sessions.sort((a, b) => a.timeMs - b.timeMs)
  })

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-8 space-y-6 pb-8">
        <section className="bg-surface border border-border-soft/30 rounded-xl overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="h-[280px] relative bg-panel-soft">
            {formData.banner_url && (
              <img src={formData.banner_url} alt="" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-6 left-6 flex items-end gap-5">
              {formData.thumbnail_url && (
                <div className="w-28 h-28 bg-surface p-1 rounded-xl border-2 border-tertiary shadow-2xl z-10 shrink-0">
                  <img src={formData.thumbnail_url} alt="" className="w-full h-full object-cover rounded-[8px]" />
                </div>
              )}
              <div className="mb-2 text-white pb-1">
                <h3 className="text-[26px] leading-[32px] font-extrabold shadow-sm">{formData.title || 'Chưa nhập tên sự kiện'}</h3>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {formData.tags.map((tag) => (
                    <span key={tag} className="bg-tertiary/15 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-bold uppercase border border-white/20">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="p-6">
            <p className="text-sm text-subtle">{formData.short_description}</p>
            <p className="text-xs text-muted mt-2">{categoryName} · {formData.format}</p>
          </div>
        </section>

        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="calendar_today" className="text-tertiary" />
            <h4 className="text-sm font-bold uppercase tracking-wider text-content">Lịch trình & Địa điểm</h4>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_minmax(0,1fr)_140px] sm:gap-3">
            <div>
              <label className="block text-xs text-muted mb-1 uppercase">Phiên</label>
              <p className="font-semibold text-content">{formData.sessions.length} phiên</p>
            </div>
            <div className="min-w-0">
              <label className="block text-xs text-muted mb-1 uppercase">Địa điểm</label>
              <p className="whitespace-nowrap font-semibold text-content" title={venue?.name}>{venue?.name || '—'}</p>
            </div>
            <div className="sm:justify-self-end sm:text-left">
              <label className="block text-xs text-muted mb-1 uppercase">Hiển thị</label>
              <p className="font-semibold text-content">{formData.visibility}</p>
            </div>
          </div>
        </section>

        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="confirmation_number" className="text-tertiary" />
            <h4 className="text-sm font-bold uppercase tracking-wider text-content">Vé & Chỗ ngồi</h4>
          </div>
          <div className="space-y-4">
            {groupedTickets.map((group, index) => {
              const TICKET_COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500']
              const colorClass = TICKET_COLORS[index % TICKET_COLORS.length]

              return (
                <div key={group.key} className="flex flex-col p-4 bg-panel-soft rounded-xl border border-border-soft/40 shadow-sm relative overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 opacity-80 ${colorClass}`} />
                  <div className="flex justify-between items-start pl-1">
                    <div>
                      <p className="font-bold text-sm text-content mb-1">{group.name}</p>
                      <p className="text-xs text-subtle font-medium">Tổng số lượng: {group.totalQty} vé · {group.is_seated ? 'Có chỗ ngồi' : 'Không chỗ ngồi'}</p>
                    </div>
                    <p className="font-bold text-sm text-tertiary mt-0.5">{Number(group.price).toLocaleString('vi-VN')} đ</p>
                  </div>
                  {formData.sessions.length > 1 && group.sessions.length > 0 && (
                    <div className="mt-4 pl-1 pt-3 border-t border-border-soft/30 flex flex-wrap gap-2">
                      {group.sessions.map((s, idx) => (
                        <span key={idx} className="text-[11px] bg-background/50 border border-border-soft/30 px-2 py-1 rounded-md text-subtle font-medium">
                          {s.name}: <strong className="text-content">{s.qty} vé</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="policy" className="text-tertiary" />
            <h4 className="text-sm font-bold uppercase tracking-wider text-content">Cài đặt & Điều khoản</h4>
          </div>
          <div className="p-3 rounded-lg bg-panel-soft border border-border-soft/30 text-xs flex items-center justify-between">
            <span className="text-subtle font-medium">Thu thập thông tin người tham dự</span>
            <span className="font-bold text-content">
              {formData.require_attendee_info
                ? 'Bắt buộc từng vé'
                : 'Không bắt buộc'}
            </span>
          </div>

          {formData.refund_policy?.policy_file_url && (
            <div className="p-3 rounded-lg bg-panel-soft border border-border-soft/30 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="description" className="text-blue-500 shrink-0" />
                <span className="text-content font-semibold truncate">
                  {formData.refund_policy.policy_file_name || 'File chính sách sự kiện'}
                </span>
                <span className="text-muted text-[11px]">
                  ({formatFileSize(formData.refund_policy.policy_file_size)})
                </span>
              </div>
              <a
                href={formData.refund_policy.policy_file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-tertiary font-bold hover:underline shrink-0 flex items-center gap-1"
              >
                <span>Xem file</span>
                <Icon name="open_in_new" className="text-xs" />
              </a>
            </div>
          )}

          {formData.additional_terms && (
            <div className="p-3 rounded-lg bg-panel-soft border border-border-soft/30 text-xs space-y-1">
              <span className="font-bold text-content block">Điều khoản bổ sung:</span>
              <p className="text-subtle whitespace-pre-wrap">{formData.additional_terms}</p>
            </div>
          )}
        </section>

        {/* Legal Permits Review Section */}
        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="verified_user" className="text-tertiary" />
              <h4 className="text-sm font-bold uppercase tracking-wider text-content">
                Giấy phép & Hồ sơ pháp lý sự kiện
              </h4>
            </div>
            <span className="text-xs font-bold text-subtle">
              {formData.refund_policy?.permit_files?.length || 0} tài liệu
            </span>
          </div>

          {formData.refund_policy?.permit_files?.length > 0 ? (
            <div className="space-y-2">
              {formData.refund_policy.permit_files.map((file) => (
                <div
                  key={file.id || file.url}
                  className="flex items-center justify-between p-3 rounded-xl bg-panel-soft border border-border-soft/40 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      name={file.type?.includes('pdf') || file.name?.endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                      className="text-tertiary shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-content truncate">{file.name}</p>
                      <p className="text-[11px] text-muted">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded bg-surface border border-border-soft/50 text-tertiary font-bold hover:bg-panel-soft transition flex items-center gap-1 shrink-0"
                  >
                    <span>Mở xem</span>
                    <Icon name="visibility" className="text-xs" />
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/20 text-xs text-warning flex items-start gap-2">
              <Icon name="warning" className="text-base shrink-0 mt-0.5" />
              <span>Chưa có giấy phép tổ chức nào được đính kèm. Vui lòng quay lại Bước 4 để tải lên giấy phép.</span>
            </div>
          )}
        </section>

        {/* Commitment Agreement Section */}
        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="verified" className="text-tertiary" />
            <h4 className="text-sm font-bold uppercase tracking-wider text-content">Cam kết của Ban tổ chức</h4>
          </div>
          <label className="flex items-start gap-3.5 p-4 rounded-xl bg-panel-soft/70 border border-border-soft/40 hover:bg-panel-soft cursor-pointer transition">
            <input
              type="checkbox"
              checked={Boolean(formData.terms_accepted)}
              onChange={(e) => setFormData((p) => ({ ...p, terms_accepted: e.target.checked }))}
              className="mt-1 size-5 rounded border-border-soft text-tertiary focus:ring-tertiary cursor-pointer shrink-0"
            />
            <div className="text-xs text-content leading-relaxed">
              <strong className="block text-sm mb-1 font-bold text-content">
                Xác nhận cam kết thông tin và hồ sơ pháp lý sự kiện
              </strong>
              Tôi cam đoan toàn bộ thông tin sự kiện, giá vé, lịch trình, chính sách và các giấy phép tổ chức đính kèm là hoàn toàn chính xác, có hiệu lực pháp lý. Tôi chịu hoàn toàn trách nhiệm trước pháp luật và cam kết tuân thủ các quy định hoạt động của EventHub.
            </div>
          </label>
        </section>
      </div>

      <aside className="col-span-12 lg:col-span-4 space-y-6 lg:sticky lg:top-20">
        <SetupProgressWidget completeness={completeness} />

        <div className={`bg-surface border border-border-soft/30 ${completeness?.isReady ? 'border-t-success' : 'border-t-warning'} border-t-4 rounded-xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]`}>
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-bold uppercase text-subtle">Trạng thái sự kiện</span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase border ${
                completeness?.isReady
                  ? 'bg-success/10 text-success border-success/20'
                  : (completeness?.percent ?? 0) >= 70
                  ? 'bg-tertiary/10 text-tertiary border-tertiary/20'
                  : 'bg-warning/10 text-warning border-warning/20'
              }`}
            >
              {completeness?.isReady
                ? 'Tuyệt vời'
                : (completeness?.percent ?? 0) >= 70
                ? 'Gần hoàn thành'
                : 'Chưa hoàn thiện'}
            </span>
          </div>

          {completeness?.isReady ? (
            <div className="p-4 bg-success/10 border border-success/20 rounded-xl mb-6">
              <div className="flex items-center gap-1.5 text-success font-bold text-xs mb-1">
                <Icon name="check_circle" className="text-[16px]" />
                <span>Sự kiện đã sẵn sàng!</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Tất cả thông tin bắt buộc đã được điền đầy đủ. Bạn có thể nhấn &quot;Gửi để duyệt&quot; bên dưới để gửi cho Ban quản trị.
              </p>
            </div>
          ) : (
            <div className="p-4 bg-warning/10 border border-warning/20 rounded-xl mb-6">
              <div className="flex items-center gap-1.5 text-warning font-bold text-xs mb-1">
                <Icon name="info" className="text-[16px]" />
                <span>Còn {completeness?.missingItems?.length || 0} mục chưa hoàn thiện:</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Vui lòng bổ sung các thông tin còn thiếu trước khi gửi sự kiện để phê duyệt.
              </p>
            </div>
          )}

          <div className="border-t border-border-soft/30 pt-4 space-y-2.5">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold uppercase text-subtle">Danh sách kiểm tra</span>
              <span className="text-xs font-semibold text-muted">
                {completeness?.completedCount ?? 0}/{completeness?.total ?? 0}
              </span>
            </div>

            {completeness?.checklist?.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-2 p-2 rounded-lg bg-panel-soft/30 border border-border-soft/20 text-xs"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <Icon
                    name={item.completed ? 'check_circle' : 'cancel'}
                    className={`text-[16px] shrink-0 mt-0.5 ${
                      item.completed ? 'text-success' : 'text-error'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className={`font-semibold ${item.completed ? 'text-content' : 'text-error'}`}>
                      {item.label}
                    </p>
                    <p className="text-[11px] text-muted truncate">{item.detail}</p>
                  </div>
                </div>
                {!item.completed && onGoToStep && (
                  <button
                    type="button"
                    onClick={() => onGoToStep(item.step)}
                    className="shrink-0 px-2 py-0.5 rounded bg-tertiary/10 text-tertiary hover:bg-tertiary hover:text-white transition text-[11px] font-bold"
                  >
                    Bước {item.step}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}

export function CreateEventPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { eventId: routeEventId } = useParams()
  const [currentStep, setCurrentStep] = useState(1)
  const [maxCompletedStep, setMaxCompletedStep] = useState(1)
  const [eventId, setEventId] = useState(routeEventId || null)
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [categories, setCategories] = useState([])
  const [venues, setVenues] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(Boolean(routeEventId))
  const [error, setError] = useState('')
  const [uploadingThumb, setUploadingThumb] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [eventStatus, setEventStatus] = useState('DRAFT')
  const [editPermissions, setEditPermissions] = useState(null)
  const [paymentSetupRequired, setPaymentSetupRequired] = useState(false)
  const [subscriptionRequired, setSubscriptionRequired] = useState(false)

  const isEditMode = Boolean(routeEventId)
  const completeness = useMemo(() => calculateEventCompleteness(formData), [formData])

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap'
    document.head.appendChild(link)
    const style = document.createElement('style')
    style.textContent = `.material-symbols-outlined{font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24;vertical-align:middle;line-height:1}`
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(link)
      document.head.removeChild(style)
    }
  }, [])

  useEffect(() => {
    setInitialLoading(true)
    Promise.all([fetchEventCategories(), fetchOrganizerVenues(), fetchCurrentPlan()])
      .then(([cats, vns, plan]) => {
        setCategories(cats)
        setVenues(vns)
        if (!plan) setSubscriptionRequired(true)
      })
      .catch((err) => {
        console.error(err)
        toast.error('Không thể tải dữ liệu ban đầu. Vui lòng thử lại.')
      })
      .finally(() => {
        if (!routeEventId) setInitialLoading(false)
      })
  }, [routeEventId, toast])

  const populateFromEvent = useCallback((event) => {
    const sessions = (event.sessions || []).map((s) => {
      const start = splitDateTime(s.start_time)
      const end = splitDateTime(s.end_time)
      const checkin = splitDateTime(s.checkin_start_time)
      return {
        id: s.id,
        clientKey: s.id,
        session_name: s.session_name,
        start_date: start.date,
        start_time: start.time,
        end_date: end.date,
        end_time: end.time,
        venue_id: s.venue_id,
        seat_map_id: s.seat_map_id,
        seating_type: s.seat_map_id ? 'ASSIGNED' : 'GENERAL',
        zone_assignments: [],
        checkin_start_date: checkin.date,
        checkin_start_time: checkin.time,
      }
    })

    const ticketTypes = (event.ticket_types || []).map((tt) => ({
      id: tt.id,
      clientKey: tt.id,
      session_key: tt.event_session_id,
      name: tt.name,
      description: tt.description || '',
      price: tt.price,
      quantity: tt.quantity,
      is_seated: tt.is_seated,
      zone_id: tt.zone_id || null,
    }))

    setFormData({
      title: event.title || '',
      category_id: event.category_id || '',
      tags: event.tags || [],
      format: event.format || 'OFFLINE',
      visibility: event.visibility || 'PUBLIC',
      short_description: event.short_description || '',
      description: event.description || '',
      thumbnail_url: event.thumbnail_url || '',
      banner_url: event.banner_url || '',
      sessions,
      ticketTypes,
      seating_rules: event.seating_rules || { require_adjacent_seats: false, require_same_row: false, disallow_single_seat_left: false },
      refund_policy: {
        allow_refunds: Boolean(event.refund_policy?.allow_refunds),
        deadline_days: event.refund_policy?.deadline_days ?? 7,
        policy_file_url: event.refund_policy?.policy_file_url || null,
        policy_file_name: event.refund_policy?.policy_file_name || null,
        policy_file_size: event.refund_policy?.policy_file_size || null,
        permit_files: Array.isArray(event.refund_policy?.permit_files) ? event.refund_policy.permit_files : [],
      },
      additional_terms: event.additional_terms || '',
      require_attendee_info: Boolean(event.require_attendee_info),
      terms_accepted: Boolean(event.status && event.status !== 'DRAFT'),
    })
  }, [])

  useEffect(() => {
    if (!routeEventId) return
    setInitialLoading(true)
    fetchOrganizerEvent(routeEventId)
      .then((event) => {
        setEventId(event.id)
        setEventStatus(event.status || 'DRAFT')
        setEditPermissions(event.edit_permissions || null)
        populateFromEvent(event)
        setCurrentStep(1)
        setMaxCompletedStep(5)
      })
      .catch((err) => {
        console.error(err)
        toast.error('Không thể tải sự kiện.')
      })
      .finally(() => setInitialLoading(false))
  }, [routeEventId, populateFromEvent, toast])

  const validateStep = (step) => {
    if (step === 1) {
      if (!formData.title.trim()) return 'Vui lòng nhập tên sự kiện.'
      if (!formData.category_id) return 'Vui lòng chọn danh mục.'
      if (!formData.short_description.trim()) return 'Vui lòng nhập mô tả ngắn.'
      const descriptionTextOnly = (formData.description || '').replace(/<[^>]*>/g, '').trim()
      const hasImage = (formData.description || '').includes('<img')
      if (!descriptionTextOnly && !hasImage) return 'Vui lòng nhập mô tả đầy đủ.'
      if (!formData.thumbnail_url) return 'Vui lòng tải ảnh thumbnail.'
      if (!formData.banner_url) return 'Vui lòng tải ảnh banner.'
    }
    if (step === 2) {
      if (!formData.sessions.length) return 'Cần ít nhất 1 phiên sự kiện.'
      for (let i = 0; i < formData.sessions.length; i++) {
        const s = formData.sessions[i]
        const sName = s.session_name?.trim() || `Phiên ${i + 1}`
        if (!s.start_date || !s.start_time || !s.end_date || !s.end_time) {
          return `${sName}: Vui lòng nhập đầy đủ thời gian bắt đầu và kết thúc.`
        }
        if (!s.venue_id) return `${sName}: Vui lòng chọn địa điểm tổ chức.`

        if (s.start_date !== s.end_date) {
          return `${sName}: Ngày bắt đầu (${s.start_date}) và ngày kết thúc (${s.end_date}) khác nhau. Mỗi phiên sự kiện phải bắt đầu và kết thúc trong cùng một ngày.`
        }

        const startTime = new Date(`${s.start_date}T${s.start_time}`)
        const endTime = new Date(`${s.end_date}T${s.end_time}`)

        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
          return `${sName}: Thời gian bắt đầu hoặc kết thúc không hợp lệ.`
        }

        if (!s.id && startTime < new Date(Date.now() - 60000)) {
          return `${sName}: Thời gian bắt đầu sự kiện không được trong quá khứ.`
        }
        if (endTime <= startTime) {
          return `${sName}: Thời gian kết thúc phải diễn ra sau thời gian bắt đầu.`
        }

        if (s.checkin_start_date || s.checkin_start_time) {
          if (!s.checkin_start_date || !s.checkin_start_time) {
            return `${sName}: Vui lòng nhập đầy đủ cả ngày và giờ check-in.`
          }
          if (s.checkin_start_date !== s.start_date) {
            return `${sName}: Ngày check-in (${s.checkin_start_date}) phải trùng với ngày diễn ra sự kiện (${s.start_date}).`
          }
          const checkinTime = new Date(`${s.checkin_start_date}T${s.checkin_start_time}`)
          if (checkinTime > startTime) {
            return `${sName}: Thời gian check-in phải trước hoặc bằng thời gian bắt đầu sự kiện.`
          }
        }
      }

      // Check session overlap
      if (formData.sessions.length > 1) {
        for (let i = 0; i < formData.sessions.length; i++) {
          const sA = formData.sessions[i]
          const startA = new Date(`${sA.start_date}T${sA.start_time}`).getTime()
          const endA = new Date(`${sA.end_date}T${sA.end_time}`).getTime()

          for (let j = i + 1; j < formData.sessions.length; j++) {
            const sB = formData.sessions[j]
            const startB = new Date(`${sB.start_date}T${sB.start_time}`).getTime()
            const endB = new Date(`${sB.end_date}T${sB.end_time}`).getTime()

            if (startA < endB && startB < endA) {
              const nameA = sA.session_name?.trim() || `Phiên ${i + 1}`
              const nameB = sB.session_name?.trim() || `Phiên ${j + 1}`
              return `Trùng lặp thời gian: "${nameA}" (${sA.start_date} ${sA.start_time}-${sA.end_time}) và "${nameB}" (${sB.start_date} ${sB.start_time}-${sB.end_time}) không được diễn ra đồng thời.`
            }
          }
        }
      }
    }
    if (step === 3) {
      for (let i = 0; i < formData.sessions.length; i++) {
        const s = formData.sessions[i]
        const key = s.id || s.clientKey
        const sName = s.session_name?.trim() || `Phiên ${i + 1}`
        const seatingType = s.seating_type || 'GENERAL'
        if (seatingType === 'ASSIGNED') {
          if (!s.seat_map_id) {
            return `${sName} được thiết lập có chỗ ngồi nhưng chưa chọn sơ đồ ghế.`
          }
        }
        const tickets = formData.ticketTypes.filter((tt) => String(tt.session_key) === String(key))
        if (!tickets.length) return `${sName} cần ít nhất 1 loại vé.`
        for (const tt of tickets) {
          if (!tt.name?.trim()) return `${sName}: Tên loại vé không được để trống.`
          if (tt.price === '' || tt.price === null || tt.price === undefined) return `${sName}: Giá vé không được để trống.`
          if (Number(tt.price) < 0) return `${sName}: Giá vé phải >= 0.`
          if (!tt.quantity || Number(tt.quantity) <= 0) return `${sName}: Số lượng vé phải > 0.`
        }
      }
    }
    if (step === 4) {
      const hasPolicy = Boolean(formData.additional_terms?.trim() || formData.refund_policy?.policy_file_url)
      if (!hasPolicy) {
        return 'Vui lòng nhập điều khoản tham dự hoặc tải lên file chính sách sự kiện ở Bước 4.'
      }
      const permitFiles = formData.refund_policy?.permit_files || []
      if (!permitFiles.length) {
        return 'Vui lòng tải lên ít nhất 1 giấy phép tổ chức hoặc giấy tờ liên quan ở Bước 4.'
      }
    }
    return ''
  }

  const isValidAllSteps = () => {
    for (let step = 1; step <= 4; step++) {
      if (validateStep(step)) return false
    }
    return true
  }

  const buildSessionsPayload = () =>
    formData.sessions.map((s) => ({
      id: s.id,
      session_name: s.session_name,
      start_time: combineDateTime(s.start_date, s.start_time),
      end_time: combineDateTime(s.end_date, s.end_time),
      venue_id: s.venue_id,
      seat_map_id: s.seating_type === 'ASSIGNED' ? s.seat_map_id : null,
      checkin_start_time: combineDateTime(s.checkin_start_date, s.checkin_start_time),
    }))

  const buildTicketTypesPayload = () => {
    const sessionIdMap = new Map()
    formData.sessions.forEach((s, idx) => {
      if (s.id) {
        sessionIdMap.set(s.id, s.id)
      }
      if (s.clientKey) {
        sessionIdMap.set(s.clientKey, s.id)
      }
    })
    return formData.ticketTypes
      .map((tt) => {
        const resolvedSessionId =
          sessionIdMap.get(tt.session_key) ||
          formData.sessions.find(
            (s) => s.id === tt.session_key || s.clientKey === tt.session_key,
          )?.id ||
          tt.session_key

        return {
          id: tt.id || undefined,
          event_session_id: resolvedSessionId,
          name: tt.name ? tt.name.trim() : '',
          description: tt.description ? tt.description.trim() : null,
          price: tt.price === '' || tt.price === null || tt.price === undefined ? 0 : Number(tt.price),
          quantity: tt.quantity === '' || tt.quantity === null || tt.quantity === undefined ? 0 : Number(tt.quantity),
          is_seated: Boolean(tt.is_seated),
        }
      })
      .filter(
        (tt) =>
          tt.event_session_id &&
          !String(tt.event_session_id).startsWith('tmp-') &&
          !String(tt.event_session_id).startsWith('session-'),
      )
  }

  const handleThumbnailUpload = async (file) => {
    if (!file) return
    try {
      setUploadingThumb(true)
      const result = await uploadEventThumbnail(file)
      setFormData((p) => ({ ...p, thumbnail_url: result.url }))
    } catch (err) {
      console.error(err)
      toast.error('Không thể tải thumbnail.')
    } finally {
      setUploadingThumb(false)
    }
  }

  const handleBannerUpload = async (file) => {
    if (!file) return
    try {
      setUploadingBanner(true)
      const result = await uploadEventBanner(file)
      setFormData((p) => ({ ...p, banner_url: result.url }))
    } catch (err) {
      console.error(err)
      toast.error('Không thể tải banner.')
    } finally {
      setUploadingBanner(false)
    }
  }

  const syncZoneAssignments = async () => {
    const refreshed = await fetchOrganizerEvent(eventId)
    for (const s of formData.sessions) {
      if (s.seating_type !== 'ASSIGNED' || !s.seat_map_id) continue
      const refreshedSession = refreshed.sessions?.find((rs) => rs.id === s.id)
      if (!refreshedSession) continue
      const oldTickets = formData.ticketTypes.filter(
        (tt) => tt.session_key === s.id && tt.zone_id,
      )
      const savedTickets = (refreshed.ticket_types || []).filter(
        (tt) => tt.event_session_id === refreshedSession.id,
      )
      const assignments = oldTickets
        .map((ot) => {
          const saved = savedTickets.find((st) => st.name === ot.name)
          return saved ? { zone_id: ot.zone_id, ticket_type_id: saved.id } : null
        })
        .filter(Boolean)
      if (assignments.length) {
        await assignZones(eventId, refreshedSession.id, assignments)
      }
    }
  }

  const handleNext = async () => {
    const validationError = validateStep(currentStep)
    if (validationError) {
      setError(validationError)
      toast.error(validationError)
      return
    }
    setError('')
    setLoading(true)
    try {
      if (currentStep === 1) {
        const payload = {
          title: formData.title,
          category_id: formData.category_id,
          tags: formData.tags,
          format: formData.format,
          visibility: formData.visibility,
          short_description: formData.short_description,
          description: formData.description,
          thumbnail_url: formData.thumbnail_url,
          banner_url: formData.banner_url,
        }
        if (eventId) {
          await updateOrganizerEvent(eventId, payload)
        } else {
          const created = await createOrganizerEvent(payload)
          setEventId(created.id)
        }
      } else if (currentStep === 2) {
        const sessionsPayload = buildSessionsPayload()
        console.log('[CreateEventPage Step 2] Sessions Payload:', sessionsPayload)
        const updated = await updateOrganizerEvent(eventId, { sessions: sessionsPayload })
        const sessions = (updated.sessions || []).map((s, idx) => {
          const start = splitDateTime(s.start_time)
          const end = splitDateTime(s.end_time)
          const old = formData.sessions[idx] || formData.sessions.find(
            (os) => os.session_name === s.session_name && os.venue_id === s.venue_id,
          )
          return {
            id: s.id,
            clientKey: s.id,
            session_name: s.session_name,
            start_date: start.date,
            start_time: start.time,
            end_date: end.date,
            end_time: end.time,
            venue_id: s.venue_id,
            seat_map_id: s.seat_map_id,
            seating_type: old?.seating_type || (s.seat_map_id ? 'ASSIGNED' : 'GENERAL'),
            zone_assignments: old?.zone_assignments || [],
            checkin_start_date: start.date,
            checkin_start_time: start.time,
          }
        })
        setFormData((p) => {
          const sessionKeyMap = new Map()
          p.sessions.forEach((oldS, idx) => {
            const newS = sessions[idx]
            if (newS?.id) {
              if (oldS.id) sessionKeyMap.set(oldS.id, newS.id)
              if (oldS.clientKey) sessionKeyMap.set(oldS.clientKey, newS.id)
            }
          })
          const ticketTypes = p.ticketTypes.map((tt) => {
            const newSessionId = sessionKeyMap.get(tt.session_key)
            return newSessionId ? { ...tt, session_key: newSessionId } : tt
          })
          return { ...p, sessions, ticketTypes }
        })
      } else if (currentStep === 3) {
        const sessionsPayload = buildSessionsPayload()
        const ticketTypesPayload = buildTicketTypesPayload()
        console.log('[CreateEventPage Step 3] Submitting Payload:', {
          eventId,
          sessions: sessionsPayload,
          ticket_types: ticketTypesPayload,
          seating_rules: formData.seating_rules,
        })
        await updateOrganizerEvent(eventId, {
          sessions: sessionsPayload,
          ticket_types: ticketTypesPayload,
          seating_rules: formData.seating_rules,
        })
        await syncZoneAssignments()
        const finalEvent = await fetchOrganizerEvent(eventId)
        populateFromEvent(finalEvent)
      } else if (currentStep === 4) {
        await updateOrganizerEvent(eventId, {
          refund_policy: formData.refund_policy,
          additional_terms: formData.additional_terms,
          require_attendee_info: formData.require_attendee_info,
        })
      }
      const next = Math.min(currentStep + 1, 5)
      setCurrentStep(next)
      setMaxCompletedStep((prev) => Math.max(prev, next))
    } catch (err) {
      console.error(`[CreateEventPage] Error at Step ${currentStep}:`, err)
      if (err?.response?.data) {
        console.error(`[CreateEventPage] Backend Response Status ${err.response.status}:`, JSON.stringify(err.response.data, null, 2))
      }
      const msg = getApiMessage(err, `Đã xảy ra lỗi ở bước ${currentStep}. Vui lòng thử lại.`)
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateEvent = async () => {
    for (let step = 1; step <= 4; step += 1) {
      const validationError = validateStep(step)
      if (validationError) {
        setError(validationError)
        toast.error(validationError)
        setCurrentStep(step)
        return
      }
    }

    setLoading(true)
    setError('')
    try {
      await updateOrganizerEvent(eventId, {
        title: formData.title,
        category_id: formData.category_id,
        tags: formData.tags,
        format: formData.format,
        visibility: formData.visibility,
        short_description: formData.short_description,
        description: formData.description,
        thumbnail_url: formData.thumbnail_url,
        banner_url: formData.banner_url,
        seating_rules: formData.seating_rules,
        refund_policy: formData.refund_policy,
        additional_terms: formData.additional_terms,
        require_attendee_info: formData.require_attendee_info,
        sessions: buildSessionsPayload(),
        ticket_types: buildTicketTypesPayload(),
      })
      await syncZoneAssignments()
      navigate('/organizer/events', {
        state: { message: 'Đã cập nhật sự kiện thành công.' },
      })
    } catch (err) {
      console.error('[CreateEventPage handleUpdateEvent Error]:', err)
      if (err?.response?.data) {
        console.error('[CreateEventPage handleUpdateEvent] Backend Response:', JSON.stringify(err.response.data, null, 2))
      }
      toast.error(getApiMessage(err, 'Không thể cập nhật sự kiện.'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!completeness.isReady) {
      const firstMissing = completeness.missingItems[0]
      const msg = `Sự kiện chưa hoàn thiện: ${firstMissing?.detail || firstMissing?.label || 'Vui lòng bổ sung đầy đủ thông tin'}.`
      setError(msg)
      toast.error(msg)
      if (firstMissing?.step) {
        setCurrentStep(firstMissing.step)
      }
      return
    }

    // Validate everything first
    for (let step = 1; step <= 4; step += 1) {
      const validationError = validateStep(step)
      if (validationError) {
        setError(validationError)
        toast.error(validationError)
        setCurrentStep(step)
        return
      }
    }

    setLoading(true)
    setError('')
    setPaymentSetupRequired(false)

    try {
      if (isEditMode) {
        await updateOrganizerEvent(eventId, {
          title: formData.title,
          category_id: formData.category_id,
          tags: formData.tags,
          format: formData.format,
          visibility: formData.visibility,
          short_description: formData.short_description,
          description: formData.description,
          thumbnail_url: formData.thumbnail_url,
          banner_url: formData.banner_url,
          seating_rules: formData.seating_rules,
          refund_policy: formData.refund_policy,
          additional_terms: formData.additional_terms,
          require_attendee_info: formData.require_attendee_info,
          sessions: buildSessionsPayload(),
          ticket_types: buildTicketTypesPayload(),
        })
        await syncZoneAssignments()
      }

      await submitOrganizerEvent(eventId)
      navigate('/organizer/events', {
        state: { message: 'Đã gửi sự kiện để duyệt.' },
      })
    } catch (err) {
      console.error('[CreateEventPage handleSubmit Error]:', err)
      if (err?.response?.data) {
        console.error('[CreateEventPage handleSubmit] Backend Response:', JSON.stringify(err.response.data, null, 2))
      }
      const errorCode = err.response?.data?.errorCode
      if (errorCode === 'PAYOS_NOT_CONFIGURED') {
        setPaymentSetupRequired(true)
        navigate('/organizer/settings/payment', {
          state: {
            returnTo: eventId ? `/organizer/events/${eventId}/edit` : '/organizer/events/create',
            error: err.response?.data?.message || 'Vui lòng hoàn tất thiết lập thanh toán trước khi gửi duyệt sự kiện có phí.',
          },
        })
        return
      }
      toast.error(getApiMessage(err, 'Không thể gửi sự kiện.'))
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    setError('')
    setCurrentStep((s) => Math.max(1, s - 1))
  }

  const handleStepClick = (targetStep) => {
    if (targetStep === currentStep) return
    if (targetStep < currentStep) {
      setError('')
      setCurrentStep(targetStep)
      return
    }
    // Moving forward: validate each previous step sequentially
    for (let s = 1; s < targetStep; s++) {
      const stepError = validateStep(s)
      if (stepError) {
        setError(stepError)
        toast.error(stepError)
        setCurrentStep(s)
        return
      }
    }
    setError('')
    setCurrentStep(targetStep)
  }

  const nextLabel = useMemo(() => {
    if (currentStep === 4) {
      return isEditMode ? 'Tiếp: Xem lại & cập nhật' : 'Tiếp theo: Xem lại & Gửi duyệt'
    }
    if (currentStep === 3) return 'Tiếp theo: Chính sách & Thiết lập'
    if (currentStep === 2) return 'Tiếp theo: Vé & Sơ đồ ghế'
    return 'Tiếp theo'
  }, [currentStep, isEditMode])

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-4 border-tertiary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="pb-20 max-w-6xl mx-auto">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-content">
            {isEditMode ? 'Chỉnh sửa sự kiện' : 'Tạo sự kiện'}
          </h1>
          <p className="mt-1 text-sm text-subtle">
            {isEditMode
              ? 'Cập nhật thông tin sự kiện qua 5 bước.'
              : 'Thiết lập sự kiện của bạn trong 5 bước đơn giản.'}
          </p>
        </div>
      </div>

      <div className="bg-surface rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.06)] border border-border-soft/40 overflow-hidden flex flex-col min-h-[600px]">
        {/* Header containing Stepper */}
        <div className="bg-panel-soft/50 p-6 pt-10 border-b border-border-soft/40 relative">
          <WizardStepper
            currentStep={currentStep}
            maxCompletedStep={maxCompletedStep}
            onStepClick={handleStepClick}
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 p-6 lg:p-10 bg-background/30">

          {paymentSetupRequired && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              <Icon name="warning" />
              <span>Vui lòng cài đặt thanh toán nhận tiền trước khi đăng sự kiện bán vé.</span>
              <button
                type="button"
                onClick={() => navigate('/organizer/settings/payment')}
                className="ml-auto rounded-md border border-warning/30 bg-surface px-3 py-1.5 text-xs font-semibold text-warning hover:bg-warning/10 transition"
              >
                Đến cài đặt thanh toán
              </button>
            </div>
          )}
          {subscriptionRequired && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning font-medium">
              <div className="flex items-center gap-3">
                <Icon name="warning" className="text-xl" />
                <span>Tài khoản của bạn chưa đăng ký gói dịch vụ. Vui lòng Nâng cấp tài khoản để có thể phát hành sự kiện.</span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/organizer/subscriptions')}
                className="rounded-md border border-warning/30 bg-surface px-4 py-2 font-bold bg-warning text-white shadow-sm hover:opacity-90 transition"
              >
                Đăng ký gói ngay
              </button>
            </div>
          )}
          <fieldset disabled={Boolean(editPermissions?.is_time_locked)} className={editPermissions?.is_time_locked ? 'opacity-60' : ''}>
          {currentStep === 1 && (
            /* Locked events are read-only; backend enforces the same rule. */
            <Step1EventInfo
              formData={formData}
              setFormData={setFormData}
              categories={categories}
              tagInput={tagInput}
              setTagInput={setTagInput}
              onThumbnailUpload={handleThumbnailUpload}
              onBannerUpload={handleBannerUpload}
              uploadingThumb={uploadingThumb}
              uploadingBanner={uploadingBanner}
              completeness={completeness}
            />
          )}
          {currentStep === 2 && (
            <Step2ScheduleVenue
              formData={formData}
              setFormData={setFormData}
              venues={venues}
              completeness={completeness}
            />
          )}
          {currentStep === 3 && (
            <Step3TicketsSeats
              formData={formData}
              setFormData={setFormData}
              venues={venues}
              completeness={completeness}
            />
          )}
          {currentStep === 4 && (
            <Step4PoliciesSettings formData={formData} setFormData={setFormData} completeness={completeness} />
          )}
          {currentStep === 5 && (
            <Step5ReviewSubmit
              formData={formData}
              setFormData={setFormData}
              categories={categories}
              venues={venues}
              completeness={completeness}
              onGoToStep={setCurrentStep}
            />
          )}
          </fieldset>

        </div>

        {/* Universal Footer Action Bar inside card */}
        <footer className="bg-panel-soft/30 border-t border-border-soft/40 p-4 px-6 lg:px-8 flex items-center justify-between mt-auto">
          <button
            type="button"
            onClick={() => navigate('/organizer/events')}
            className="px-6 py-2.5 rounded-lg border border-border-soft/40 text-content text-sm font-medium hover:bg-panel-soft transition"
          >
            Hủy
          </button>
          <div className="flex gap-3">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={loading || editPermissions?.is_time_locked}
                className="px-6 py-2.5 rounded-lg border border-border-soft/40 text-sm font-medium hover:bg-panel-soft transition flex items-center gap-2 text-content disabled:opacity-50"
              >
                <Icon name="arrow_back" className="text-[18px]" />
                Quay lại
              </button>
            )}
            {currentStep < 5 && (
              <button
                type="button"
                onClick={handleNext}
                disabled={loading || editPermissions?.is_time_locked}
                className="flex items-center gap-2 rounded-lg bg-tertiary px-8 py-2.5 text-sm font-bold text-white shadow-md hover:bg-orange-600 disabled:opacity-50 transition"
              >
                {loading ? 'Đang lưu...' : (currentStep === 4 ? 'Tiếp theo' : nextLabel)}
                {!loading && <Icon name="arrow_forward" className="text-[18px]" />}
              </button>
            )}

            {currentStep === 5 && (!isEditMode ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || editPermissions?.is_time_locked || !completeness.isReady}
                title={!completeness.isReady ? `Còn ${completeness.missingItems.length} mục chưa hoàn tất (Độ hoàn thiện ${completeness.percent}%)` : ''}
                className="flex items-center gap-2 rounded-lg bg-success px-8 py-2.5 text-sm font-bold text-white shadow-md hover:bg-success/80 disabled:opacity-50 disabled:cursor-not-allowed transition ml-2"
              >
                {loading ? 'Đang gửi...' : 'Gửi để duyệt'}
              </button>
            ) : (isEditMode && ['DRAFT', 'HIDDEN'].includes(eventStatus)) ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || editPermissions?.is_time_locked || !completeness.isReady}
                title={!completeness.isReady ? `Còn ${completeness.missingItems.length} mục chưa hoàn tất (Độ hoàn thiện ${completeness.percent}%)` : ''}
                className="rounded-lg border border-tertiary/50 px-6 py-2.5 text-sm font-bold text-tertiary hover:bg-tertiary/10 disabled:opacity-50 disabled:cursor-not-allowed transition ml-2"
              >
                {loading ? 'Đang xử lý...' : 'Gửi duyệt'}
              </button>
            ) : null)}

            {isEditMode && (
              <button
                type="button"
                onClick={handleUpdateEvent}
                disabled={loading || editPermissions?.is_time_locked || !isValidAllSteps()}
                title={!isValidAllSteps() ? 'Thông tin sự kiện còn thiếu hoặc không hợp lệ' : ''}
                className="flex items-center gap-2 rounded-lg bg-tertiary px-8 py-2.5 text-sm font-bold text-white shadow-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition ml-2"
              >
                {loading ? 'Đang lưu...' : 'Lưu lại'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
