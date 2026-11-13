import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Sparkles, Wand2, X as CloseIcon, Check, RefreshCw, Layers, Lock } from 'lucide-react'
import { fetchEventCategories } from '@/services/events.js'
import {
  createOrganizerEvent,
  fetchOrganizerEvent,
  fetchOrganizerVenues,
  submitOrganizerEvent,
  updateOrganizerEvent,
  generateAiEventContent,
  fetchOrganizerPaymentChannel,
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
import { AiDocumentExtractorModal } from './AiDocumentExtractorModal.jsx'
import { validateRefundRules, generateRefundPolicyLines, generateRefundPolicyText } from '@/utils/refundPolicy.js'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { getCategoryName } from '@/i18n/categoryNames.js'
import { isEventEnded } from './eventStatusUtil.js'

const getAutoLocale = () =>
  ((typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
   (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en'))
    ? 'en-US'
    : 'vi-VN'

const STEP_LABELS_VI = [
  'Thông tin sự kiện',
  'Ngày giờ & Địa điểm',
  'Hạng vé & Sơ đồ ghế',
  'Chính sách & Cài đặt',
  'Xem trước & Gửi duyệt',
]

const STEP_LABELS_EN = [
  'Event Info',
  'Date & Venue',
  'Tickets & Seating',
  'Policies & Settings',
  'Preview & Submit',
]

const STEP_LABELS = STEP_LABELS_VI

export const DEFAULT_EVENT_DESCRIPTION_VI = `<p><strong>[Tóm tắt ngắn gọn về sự kiện:</strong> Nội dung chính của sự kiện, điểm đặc sắc nhất và lý do khiến người tham gia không nên bỏ lỡ]</p><br/><p><strong>Chi tiết sự kiện:</strong></p><ul><li>Chương trình chính: [Liệt kê những hoạt động nổi bật trong sự kiện: các phần trình diễn, khách mời đặc biệt, lịch trình các tiết mục cụ thể nếu có.]</li><li>Khách mời: [Thông tin về các khách mời đặc biệt, nghệ sĩ, diễn giả sẽ tham gia sự kiện. Có thể bao gồm phần mô tả ngắn gọn về họ và những gì họ sẽ mang lại cho sự kiện.]</li><li>Trải nghiệm đặc biệt: [Nếu có các hoạt động đặc biệt khác như workshop, khu trải nghiệm, photo booth, khu vực check-in hay các phần quà/ưu đãi dành riêng cho người tham dự.]</li></ul><br/><p><strong>[Chèn ảnh sơ đồ chỗ ngồi tại đây]</strong></p><br/><p><strong>Điều khoản và điều kiện:</strong></p><p>[TnC] sự kiện</p><p>Lưu ý về điều khoản trẻ em</p><p>Lưu ý về điều khoản VAT</p>`

export const DEFAULT_EVENT_DESCRIPTION_EN = `<p><strong>[Brief Event Summary:</strong> Main event highlights, unique features, and reasons why attendees should not miss it]</p><br/><p><strong>Event Details:</strong></p><ul><li>Main Program: [List standout activities in the event: performances, special guests, specific program schedules if available.]</li><li>Special Guests: [Information about special guests, artists, and speakers participating in the event. Can include a brief introduction and what they bring to the event.]</li><li>Special Experiences: [Any other special activities such as workshops, experiential zones, photo booths, check-in areas, or exclusive attendee gifts/offers.]</li></ul><br/><p><strong>[Insert seat map image here]</strong></p><br/><p><strong>Terms & Conditions:</strong></p><p>[TnC] Event Terms</p><p>Children Policy Notes</p><p>VAT Policy Notes</p>`

export const isDefaultViDescription = (html) => {
  if (!html) return false
  const text = String(html).toLowerCase().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  return (
    text.includes('tóm tắt ngắn gọn') ||
    text.includes('chi tiết sự kiện') ||
    text.includes('chèn ảnh sơ đồ chỗ ngồi') ||
    text.includes('điều khoản và điều kiện')
  )
}

export const isDefaultEnDescription = (html) => {
  if (!html) return false
  const text = String(html).toLowerCase().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  return (
    text.includes('brief event summary') ||
    text.includes('event details') ||
    text.includes('insert seat map image') ||
    text.includes('terms & conditions')
  )
}

const INITIAL_FORM = {
  title: '',
  category_id: '',
  tags: [],
  format: 'OFFLINE',
  visibility: 'PUBLIC',
  short_description: '',
  description: DEFAULT_EVENT_DESCRIPTION_VI,
  thumbnail_url: '',
  banner_url: '',
  sessions: [],
  ticketTypes: [],
  seating_rules: {
    require_adjacent_seats: false,
    require_same_row: false,
    disallow_single_seat_left: false,
    max_tickets_per_order: 10,
  },
  refund_policy: {
    allow_refund: false,
    allow_refunds: false,
    refund_rules: [
      { days_before: 7, refund_rate: 100 },
      { days_before: 3, refund_rate: 50 },
    ],
    refund_notes: '',
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
    const dateA = sA.start_date
    if (!dateA || !sA.start_time || !sA.end_time) continue
    const startA = new Date(`${dateA}T${sA.start_time}`).getTime()
    const endA = new Date(`${dateA}T${sA.end_time}`).getTime()
    if (isNaN(startA) || isNaN(endA)) continue

    for (let j = i + 1; j < sessions.length; j++) {
      const sB = sessions[j]
      const dateB = sB.start_date
      if (!dateB || !sB.start_time || !sB.end_time) continue
      const startB = new Date(`${dateB}T${sB.start_time}`).getTime()
      const endB = new Date(`${dateB}T${sB.end_time}`).getTime()
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

function calculateEventCompleteness(formData, isEnglish = false) {
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

  const sessionsValid = hasSessions && !overlapInfo && formData.sessions.every((s) => {
    const sDate = s.start_date
    if (!sDate || !s.start_time || !s.end_time || !s.venue_id) return false
    const start = new Date(`${sDate}T${s.start_time}`)
    const end = new Date(`${sDate}T${s.end_time}`)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return false
    if (s.checkin_start_time) {
      const cDate = s.checkin_start_date || sDate
      const checkin = new Date(`${cDate}T${s.checkin_start_time}`)
      if (isNaN(checkin.getTime()) || checkin > start) return false
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const cDateObj = new Date(`${cDate}T00:00:00`).getTime()
      const sDateObj = new Date(`${sDate}T00:00:00`).getTime()
      if (cDateObj < today.getTime() || cDateObj > sDateObj) return false
    }
    if (s.direct_sale_start_time || s.direct_sale_start_date || s.direct_sale_end_time || s.direct_sale_end_date) {
      if ((s.direct_sale_start_time && !s.direct_sale_start_date) || (!s.direct_sale_start_time && s.direct_sale_start_date)) return false
      if ((s.direct_sale_end_time && !s.direct_sale_end_date) || (!s.direct_sale_end_time && s.direct_sale_end_date)) return false
      let dsStart = null
      if (s.direct_sale_start_date && s.direct_sale_start_time) {
        dsStart = new Date(`${s.direct_sale_start_date}T${s.direct_sale_start_time}`)
        if (isNaN(dsStart.getTime())) return false
      }
      let dsEnd = null
      if (s.direct_sale_end_date && s.direct_sale_end_time) {
        dsEnd = new Date(`${s.direct_sale_end_date}T${s.direct_sale_end_time}`)
        if (isNaN(dsEnd.getTime())) return false
      }
      if (dsStart && dsEnd && dsEnd <= dsStart) return false
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
  const refundRulesValid = !formData.refund_policy?.allow_refund || Boolean(validateRefundRules(formData.refund_policy?.refund_rules).valid)
  // Chính sách & điều khoản tham dự là tùy chọn không bắt buộc; chỉ cần cấu hình hoàn vé hợp lệ (nếu bật)
  const policiesValid = refundRulesValid

  const permitFiles = formData.refund_policy?.permit_files || []
  const permitsValid = Boolean(permitFiles.length > 0)

  const termsAccepted = Boolean(formData.terms_accepted)

  const checklist = [
    {
      id: 'title_category',
      step: 1,
      label: isEnglish ? 'Event Name & Category' : 'Tên & Danh mục sự kiện',
      completed: Boolean(titleValid && categoryValid),
      detail: !titleValid
        ? (isEnglish ? 'Event name is required' : 'Chưa nhập tên sự kiện')
        : !categoryValid
          ? (isEnglish ? 'Category is required' : 'Chưa chọn danh mục')
          : (isEnglish ? 'Completed' : 'Đã hoàn tất'),
    },
    {
      id: 'descriptions',
      step: 1,
      label: isEnglish ? 'Short & Full Description' : 'Mô tả ngắn & Chi tiết',
      completed: Boolean(shortDescValid && descValid),
      detail: !shortDescValid
        ? (isEnglish ? 'Short description is required' : 'Chưa nhập mô tả ngắn')
        : !descValid
          ? (isEnglish ? 'Full description is required' : 'Chưa nhập mô tả chi tiết')
          : (isEnglish ? 'Completed' : 'Đã hoàn tất'),
    },
    {
      id: 'media',
      step: 1,
      label: isEnglish ? 'Thumbnail & Banner' : 'Ảnh Thumbnail & Banner',
      completed: Boolean(thumbValid && bannerValid),
      detail: !thumbValid && !bannerValid
        ? (isEnglish ? 'Missing thumbnail and banner' : 'Chưa tải thumbnail và banner')
        : !thumbValid
          ? (isEnglish ? 'Missing thumbnail' : 'Chưa tải ảnh thumbnail')
          : !bannerValid
            ? (isEnglish ? 'Missing banner' : 'Chưa tải ảnh banner')
            : (isEnglish ? 'Images uploaded' : 'Đã tải đủ ảnh'),
    },
    {
      id: 'sessions',
      step: 2,
      label: isEnglish ? 'Schedule & Venue' : 'Lịch trình & Địa điểm',
      completed: sessionsValid,
      detail: !hasSessions
        ? (isEnglish ? 'At least 1 event session required' : 'Cần tạo ít nhất 1 phiên sự kiện')
        : overlapInfo
          ? (isEnglish ? `Time conflict: "${overlapInfo.nameA}" and "${overlapInfo.nameB}"` : `Trùng giờ: "${overlapInfo.nameA}" và "${overlapInfo.nameB}"`)
          : !sessionsValid
            ? (isEnglish ? 'Incomplete session date/time or venue' : 'Phiên chưa đủ ngày giờ hoặc chưa chọn địa điểm')
            : (isEnglish ? `${formData.sessions.length} valid session(s)` : `${formData.sessions.length} phiên hợp lệ`),
    },
    {
      id: 'tickets',
      step: 3,
      label: isEnglish ? 'Event Ticket Tiers' : 'Hạng vé sự kiện',
      completed: ticketsValid,
      detail: !hasSessions
        ? (isEnglish ? 'Create sessions before ticket tiers' : 'Cần tạo phiên trước khi tạo vé')
        : !ticketsValid
          ? (isEnglish ? 'Each session needs at least 1 valid ticket tier' : 'Mỗi phiên cần ít nhất 1 loại vé hợp lệ (tên, giá >= 0, số lượng > 0)')
          : (isEnglish ? 'Ticket tiers configured' : 'Đã cấu hình đủ loại vé'),
    },
    {
      id: 'seat_map',
      step: 3,
      label: isEnglish ? 'Seat Map (Seated Sessions)' : 'Sơ đồ ghế (Phiên có ghế)',
      completed: seatMapValid,
      detail: !seatMapValid
        ? (isEnglish ? 'Seated session missing seat map' : 'Có phiên chọn chỗ ngồi nhưng chưa gắn sơ đồ ghế')
        : (isEnglish ? 'Seat map valid' : 'Sơ đồ ghế hợp lệ'),
    },
    {
      id: 'permits',
      step: 4,
      label: isEnglish ? 'Event Permits & Documents' : 'Giấy phép tổ chức & Giấy tờ liên quan',
      completed: permitsValid,
      detail: !permitsValid
        ? (isEnglish ? 'Please upload event permits or legal documents' : 'Cần tải lên giấy phép tổ chức hoặc giấy tờ liên quan')
        : (isEnglish ? `${permitFiles.length} legal document(s) uploaded` : `Đã tải lên ${permitFiles.length} tài liệu pháp lý`),
    },
    {
      id: 'policies',
      step: 4,
      label: isEnglish ? 'Policies & Participation Terms' : 'Chính sách & Điều khoản tham dự',
      completed: policiesValid,
      detail: !refundRulesValid
        ? (isEnglish ? 'Invalid refund policy configuration' : 'Cấu hình hoàn vé chưa hợp lệ')
        : policyFileUrl
          ? (isEnglish ? `Attached file: ${formData.refund_policy?.policy_file_name || 'policy'}` : `Đã đính kèm file: ${formData.refund_policy?.policy_file_name || 'chính sách'}`)
          : hasTerms
            ? (isEnglish ? 'Terms of attendance entered' : 'Đã nhập điều khoản tham dự')
            : (isEnglish ? 'Standard terms applied (Optional)' : 'Áp dụng điều khoản tiêu chuẩn (Không bắt buộc)'),
    },
    {
      id: 'review_terms',
      step: 5,
      label: isEnglish ? 'Commitment & Publish Confirmation' : 'Cam kết & Xác nhận xuất bản',
      completed: termsAccepted,
      detail: !termsAccepted
        ? (isEnglish ? 'Need commitment confirmation in Step 5' : 'Cần xác nhận cam kết điều khoản ở Bước 5')
        : (isEnglish ? 'Agreed to comply with terms' : 'Đã cam kết tuân thủ quy định'),
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
  const { isEnglish } = useLanguage()
  const stepLabels = isEnglish ? STEP_LABELS_EN : STEP_LABELS_VI
  const progress = Math.min(100, Math.max(0, ((currentStep - 1) / (stepLabels.length - 1)) * 100))

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-4">
      <div className="relative flex items-center justify-between">
        {/* Đường line nối các bước */}
        <div className="absolute top-[22px] left-10 sm:left-14 right-10 sm:right-14 -translate-y-1/2 h-[2px] bg-white/10 [html.light_&]:bg-[#C99A47]/30 z-0 pointer-events-none">
          <div
            className="h-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] shadow-[0_0_8px_rgba(201,154,71,0.6)] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {stepLabels.map((label, index) => {
          const stepNum = index + 1
          const active = stepNum === currentStep
          const done = stepNum < currentStep
          const isClickable = stepNum <= maxCompletedStep

          return (
            <button
              key={index}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(stepNum)}
              className={`relative z-10 w-20 sm:w-28 flex flex-col items-center gap-2 transition ${isClickable ? 'cursor-pointer group' : 'cursor-default'}`}
            >
              <div
                className={`grid size-11 place-items-center rounded-full text-sm font-bold transition-all duration-300 ${active
                  ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-slate-950 shadow-[0_0_20px_rgba(201,154,71,0.5)] scale-110'
                  : done
                    ? 'bg-[#0b132b] text-[#E6C17A] border border-[#E6C17A]/40 group-hover:scale-105 group-hover:bg-[#C99A47]/20 group-hover:border-[#E6C17A] [html.light_&]:bg-[#F8F3EA] [html.light_&]:text-[#C99A47] [html.light_&]:border-[#C99A47]'
                    : 'bg-[#0b132b] text-slate-500 border border-white/10 [html.light_&]:bg-white [html.light_&]:text-[#0D1B2A] [html.light_&]:border-[#C99A47]/35 [html.light_&]:shadow-sm'
                  }`}
              >
                {done ? <Check className="size-5 text-[#E6C17A] [html.light_&]:text-[#C99A47]" /> : stepNum}
              </div>
              <span
                className={`text-xs sm:text-sm font-bold transition-colors text-center max-w-[130px] leading-tight ${active
                  ? 'text-white drop-shadow-md [html.light_&]:text-[#0D1B2A] [html.light_&]:drop-shadow-none'
                  : done
                    ? 'text-[#E6C17A] [html.light_&]:text-[#C99A47]'
                    : 'text-slate-500 [html.light_&]:text-[#536b88]'
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
  const { isEnglish } = useLanguage()
  return (
    <div className={`overflow-hidden rounded-2xl border border-border-soft/30 bg-surface shadow-[0_4px_24px_rgba(0,0,0,0.18)] ${className}`}>
      <div className="border-b border-border-soft/30 bg-panel-soft/60 px-6 py-4 flex items-center justify-between">
        <h3 className="text-xs font-extrabold text-content uppercase tracking-wider flex items-center gap-2">
          <Icon name="monitoring" className="text-[#C99A47] text-base" />
          {isEnglish ? 'Setup Progress' : 'Tiến độ thiết lập'}
        </h3>
        <span className={`text-xs font-bold ${completeness?.isReady ? 'text-success' : 'text-[#C99A47]'}`}>
          {completeness?.percent ?? 0}%
        </span>
      </div>
      <div className="p-6 space-y-3">
        <div className="w-full h-2 bg-panel-soft rounded-full overflow-hidden border border-border-soft/20">
          <div
            className={`h-full rounded-full transition-all duration-500 ${completeness?.isReady ? 'bg-success' : 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A]'}`}
            style={{ width: `${completeness?.percent ?? 0}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-subtle pt-1">
          <span>{isEnglish ? 'Completed items' : 'Mục hoàn thành'}</span>
          <strong className="text-content font-bold">
            {completeness?.completedCount ?? 0}/{completeness?.total ?? 0} {isEnglish ? 'items' : 'mục'}
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
  isEditMode = false,
}) {
  const { isEnglish } = useLanguage()
  const [isAiModalOpen, setIsAiModalOpen] = useState(false)

  const displayDescription = useMemo(() => {
    if (isEditMode) return formData.description || ''
    const cur = formData.description || ''
    if (isEnglish && (isDefaultViDescription(cur) || !cur.trim() || cur === '<p><br></p>')) {
      return DEFAULT_EVENT_DESCRIPTION_EN
    }
    if (!isEnglish && (isDefaultEnDescription(cur) || !cur.trim() || cur === '<p><br></p>')) {
      return DEFAULT_EVENT_DESCRIPTION_VI
    }
    return cur
  }, [formData.description, isEnglish, isEditMode])

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
              <Icon name="info" className="text-[#C99A47]" />
              Thông tin cơ bản
            </h3>
          </div>
          <div className="space-y-6">
            <div>
              <label className="block text-[13px] font-medium mb-2 text-subtle">
                Tên sự kiện <span className="text-red-500 font-bold ml-0.5">*</span>
              </label>
              <input
                className="w-full px-4 py-2.5 border border-border-soft/40 rounded-lg text-sm bg-panel-soft text-content focus:ring-2 focus:ring-secondary/30 focus:border-tertiary outline-none transition"
                placeholder={isEnglish ? 'For example: Global Technology Conference 2024' : 'Ví dụ: Hội nghị Công nghệ Toàn cầu 2024'}
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-medium mb-2 text-subtle">
                  {isEnglish ? 'Category' : 'Danh mục'} <span className="text-red-500 font-bold ml-0.5">*</span>
                </label>
                <select
                  className="w-full px-4 py-2.5 border border-border-soft/40 rounded-lg text-sm bg-panel-soft text-content focus:ring-2 focus:ring-secondary/30 outline-none"
                  value={formData.category_id}
                  onChange={(e) => setFormData((p) => ({ ...p, category_id: e.target.value }))}
                >
                  <option value="">{isEnglish ? 'Select category' : 'Chọn danh mục'}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{getCategoryName(c, isEnglish)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-2 text-subtle">Tags</label>
                <div className="relative">
                  <input
                    className="w-full px-4 py-2.5 border border-border-soft/40 rounded-lg text-sm bg-panel-soft text-content placeholder:text-muted focus:ring-2 focus:ring-secondary/30 focus:border-tertiary outline-none transition pr-14"
                    placeholder={isEnglish ? 'Enter tag then press Enter...' : 'Nhập tag rồi nhấn Enter...'}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag()
                      }
                    }}
                  />
                  {tagInput.trim() && (
                    <button
                      type="button"
                      onClick={addTag}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#C99A47] hover:underline px-1 py-0.5 cursor-pointer"
                    >
                      + Thêm
                    </button>
                  )}
                </div>
                {formData.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#C99A47]/15 text-[#C99A47] border border-[#C99A47]/30 rounded-lg text-xs font-bold"
                      >
                        <span>#{tag}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((p) => ({
                              ...p,
                              tags: p.tags.filter((t) => t !== tag),
                            }))
                          }
                          className="hover:text-error transition flex items-center justify-center cursor-pointer"
                          title="Xóa tag"
                        >
                          <Icon name="close" className="text-[14px]" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <h3 className="text-[20px] font-semibold mb-6 flex items-center gap-2 text-content">
            <Icon name="description" className="text-[#C99A47]" />
            {isEnglish ? 'Description' : 'Mô tả'}
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-[13px] font-medium text-subtle">
                  {isEnglish ? 'Short Description' : 'Mô tả ngắn'} <span className="text-red-500 font-bold ml-0.5">*</span>
                </label>
                <span className="text-xs text-muted">{formData.short_description.length} / 500</span>
              </div>
              <textarea
                className="w-full px-4 py-2.5 border border-border-soft/40 rounded-lg text-sm bg-panel-soft text-content focus:ring-2 focus:ring-secondary/30 outline-none resize-none placeholder:text-muted"
                placeholder={isEnglish ? 'Brief summary of your event...' : 'Tóm tắt ngắn gọn về sự kiện của bạn...'}
                rows={3}
                maxLength={500}
                value={formData.short_description}
                onChange={(e) => setFormData((p) => ({ ...p, short_description: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium mb-2 text-subtle">
                {isEnglish ? 'Event Information' : 'Thông tin sự kiện'} <span className="text-red-500 font-bold ml-0.5">*</span>
              </label>
              <RichTextEditor
                key={isEnglish ? 'desc-en' : 'desc-vi'}
                value={displayDescription}
                onChange={(val) => setFormData((p) => ({ ...p, description: val }))}
                placeholder={isEnglish ? 'Enter detailed description for the event...' : 'Nhập mô tả chi tiết cho sự kiện...'}
              />
            </div>
          </div>
        </section>

        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <h3 className="text-[20px] font-semibold mb-6 flex items-center gap-2 text-content">
            <Icon name="image" className="text-[#C99A47]" />
            {isEnglish ? 'Event Media' : 'Ảnh sự kiện'}
          </h3>
          <div className="flex flex-col md:flex-row gap-6 h-auto md:h-[240px]">
            <div className="w-full md:w-1/3 flex flex-col">
              <label className="block text-[13px] font-medium mb-2 text-subtle shrink-0">
                {isEnglish ? 'Thumbnail Image (1:1)' : 'Ảnh đại diện (1:1)'} <span className="text-red-500 font-bold ml-0.5">*</span>
              </label>
              <label className="flex-1 w-full rounded-xl flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-border-soft/40 hover:border-tertiary cursor-pointer overflow-hidden transition bg-panel-soft">
                {formData.thumbnail_url ? (
                  <img src={formData.thumbnail_url} alt="Thumbnail" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Icon name="cloud_upload" className="text-muted mb-2" style={{ fontSize: 32 }} />
                    <p className="text-xs font-semibold mb-1 text-subtle">
                      {uploadingThumb ? (isEnglish ? 'Uploading...' : 'Đang tải lên...') : (isEnglish ? 'Click to upload' : 'Nhấn để tải lên')}
                    </p>
                    <p className="text-[10px] text-muted">
                      {isEnglish ? 'Recommended: 1080x1080px' : 'Khuyên dùng: 1080x1080px'}
                    </p>
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
              <label className="block text-[13px] font-medium mb-2 text-subtle shrink-0">
                {isEnglish ? 'Cover Banner (16:9)' : 'Ảnh bìa (16:9)'} <span className="text-red-500 font-bold ml-0.5">*</span>
              </label>
              <label className="flex-1 w-full rounded-xl flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-border-soft/40 hover:border-tertiary cursor-pointer overflow-hidden transition bg-panel-soft">
                {formData.banner_url ? (
                  <img src={formData.banner_url} alt="Banner" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Icon name="landscape" className="text-muted mb-2" style={{ fontSize: 40 }} />
                    <p className="text-xs font-semibold mb-1 text-subtle">
                      {uploadingBanner ? (isEnglish ? 'Uploading...' : 'Đang tải lên...') : (isEnglish ? 'Drag and drop or click to select files' : 'Kéo thả hoặc nhấn để chọn file')}
                    </p>
                    <p className="text-[10px] text-muted">
                      {isEnglish ? 'Recommended: 1920x1080px. JPG, PNG (Maximum 5MB)' : 'Khuyên dùng: 1920x1080px. JPG, PNG (Tối đa 5MB)'}
                    </p>
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
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0d1b2a] text-[11px] font-black uppercase tracking-wider shadow-[0_4px_16px_rgba(0,0,0,0.5)] border border-white/30 select-none">
              <span>{isEnglish ? 'Preview' : 'Xem trước'}</span>
            </div>
          </div>
          <div className="p-5">
            <div className="mb-2">
              <h4 className={`text-[20px] font-semibold leading-tight ${formData.title ? 'text-content' : 'text-muted italic'}`}>
                {formData.title || (isEnglish ? 'Untitled event' : 'Sự kiện không tiêu đề')}
              </h4>
              <p className="text-xs text-muted mt-1 italic">
                {getCategoryName(categories.find((c) => c.id === formData.category_id), isEnglish) || (isEnglish ? 'Category not selected' : 'Chưa chọn danh mục')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Icon name="location_on" className="text-[#C99A47] text-[18px]" />
              <span className="text-sm text-content">
                {formData.format === 'ONLINE'
                  ? (isEnglish ? 'Online event' : 'Sự kiện trực tuyến')
                  : formData.format === 'HYBRID'
                    ? (isEnglish ? 'Hybrid event' : 'Sự kiện kết hợp')
                    : (isEnglish ? 'Live event' : 'Sự kiện trực tiếp')}
              </span>
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
            category_id: generated.category_id || prev.category_id,
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
  const { isEnglish } = useLanguage()
  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const minDateFormatted = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 21)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }, [])

  const isWithin10Days = (dateStr) => {
    if (!dateStr) return false
    const target = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    target.setHours(0, 0, 0, 0)
    const diffTime = target.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays <= 10
  }

  const [expandedSessions, setExpandedSessions] = useState(() => {
    return formData.sessions.reduce((acc, s) => ({ ...acc, [s.id || s.clientKey]: false }), {})
  })

  const sessionOverlapInfo = useMemo(() => checkSessionsOverlap(formData.sessions), [formData.sessions])

  const toggleSession = (key) => setExpandedSessions((p) => ({ ...p, [key]: !p[key] }))

  const collapseAllSessions = () => {
    const next = {}
    formData.sessions.forEach((s) => {
      next[s.id || s.clientKey] = false
    })
    setExpandedSessions(next)
  }

  const expandAllSessions = () => {
    const next = {}
    formData.sessions.forEach((s) => {
      next[s.id || s.clientKey] = true
    })
    setExpandedSessions(next)
  }

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
          checkin_start_date: '',
          checkin_start_time: '',
          direct_sale_start_date: '',
          direct_sale_start_time: '',
          direct_sale_end_date: '',
          direct_sale_end_time: '',
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-[18px] sm:text-[20px] font-semibold text-content flex items-center gap-2">
                <Icon name="event" className="text-[#C99A47]" />
                Phiên sự kiện ({formData.sessions.length} phiên)
              </h2>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {formData.sessions.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const allCollapsed = formData.sessions.every((s) => !expandedSessions[s.id || s.clientKey])
                    if (allCollapsed) expandAllSessions()
                    else collapseAllSessions()
                  }}
                  title={formData.sessions.every((s) => !expandedSessions[s.id || s.clientKey]) ? 'Mở rộng tất cả' : 'Thu gọn tất cả'}
                  className="h-8.5 w-8.5 rounded-lg border border-border-soft/40 bg-panel-soft text-subtle hover:text-white hover:border-tertiary transition flex items-center justify-center cursor-pointer"
                >
                  <Icon
                    name={formData.sessions.every((s) => !expandedSessions[s.id || s.clientKey]) ? 'unfold_more' : 'unfold_less'}
                    className="text-[20px]"
                  />
                </button>
              )}
              <button
                type="button"
                onClick={addSession}
                className="flex items-center gap-1.5 !px-3.5 !py-1.5 org-btn-primary !text-sm font-bold rounded-full transition cursor-pointer"
              >
                <Icon name="add" className="text-[15px]" />
                <span>Thêm phiên</span>
              </button>
            </div>
          </div>

          {sessionOverlapInfo && (
            <div className="mb-4 p-3.5 rounded-xl border border-error/50 bg-error/10 text-error flex items-start gap-2.5 shadow-sm">
              <Icon name="warning" className="text-lg shrink-0 mt-0.5" />
              <div className="text-xs">
                <div className="font-bold">Trùng lặp thời gian giữa các phiên sự kiện:</div>
                <p className="mt-0.5 leading-relaxed text-error/90">
                  Phiên <strong>"{sessionOverlapInfo.nameA}"</strong> và phiên <strong>"{sessionOverlapInfo.nameB}"</strong> có thời gian diễn ra trùng nhau. Mỗi phiên phải kết thúc trong cùng một ngày và các phiên không được diễn ra đồng thời.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {formData.sessions.map((session, index) => {
              const key = session.id || session.clientKey
              const isExpanded = Boolean(expandedSessions[key])
              const isOverlapped = Boolean(
                sessionOverlapInfo &&
                (String(key) === String(sessionOverlapInfo.keyA) || String(key) === String(sessionOverlapInfo.keyB))
              )
              const sessionVenue = venues.find((v) => v.id === session.venue_id)

              return (
                <div
                  key={key}
                  className={`border rounded-xl relative overflow-hidden shadow-sm transition-all ${isOverlapped ? 'border-error/80 ring-1 ring-error/30 bg-error/5' : 'border-border-soft/40 bg-panel-soft/30'
                    }`}
                >
                  <div
                    className={`p-3 sm:px-4 py-2.5 flex items-center justify-between cursor-pointer select-none transition-colors ${isExpanded ? 'bg-panel-soft/70 border-b border-border-soft/40' : 'hover:bg-panel-soft/40'
                      }`}
                    onClick={() => toggleSession(key)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <div className="w-7 h-7 rounded-lg bg-[#C99A47]/10 text-[#C99A47] font-bold text-xs flex items-center justify-center shrink-0 border border-[#C99A47]/30">
                        {index + 1}
                      </div>
                      <input
                        type="text"
                        value={session.session_name || ''}
                        placeholder={isEnglish ? `Session ${index + 1}` : `Phiên ${index + 1}`}
                        title={session.session_name || `Phiên ${index + 1}`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateSession(key, 'session_name', e.target.value)}
                        className={`font-bold text-content text-sm bg-transparent border-b border-transparent hover:border-border-soft/60 focus:border-tertiary focus:outline-none focus:ring-0 px-1.5 py-0.5 transition-colors truncate ${isExpanded ? 'w-48 sm:w-72 md:w-96 lg:w-[420px] max-w-full' : 'w-24 sm:w-28 md:w-32 shrink-0'
                          }`}
                      />
                      {!isExpanded && (
                        <div className="hidden sm:flex items-center gap-2 text-xs flex-1 min-w-0 overflow-hidden">
                          {session.start_date && (
                            <span className="px-2 py-0.5 rounded-md bg-panel-soft border border-border-soft/40 text-white font-semibold flex items-center gap-1.5 text-xs whitespace-nowrap shrink-0">
                              <Icon name="calendar_today" className="text-[11px] text-[#C99A47]" />
                              {session.start_date}
                              {session.start_time && ` · ${session.start_time}${session.end_time ? ` - ${session.end_time}` : ''}`}
                            </span>
                          )}
                          {sessionVenue && (
                            <span className="px-2 py-0.5 rounded-md bg-panel-soft border border-border-soft/40 text-white font-semibold flex items-center gap-1.5 text-xs truncate max-w-[220px] whitespace-nowrap shrink-0" title={sessionVenue.name}>
                              <Icon name="location_on" className="text-[11px] text-[#C99A47]" />
                              {sessionVenue.name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-auto">
                      {isOverlapped && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-error/15 text-error flex items-center gap-1">
                          <Icon name="schedule" className="text-xs" /> Trùng giờ
                        </span>
                      )}
                      {isExpanded && formData.sessions.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeSession(key); }}
                          className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10 transition cursor-pointer"
                          title="Xóa phiên"
                        >
                          <Icon name="delete" className="text-[18px]" />
                        </button>
                      )}
                      <span className="p-1 text-subtle hover:text-tertiary transition rounded-lg">
                        <Icon
                          name="expand_more"
                          className={`text-[22px] transition-transform duration-200 ${isExpanded ? 'rotate-180 text-tertiary' : ''}`}
                        />
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 sm:p-5 pt-3 border-t border-border-soft/30 bg-panel-soft/10 space-y-3">
                      {/* Ngày diễn ra (Chỉ 1 ô chọn ngày duy nhất) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-subtle font-semibold">
                            Ngày diễn ra sự kiện <span className="text-red-500 font-bold ml-0.5">*</span>
                          </label>
                        </div>
                        <input
                          type="date"
                          min={todayStr}
                          className="w-full h-9.5 px-3 rounded-lg border border-border-soft/40 bg-panel-soft text-content text-sm focus:border-tertiary focus:ring-1 focus:ring-secondary/30 outline-none font-medium"
                          value={session.start_date || ''}
                          onChange={(e) => {
                            const d = e.target.value
                            const prevStartDate = session.start_date
                            const prevCheckinDate = session.checkin_start_date
                            let newCheckinDate = prevCheckinDate || ''
                            if (newCheckinDate && d && newCheckinDate > d) {
                              newCheckinDate = d
                            }
                            updateSessionFields(key, {
                              start_date: d,
                              end_date: d,
                              checkin_start_date: newCheckinDate,
                            })
                          }}
                        />
                        {isWithin10Days(session.start_date) && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                            <Icon name="warning" className="text-xs shrink-0" />
                            <span>
                              Hệ thống có thể mất từ 3 đến 4 ngày để duyệt sự kiện của bạn.
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Giờ bắt đầu và Giờ kết thúc */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-subtle block mb-1 font-semibold">
                            Giờ bắt đầu <span className="text-red-500 font-bold ml-0.5">*</span>
                          </label>
                          <input
                            type="time"
                            className="w-full h-9.5 px-3 rounded-lg border border-border-soft/40 bg-panel-soft text-content text-sm focus:border-tertiary focus:ring-1 focus:ring-secondary/30 outline-none"
                            value={session.start_time || ''}
                            onChange={(e) => updateSession(key, 'start_time', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-subtle block mb-1 font-semibold">
                            Giờ kết thúc <span className="text-red-500 font-bold ml-0.5">*</span>
                          </label>
                          <input
                            type="time"
                            className="w-full h-9.5 px-3 rounded-lg border border-border-soft/40 bg-panel-soft text-content text-sm focus:border-tertiary focus:ring-1 focus:ring-secondary/30 outline-none"
                            value={session.end_time || ''}
                            onChange={(e) => updateSession(key, 'end_time', e.target.value)}
                          />
                        </div>
                      </div>

                      {isOverlapped && sessionOverlapInfo && (
                        <div className="p-2.5 rounded-lg border border-error/40 bg-error/10 text-error text-xs flex items-center gap-2">
                          <Icon name="warning" className="text-sm shrink-0" />
                          <span>
                            Phiên này đang bị trùng thời gian với <strong>"{String(key) === String(sessionOverlapInfo.keyA) ? sessionOverlapInfo.nameB : sessionOverlapInfo.nameA}"</strong>. Các phiên không được diễn ra đồng thời.
                          </span>
                        </div>
                      )}

                      {/* Giờ check-in và Chọn địa điểm trên cùng 1 hàng gọn gàng */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                        <div>
                          <div className="flex items-center justify-between min-h-[22px] mb-1">
                            <label className="text-xs text-subtle block font-semibold">Thời gian check-in (Tùy chọn)</label>
                          </div>
                          <div className="w-full h-9.5 px-3 rounded-lg border border-border-soft/40 bg-panel-soft flex items-center gap-2 focus-within:border-tertiary focus-within:ring-1 focus-within:ring-secondary/30 transition-all">
                            {/* Giờ check-in */}
                            <input
                              type="time"
                              className="no-picker-indicator w-32 shrink-0 bg-transparent border-0 outline-none text-content text-sm font-medium"
                              value={session.checkin_start_time || ''}
                              onChange={(e) => {
                                const t = e.target.value
                                updateSessionFields(key, {
                                  checkin_start_time: t,
                                  checkin_start_date: session.checkin_start_date || '',
                                })
                              }}
                              title="Giờ check-in"
                            />

                            {/* Ngày check-in bên cạnh, icon lịch ở cuối */}
                            <input
                              type="date"
                              min={todayStr}
                              max={session.start_date || undefined}
                              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-content text-sm font-medium"
                              value={session.checkin_start_date || ''}
                              onChange={(e) => {
                                const d = e.target.value
                                updateSessionFields(key, {
                                  checkin_start_date: d,
                                })
                              }}
                              title="Ngày check-in (không được ở quá khứ và không được sau ngày diễn ra)"
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-muted">Giờ & ngày mở cửa đón khách (không được sau ngày diễn ra).</p>
                          {session.checkin_start_date && session.start_date && session.checkin_start_date > session.start_date && (
                            <p className="mt-1 text-[11px] text-red-500 font-medium">
                              Ngày check-in không được sau ngày diễn ra sự kiện.
                            </p>
                          )}
                          {session.checkin_start_date && todayStr && session.checkin_start_date < todayStr && (
                            <p className="mt-1 text-[11px] text-red-500 font-medium">
                              Ngày check-in không được ở trong quá khứ.
                            </p>
                          )}
                          {session.checkin_start_date === session.start_date && session.checkin_start_time && session.start_time && session.checkin_start_time > session.start_time && (
                            <p className="mt-1 text-[11px] text-red-500 font-medium">
                              Giờ check-in phải trước hoặc bằng giờ bắt đầu sự kiện ({session.start_time}).
                            </p>
                          )}
                        </div>

                        <div>
                          <div className="flex justify-between items-center min-h-[22px] mb-1">
                            <label className="text-xs text-subtle block font-semibold">
                              Chọn địa điểm <span className="text-red-500 font-bold ml-0.5">*</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => window.open('/organizer/venues', '_blank')}
                              className="text-xs text-[#C99A47] hover:text-[#E6C17A] font-semibold transition cursor-pointer"
                            >
                              + Tạo địa điểm mới
                            </button>
                          </div>
                          <select
                            className="w-full h-10 px-3 rounded-lg border border-border-soft/40 bg-panel-soft text-content text-sm focus:border-tertiary outline-none"
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

                      {/* Thời gian cho phép bán vé trực tiếp (ngay dưới phần giờ check-in) */}
                      <div className="mt-3.5 pt-3.5 border-t border-border-soft/20">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <label className="text-sm text-content font-bold">
                            <span>{isEnglish ? 'Direct Ticket Sales Window (Optional)' : 'Thời gian cho phép bán vé trực tiếp (Tùy chọn)'}</span>
                          </label>
                          <span className="text-[11px] text-muted">
                            {isEnglish
                              ? 'Staff is only permitted to sell tickets directly during this active window'
                              : 'Staff chỉ được phép bán vé trực tiếp tại quầy trong khung thời gian này'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                          {/* Bắt đầu bán trực tiếp */}
                          <div>
                            <span className="text-[11px] text-subtle block mb-1 font-medium">
                              {isEnglish ? 'Direct sales open:' : 'Bắt đầu mở bán trực tiếp:'}
                            </span>
                            <div className="w-full h-9.5 px-3 rounded-lg border border-border-soft/40 bg-panel-soft flex items-center gap-2 focus-within:border-tertiary focus-within:ring-1 focus-within:ring-secondary/30 transition-all">
                              <input
                                type="time"
                                className="no-picker-indicator w-32 shrink-0 bg-transparent border-0 outline-none text-content text-sm font-medium"
                                value={session.direct_sale_start_time || ''}
                                onChange={(e) => {
                                  const t = e.target.value
                                  updateSessionFields(key, {
                                    direct_sale_start_time: t,
                                    direct_sale_start_date: session.direct_sale_start_date || (t ? session.start_date || '' : ''),
                                  })
                                }}
                                title="Giờ bắt đầu bán trực tiếp"
                              />
                              <input
                                type="date"
                                min={todayStr}
                                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-content text-sm font-medium"
                                value={session.direct_sale_start_date || ''}
                                onChange={(e) => {
                                  const d = e.target.value
                                  updateSessionFields(key, {
                                    direct_sale_start_date: d,
                                  })
                                }}
                                title="Ngày bắt đầu bán trực tiếp"
                              />
                            </div>
                          </div>

                          {/* Kết thúc bán trực tiếp */}
                          <div>
                            <span className="text-[11px] text-subtle block mb-1 font-medium">
                              {isEnglish ? 'Direct sales close:' : 'Kết thúc bán trực tiếp:'}
                            </span>
                            <div className="w-full h-9.5 px-3 rounded-lg border border-border-soft/40 bg-panel-soft flex items-center gap-2 focus-within:border-tertiary focus-within:ring-1 focus-within:ring-secondary/30 transition-all">
                              <input
                                type="time"
                                className="no-picker-indicator w-32 shrink-0 bg-transparent border-0 outline-none text-content text-sm font-medium"
                                value={session.direct_sale_end_time || ''}
                                onChange={(e) => {
                                  const t = e.target.value
                                  updateSessionFields(key, {
                                    direct_sale_end_time: t,
                                    direct_sale_end_date: session.direct_sale_end_date || (t ? session.end_date || session.start_date || '' : ''),
                                  })
                                }}
                                title="Giờ kết thúc bán trực tiếp"
                              />
                              <input
                                type="date"
                                min={session.direct_sale_start_date || todayStr}
                                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-content text-sm font-medium"
                                value={session.direct_sale_end_date || ''}
                                onChange={(e) => {
                                  const d = e.target.value
                                  updateSessionFields(key, {
                                    direct_sale_end_date: d,
                                  })
                                }}
                                title="Ngày kết thúc bán trực tiếp"
                              />
                            </div>
                          </div>
                        </div>

                        {session.direct_sale_start_date && session.direct_sale_end_date &&
                         session.direct_sale_start_time && session.direct_sale_end_time &&
                         new Date(`${session.direct_sale_end_date}T${session.direct_sale_end_time}`) <= new Date(`${session.direct_sale_start_date}T${session.direct_sale_start_time}`) && (
                          <p className="mt-1 text-[11px] text-red-500 font-medium">
                            {isEnglish
                              ? 'Direct sales closing time must be after opening time.'
                              : 'Thời gian kết thúc bán trực tiếp phải diễn ra sau thời gian bắt đầu.'}
                          </p>
                        )}
                        {session.direct_sale_start_date && todayStr && session.direct_sale_start_date < todayStr && (
                          <p className="mt-1 text-[11px] text-red-500 font-medium">
                            {isEnglish
                              ? 'Direct sales opening date cannot be in the past.'
                              : 'Ngày bắt đầu bán trực tiếp không được ở trong quá khứ.'}
                          </p>
                        )}
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
                className="w-full py-6 border-2 border-dashed border-border-soft/40 rounded-xl text-subtle hover:border-tertiary hover:text-tertiary transition cursor-pointer"
              >
                + Thêm phiên đầu tiên
              </button>
            )}
          </div>
        </section>

        {
          selectedVenue && (
            <section className="bg-surface rounded-xl border border-border-soft/30 p-4 sm:p-5 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="location_on" className="text-[#C99A47] text-lg" />
                <h2 className="text-base font-bold text-content">Chi tiết địa điểm</h2>
              </div>
              <div className="space-y-1.5 pt-1">
                <h3 className="text-sm font-bold text-content">{selectedVenue.name}</h3>
                <p className="text-xs text-subtle leading-relaxed">
                  {[selectedVenue.address_line, selectedVenue.district, selectedVenue.city].filter(Boolean).join(', ')}
                </p>
                {(selectedVenue.max_seats > 0 || selectedVenue.seat_count > 0) && (
                  <p className="text-xs text-subtle">
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
  const { isEnglish } = useLanguage()
  const [desc, setDesc] = useState(initialDescription || '')

  useEffect(() => {
    setDesc(initialDescription || '')
  }, [initialDescription, isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm animate-in fade-in p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1329] [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-xl p-6 shadow-2xl shadow-black/90 space-y-4 text-white [html.light_&]:text-[#0D1B2A]">
        <div className="flex items-center justify-between border-b border-white/10 [html.light_&]:border-[#C99A47]/20 pb-3">
          <h3 className="text-lg font-black text-white [html.light_&]:text-[#0D1B2A]">
            Mô tả loại vé: <span className="text-primary [html.light_&]:text-[#C99A47]">{ticketName}</span>
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white [html.light_&]:hover:text-[#0D1B2A] text-sm font-bold">✕</button>
        </div>
        <div>
          <label className="text-xs text-subtle font-semibold mb-1.5 block">Nội dung mô tả vé (quyền lợi, lối đi, quà tặng...):</label>
          <textarea
            rows={4}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={isEnglish ? 'e.g.: Free drinks + snacks included, close to stage...' : 'VD: Bao gồm nước ngọt + snack miễn phí, vị trí gần sân khấu...'}
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

function RowSelectDropdown({ rows, onSelectRow }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#0b1329] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-[#C99A47] hover:text-white transition cursor-pointer select-none"
      >
        <span>Chọn theo hàng...</span>
        <Icon name={isOpen ? 'expand_less' : 'expand_more'} className="size-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-40 max-h-56 overflow-y-auto rounded-lg border border-white/20 bg-[#0d172e] py-1 shadow-[0_12px_28px_rgba(0,0,0,0.8)] z-50">
          {rows.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                onSelectRow(r)
                setIsOpen(false)
              }}
              className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-[#C99A47]/25 hover:text-[#F3D382] transition-colors flex items-center justify-between cursor-pointer"
            >
              <span className="font-medium">Hàng {r}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SeatMapSelectDropdown({ value, options = [], onChange, placeholder = '-- Chọn sơ đồ --', loading = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedMap = options.find((sm) => String(sm.id) === String(value))

  return (
    <div className="relative w-full text-left" ref={dropdownRef}>
      <button
        type="button"
        disabled={loading}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`h-11 w-full rounded-lg border px-4 text-sm font-medium transition flex items-center justify-between cursor-pointer select-none ${
          isOpen
            ? 'border-[#C99A47] bg-[#0b1329] text-white ring-1 ring-[#C99A47]/40 shadow-sm'
            : 'border-white/15 bg-panel-soft text-content hover:border-[#C99A47]/60'
        } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <span className="truncate">
          {selectedMap ? (
            `${selectedMap.name} (${selectedMap.seat_count || 0} ghế, ${selectedMap.zone_count || 0} khu vực)`
          ) : (
            <span className="text-subtle">{placeholder}</span>
          )}
        </span>
        <Icon
          name={isOpen ? 'expand_less' : 'expand_more'}
          className={`size-4 shrink-0 transition-transform ${isOpen ? 'text-[#C99A47]' : 'text-slate-400'}`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 w-full max-h-64 overflow-y-auto rounded-xl border border-white/20 bg-[#0d172e] py-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.85)] z-50">
          <button
            type="button"
            onClick={() => {
              onChange('')
              setIsOpen(false)
            }}
            className={`w-full text-left px-4 py-2.5 text-xs text-subtle hover:bg-white/5 hover:text-slate-200 transition-colors flex items-center justify-between cursor-pointer border-b border-white/5 ${
              !value ? 'bg-white/5 text-white font-semibold' : ''
            }`}
          >
            <span>{placeholder}</span>
            {!value && <Icon name="check" className="size-3.5 text-[#C99A47]" />}
          </button>

          {options.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-400 text-center">
              Địa điểm này chưa có sơ đồ ghế nào.
            </div>
          ) : (
            options.map((sm) => {
              const isSelected = String(sm.id) === String(value)
              return (
                <button
                  key={sm.id}
                  type="button"
                  onClick={() => {
                    onChange(sm.id)
                    setIsOpen(false)
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-all flex items-center justify-between cursor-pointer border-b border-white/5 last:border-b-0 ${
                    isSelected
                      ? 'bg-[#C99A47]/20 text-[#F3D382] font-semibold'
                      : 'text-slate-200 hover:bg-[#C99A47]/15 hover:text-[#F3D382]'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-sm leading-tight">
                      {sm.name}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {sm.seat_count || 0} ghế • {sm.zone_count || 0} khu vực
                    </span>
                  </div>
                  {isSelected && (
                    <Icon name="check" className="size-4 text-[#C99A47] shrink-0" />
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function Step3TicketsSeats({
  formData,
  setFormData,
  venues,
  completeness,
  organizerPlan = null,
  isEditMode = false,
  eventId = '',
}) {
  const { isEnglish } = useLanguage()
  const toast = useToast()
  const navigate = useNavigate()
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
  const [collapsedTickets, setCollapsedTickets] = useState(() => {
    const initial = {}
    formData.ticketTypes.forEach((tt) => {
      initial[tt.id || tt.clientKey] = true
    })
    return initial
  })

  const toggleTicketCollapse = (key) => {
    setCollapsedTickets((prev) => {
      const isCurrCollapsed = prev[key] !== false
      return { ...prev, [key]: !isCurrCollapsed }
    })
  }

  const collapseAllTickets = () => {
    const next = {}
    formData.ticketTypes
      .filter((tt) => String(tt.session_key) === String(sessionKey))
      .forEach((tt) => {
        const key = tt.id || tt.clientKey
        next[key] = true
      })
    setCollapsedTickets((prev) => ({ ...prev, ...next }))
  }

  const expandAllTickets = () => {
    const next = {}
    formData.ticketTypes
      .filter((tt) => String(tt.session_key) === String(sessionKey))
      .forEach((tt) => {
        const key = tt.id || tt.clientKey
        next[key] = false
      })
    setCollapsedTickets((prev) => ({ ...prev, ...next }))
  }

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
          zone_assignments: activeSession.zone_assignments ? [...activeSession.zone_assignments] : [],
          disabled_seat_ids: activeSession.disabled_seat_ids ? [...activeSession.disabled_seat_ids] : [],
        }
      });

      if (copiedCount === 0 && p.sessions.length > 1) {
        window.dispatchEvent(new CustomEvent('eventhub:toast', { detail: { type: 'warning', message: 'Không có phiên nào khác cùng địa điểm để đồng bộ.' } }))
        return p;
      }

      const sourceTickets = p.ticketTypes.filter((t) => String(t.session_key) === String(sessionKey))
      const allSyncedTickets = [...sourceTickets]

      for (const s of newSessions) {
        if (String(s.id || s.clientKey) === String(sessionKey) || s.venue_id !== activeSession.venue_id) continue
        const cloned = sourceTickets.map((t) => {
          const idStr = String(t.id || t.clientKey)
          return {
            ...t,
            id: idStr.startsWith('tmp-') ? null : undefined,
            clientKey: newClientKey(),
            session_key: s.id || s.clientKey,
          }
        })
        allSyncedTickets.push(...cloned)
      }

      const untouchedTicketTypes = p.ticketTypes.filter((t) => {
        const sess = p.sessions.find((x) => String(x.id || x.clientKey) === String(t.session_key))
        return sess && sess.venue_id !== activeSession.venue_id && String(sess.id || sess.clientKey) !== String(sessionKey)
      })

      return { ...p, sessions: newSessions, ticketTypes: [...allSyncedTickets, ...untouchedTicketTypes] }
    })
    window.dispatchEvent(new CustomEvent('eventhub:toast', { detail: { type: 'success', message: 'Đã áp dụng cấu hình cho các phiên cùng địa điểm.' } }))
    setShowSyncConfirm(false)
  }

  const sessionTickets = formData.ticketTypes.filter((tt) => String(tt.session_key) === String(sessionKey))

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

            // Match existing tickets with groups by zone_id, standing_area_id or name
            let hasChanges = false
            const updatedExistingTickets = p.ticketTypes.map((tt) => {
              if (String(tt.session_key) !== String(sessionKey)) return tt
              const matchedGroup = groups.find((g) => {
                if (g.isSeated !== Boolean(tt.is_seated)) return false
                if (g.isSeated) {
                  const matchId = g.zoneIds.some((id) => id === tt.zone_id || (tt.zone_ids || []).includes(id))
                  if (matchId) return true
                } else {
                  const matchId = g.standingAreaIds.some(
                    (id) => id === tt.standing_area_id || (tt.standing_area_ids || []).includes(id),
                  )
                  if (matchId) return true
                }
                return tt.name && g.name && tt.name.trim().toLowerCase() === g.name.trim().toLowerCase()
              })

              if (matchedGroup) {
                hasChanges = true
                return {
                  ...tt,
                  quantity: tt.quantity || matchedGroup.totalQuantity,
                  is_seated: matchedGroup.isSeated,
                  zone_ids: matchedGroup.zoneIds,
                  standing_area_ids: matchedGroup.standingAreaIds,
                  zone_id: tt.zone_id || matchedGroup.zoneIds[0] || null,
                  standing_area_id: tt.standing_area_id || matchedGroup.standingAreaIds[0] || null,
                }
              }
              return tt
            })

            const missingGroups = groups.filter((group) => !updatedExistingTickets.some((ticket) => {
              if (String(ticket.session_key) !== String(sessionKey)) return false
              if (group.isSeated !== Boolean(ticket.is_seated)) return false
              if (group.isSeated) {
                if (group.zoneIds.some((id) => id === ticket.zone_id || (ticket.zone_ids || []).includes(id))) return true
              } else {
                if (group.standingAreaIds.some((id) => id === ticket.standing_area_id || (ticket.standing_area_ids || []).includes(id))) return true
              }
              return ticket.name && group.name && ticket.name.trim().toLowerCase() === group.name.trim().toLowerCase()
            }))

            if (missingGroups.length === 0 && !hasChanges) return p

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
              ticketTypes: [...updatedExistingTickets, ...newTickets],
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
    if (type === seatingType) return
    if (type === 'ASSIGNED' && organizerPlan && !organizerPlan.seat_map_enabled) {
      toast.error('Gói dịch vụ hiện tại không hỗ trợ sơ đồ ghế. Vui lòng nâng cấp gói để sử dụng tính năng này.')
      navigate('/organizer/subscriptions', {
        state: {
          returnTo: isEditMode && eventId ? `/organizer/events/${eventId}/edit` : '/organizer/events/create',
          message: 'Tính năng Sơ đồ ghế ngồi yêu cầu gói hỗ trợ sơ đồ ghế. Vui lòng nâng cấp gói dịch vụ để sử dụng.',
        },
      })
      return
    }
    updateActiveSession({
      seating_type: type,
      seat_map_id: type === 'ASSIGNED' ? activeSession.seat_map_id : null,
      zone_assignments: type === 'ASSIGNED' ? activeSession.zone_assignments || [] : [],
    })
    if (type === 'GENERAL') {
      setLoadedSeatMap(null)
      setFormData((p) => {
        const currentTickets = p.ticketTypes.filter((tt) => String(tt.session_key) === String(sessionKey))
        if (currentTickets.length > 0) {
          // Keep existing tickets, set is_seated to false without deleting their name/price/qty
          return {
            ...p,
            ticketTypes: p.ticketTypes.map((tt) =>
              String(tt.session_key) === String(sessionKey) ? { ...tt, is_seated: false } : tt
            ),
          }
        }
        return {
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
        }
      })
    }
  }

  const handleSeatMapSelect = async (seatMapId) => {
    if (!sessionKey || !seatMapId) return
    try {
      const sm = await getSeatMap(seatMapId)
      setLoadedSeatMap(sm)
      const groups = getGroupedMapItems(sm)
      const zoneAssignments = []

      setFormData((p) => {
        const existingSessionTickets = p.ticketTypes.filter((tt) => String(tt.session_key) === String(sessionKey))
        const otherTickets = p.ticketTypes.filter((tt) => String(tt.session_key) !== String(sessionKey))

        const resolvedTickets = groups.map((group) => {
          // Check if there is an existing ticket matching zone_id or name
          const matched = existingSessionTickets.find((tt) => {
            if (group.isSeated !== Boolean(tt.is_seated)) return false
            if (group.isSeated) {
              if (group.zoneIds.some((id) => id === tt.zone_id || (tt.zone_ids || []).includes(id))) return true
            } else {
              if (group.standingAreaIds.some((id) => id === tt.standing_area_id || (tt.standing_area_ids || []).includes(id))) return true
            }
            return tt.name && group.name && tt.name.trim().toLowerCase() === group.name.trim().toLowerCase()
          })

          const clientKey = matched ? (matched.clientKey || matched.id || newClientKey()) : newClientKey()

          group.zoneIds.forEach((zId) => {
            zoneAssignments.push({
              zone_id: zId,
              ticket_type_local_id: clientKey,
            })
          })

          if (matched) {
            return {
              ...matched,
              clientKey,
              session_key: sessionKey,
              quantity: matched.quantity || group.totalQuantity,
              is_seated: group.isSeated,
              zone_ids: group.zoneIds,
              standing_area_ids: group.standingAreaIds,
              zone_id: matched.zone_id || group.zoneIds[0] || null,
              standing_area_id: matched.standing_area_id || group.standingAreaIds[0] || null,
            }
          }

          return {
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
          }
        })

        updateActiveSession({ seat_map_id: seatMapId, zone_assignments: zoneAssignments })
        return {
          ...p,
          ticketTypes: [...otherTickets, ...resolvedTickets],
        }
      })
    } catch (err) {
      console.error(err)
    }
  }

  const addTicketType = () => {
    if (!sessionKey) return
    const newKey = newClientKey()
    setFormData((p) => ({
      ...p,
      ticketTypes: [
        ...p.ticketTypes,
        {
          clientKey: newKey,
          session_key: sessionKey,
          name: '',
          description: '',
          price: '',
          quantity: 1,
          is_seated: false,
        },
      ],
    }))
    setCollapsedTickets((p) => ({ ...p, [newKey]: false }))
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

  const currentDisabledSeatIds = activeSession?.disabled_seat_ids || []
  const totalMapSeats = (loadedSeatMap?.seats || []).length
  const disabledMapSeatsCount = (loadedSeatMap?.seats || []).filter((s) =>
    currentDisabledSeatIds.includes(String(s.id)) || Boolean(s.is_disabled || s.isDisabled)
  ).length
  const activeMapSeatsCount = totalMapSeats - disabledMapSeatsCount

  const uniqueRows = useMemo(() => {
    if (!loadedSeatMap?.seats) return []
    const rows = Array.from(new Set(loadedSeatMap.seats.map((s) => s.row_label ?? s.rowLabel).filter(Boolean)))
    return rows.sort()
  }, [loadedSeatMap])

  const handleToggleSeatDisabled = (seat) => {
    const seatId = String(seat.id || seat.seat_id)
    const current = activeSession?.disabled_seat_ids || []
    const next = current.includes(seatId)
      ? current.filter((id) => id !== seatId)
      : [...current, seatId]
    updateActiveSession({ disabled_seat_ids: next })
  }

  const handleToggleRowDisabled = (rowLabel) => {
    if (!loadedSeatMap?.seats || !rowLabel) return
    const rowSeatIds = loadedSeatMap.seats
      .filter((s) => (s.row_label ?? s.rowLabel) === rowLabel)
      .map((s) => String(s.id))
    const current = activeSession?.disabled_seat_ids || []
    const allRowDisabled = rowSeatIds.every((id) => current.includes(id))
    let next
    if (allRowDisabled) {
      next = current.filter((id) => !rowSeatIds.includes(id))
    } else {
      next = Array.from(new Set([...current, ...rowSeatIds]))
    }
    updateActiveSession({ disabled_seat_ids: next })
  }

  const handleResetAllDisabledSeats = () => {
    updateActiveSession({ disabled_seat_ids: [] })
  }

  return (
    <div className="grid grid-cols-12 items-start gap-6">
      <div className="col-span-12 space-y-6 pb-24 lg:col-span-8">
        {sessions.length > 1 && (
          <div className="space-y-3.5 border-b border-border-soft/30 pb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="text-base font-bold uppercase tracking-wider text-white">
                Danh sách phiên biểu diễn ({sessions.length})
              </span>
              <button
                type="button"
                onClick={() => setShowSyncConfirm(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DDA74F] to-[#C99A47] px-3.5 py-2 text-xs sm:text-sm font-bold text-[#0D1B2A] shadow hover:brightness-110 transition-all cursor-pointer shrink-0 self-start sm:self-auto"
              >
                <Icon name="content_copy" className="text-[17px] text-[#0D1B2A]" />
                <span>Sao chép bố cục cho TẤT CẢ phiên</span>
              </button>
            </div>

            <div className="flex flex-col gap-2.5 w-full">
              {sessions.map((s, i) => {
                const sessionTitle = s.session_name?.trim()
                const displayName = sessionTitle
                  ? (sessionTitle.toLowerCase().startsWith('phiên') ? sessionTitle : `Phiên ${i + 1}: ${sessionTitle}`)
                  : `Phiên ${i + 1}`

                const isActive = activeTab === i

                return (
                  <button
                    key={s.id || s.clientKey}
                    type="button"
                    onClick={() => setActiveTab(i)}
                    className={`group relative flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all w-full cursor-pointer ${
                      isActive
                        ? 'border-[#C99A47] bg-[#C99A47]/15 text-white shadow-sm ring-1 ring-[#C99A47]/30'
                        : 'border-white/10 bg-[#0d172e]/60 text-slate-300 hover:border-[#C99A47]/40 hover:bg-[#0d172e] hover:text-white'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 border transition-colors ${
                        isActive
                          ? 'bg-[#C99A47] text-[#0d1b2a] border-[#C99A47]'
                          : 'bg-white/5 text-[#C99A47] border-[#C99A47]/30 group-hover:bg-[#C99A47]/10'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="font-semibold text-sm text-left break-words flex-1">
                      {displayName}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <h2 className="mb-4 text-[20px] font-semibold text-content flex items-center gap-2">
            <Icon name="tune" className="text-[#C99A47]" />
            Loại tổ chức
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setSeatingType('GENERAL')}
              className={`rounded-xl border-2 px-5 py-4 text-left transition flex flex-col justify-center min-h-[96px] ${seatingType === 'GENERAL'
                ? 'border-[#C99A47] bg-[#C99A47]/10'
                : 'border-border-soft/40 hover:border-[#C99A47]/40'
                }`}
            >
              <p className="font-bold text-content text-base leading-snug">Không chỗ ngồi</p>
              <p className="text-xs text-subtle mt-1">Vé phổ thông / Không chọn chỗ</p>
            </button>
            <button
              type="button"
              onClick={() => setSeatingType('ASSIGNED')}
              className={`rounded-xl border-2 px-5 py-4 text-left transition flex flex-col justify-center min-h-[96px] ${seatingType === 'ASSIGNED'
                ? 'border-[#C99A47] bg-[#C99A47]/10'
                : 'border-border-soft/40 hover:border-[#C99A47]/40'
                }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-bold text-content text-base leading-snug">Có chỗ ngồi</p>
                {organizerPlan && !organizerPlan.seat_map_enabled && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-400 border border-amber-500/20">
                    <Lock className="size-3" /> Cần nâng cấp
                  </span>
                )}
              </div>
              <p className="text-xs text-subtle mt-1">Chọn chỗ ngồi trên sơ đồ ghế</p>
            </button>
          </div>
        </section>

        {seatingType === 'ASSIGNED' && (
          <>
            <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <h2 className="text-[20px] font-semibold text-content flex items-center gap-2">
                  <Icon name="rule" className="text-[#C99A47]" />
                  Quy tắc chỗ ngồi & Giới hạn vé
                </h2>
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#C99A47]/10 text-[#C99A47] font-semibold border border-[#C99A47]/20">
                  Áp dụng phiên có sơ đồ ghế
                </span>
              </div>

              <div className="mb-5 p-4 rounded-xl border border-border-soft/40 bg-panel-soft/50 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="text-base font-bold text-content block">
                      Số vé / ghế tối đa 1 người được mua mỗi lần đặt
                    </label>
                    <p className="text-sm text-subtle">
                      Hệ thống sẽ giới hạn số vé/chỗ tối đa mà khách hàng có thể chọn và thanh toán trong một đơn hàng.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      className="h-10 w-16 rounded-lg border border-border-soft/60 bg-surface px-2 text-center text-sm font-bold text-content focus:border-tertiary outline-none shadow-sm"
                      value={formData.seating_rules?.max_tickets_per_order ?? 10}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(100, Number(e.target.value) || 1))
                        setFormData((p) => ({
                          ...p,
                          seating_rules: {
                            ...(p.seating_rules || {}),
                            max_tickets_per_order: val,
                          },
                        }))
                      }}
                    />
                    <span className="text-sm font-bold text-white whitespace-nowrap">vé/lần</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  {
                    key: 'require_adjacent_seats',
                    label: 'Bắt buộc chọn ghế liền kề',
                    desc: 'Người mua từ 2 vé trở lên phải chọn các ghế liền kề nhau trong cùng một hàng.',
                  },
                  {
                    key: 'require_same_row',
                    label: 'Bắt buộc cùng một hàng',
                    desc: 'Toàn bộ ghế trong đơn hàng phải nằm trên cùng một hàng ghế.',
                  },
                  {
                    key: 'disallow_single_seat_left',
                    label: 'Không cho phép để lại ghế lẻ',
                    desc: 'Ngăn chặn khách hàng chọn ghế khiến để lại 1 ghế trống đơn độc ở đầu/cuối hoặc giữa hàng.',
                  },
                ].map((rule) => (
                  <label
                    key={rule.key}
                    className="flex items-start gap-3 rounded-lg border border-border-soft/30 bg-panel-soft/40 px-4 py-3 text-sm text-content hover:border-border-soft/60 transition cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-tertiary"
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
                    <div>
                      <span className="font-semibold block">{rule.label}</span>
                      <span className="text-xs text-subtle">{rule.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
              <h2 className="mb-2 text-[20px] font-semibold text-content flex items-center gap-2">
                <Icon name="event_seat" className="text-[#C99A47]" />
                Sơ đồ ghế
              </h2>
              <p className="mb-4 text-sm text-subtle">
                Chọn sơ đồ cho địa điểm &quot;{venue?.name || '...'}&quot;
              </p>
              <SeatMapSelectDropdown
                value={activeSession?.seat_map_id || ''}
                options={venueSeatMaps}
                onChange={handleSeatMapSelect}
                loading={loadingMaps}
              />
              {loadingMaps && (
                <p className="mt-2 text-sm text-muted">Đang tải sơ đồ...</p>
              )}
              {loadedSeatMap && (
                <div className="mt-4 w-full space-y-3">
                  {/* Seat disabling info & quick toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-white/10 bg-[#121c38] px-3.5 py-2.5 text-xs relative z-20 overflow-visible">
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <span className="font-bold text-white whitespace-nowrap">
                        Tùy chọn vô hiệu hóa ghế:
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap">
                        <span className="rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-slate-300">
                          Tổng: <strong className="text-white">{totalMapSeats}</strong>
                        </span>
                        <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-emerald-300">
                          Mở bán: <strong className="text-emerald-200">{activeMapSeatsCount}</strong>
                        </span>
                        <span className="rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-slate-300">
                          Vô hiệu hóa: <strong className="text-slate-200">{disabledMapSeatsCount}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {uniqueRows.length > 0 && (
                        <RowSelectDropdown
                          rows={uniqueRows}
                          onSelectRow={handleToggleRowDisabled}
                        />
                      )}
                      {currentDisabledSeatIds.length > 0 && (
                        <button
                          type="button"
                          onClick={handleResetAllDisabledSeats}
                          className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer whitespace-nowrap"
                        >
                          Bỏ vô hiệu tất cả
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 italic">
                    * Nhấp trực tiếp vào từng vị trí ghế trên sơ đồ bên dưới để chuyển đổi trạng thái vô hiệu hóa (không mở bán cho phiên này).
                  </p>

                  <SeatMapPreview
                    seatMap={loadedSeatMap}
                    seats={loadedSeatMap.seats}
                    zones={loadedSeatMap.zones}
                    height={400}
                    interactive={true}
                    mode="TOGGLE_DISABLE"
                    disabledSeatIds={currentDisabledSeatIds}
                    onToggleSeat={handleToggleSeatDisabled}
                  />

                  {/* Seat map legend */}
                  <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 rounded-lg border border-white/5 bg-[#0b1329]/50 px-4 py-2.5 text-[11px] text-slate-300">
                    {loadedSeatMap.zones && loadedSeatMap.zones.length > 0 ? (
                      loadedSeatMap.zones.map((z) => (
                        <div key={z.id || z.localId || z.name} className="flex items-center gap-1.5">
                          <span
                            className="size-3 rounded-sm border border-black/30 shadow-sm shrink-0"
                            style={{ backgroundColor: z.color || '#3B82F6' }}
                          />
                          <span className="font-medium text-slate-200">{z.name}</span>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="size-3 rounded-sm bg-blue-500 border border-black/30 shrink-0" />
                        <span className="font-medium text-slate-200">Ghế mở bán</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      <span className="size-3 rounded-sm bg-[#1E293B] border border-dashed border-[#64748B] opacity-50 shrink-0" />
                      <span className="text-slate-400">Ghế vô hiệu hóa (không mở bán)</span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {loadedSeatMap && (() => {
              const groupedItems = getGroupedMapItems(loadedSeatMap)

              return (
                <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-4">
                  <div>
                    <h2 className="text-[20px] font-semibold text-content flex items-center gap-2">
                      <Icon name="sell" className="text-[#C99A47]" />
                      Gán giá & mô tả vé theo từng khu vực
                    </h2>
                  </div>

                  <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#121b33]">
                    <div className="w-full overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="border-b border-white/10 bg-[#172242] text-xs font-bold uppercase tracking-wider text-white">
                          <tr>
                            <th className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-white whitespace-nowrap">Khu vực / Vùng</th>
                            <th className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-white whitespace-nowrap">Hình thức</th>
                            <th className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-white whitespace-nowrap">Sức chứa</th>
                            <th className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-white whitespace-nowrap">Tên loại vé & Mô tả</th>
                            <th className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-white whitespace-nowrap">
                              Giá vé (VND) <span className="text-red-500 font-bold ml-0.5">*</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                          {groupedItems.map((group) => {
                            const ticket = sessionTickets.find((tt) => {
                              if (group.isSeated) {
                                const matchId = Boolean(tt.is_seated) && group.zoneIds.some(
                                  (id) => id === tt.zone_id || (tt.zone_ids || []).includes(id),
                                )
                                if (matchId) return true
                              } else {
                                const matchId = !tt.is_seated && group.standingAreaIds.some(
                                  (id) => id === tt.standing_area_id || (tt.standing_area_ids || []).includes(id),
                                )
                                if (matchId) return true
                              }
                              return tt.name && group.name && tt.name.trim().toLowerCase() === group.name.trim().toLowerCase()
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

                              // Check if ticket already exists in p.ticketTypes by name
                              let matchedKey = null
                              setFormData((p) => {
                                const exists = p.ticketTypes.find(
                                  (tItem) =>
                                    String(tItem.session_key) === String(sessionKey) &&
                                    tItem.name &&
                                    group.name &&
                                    tItem.name.trim().toLowerCase() === group.name.trim().toLowerCase()
                                )
                                if (exists) {
                                  matchedKey = exists.id || exists.clientKey
                                  return {
                                    ...p,
                                    ticketTypes: p.ticketTypes.map((tItem) => {
                                      if ((tItem.id || tItem.clientKey) === matchedKey) {
                                        return {
                                          ...tItem,
                                          is_seated: group.isSeated,
                                          zone_ids: group.zoneIds,
                                          standing_area_ids: group.standingAreaIds,
                                          zone_id: tItem.zone_id || group.zoneIds[0] || null,
                                          standing_area_id: tItem.standing_area_id || group.standingAreaIds[0] || null,
                                          ...extraFields,
                                        }
                                      }
                                      return tItem
                                    }),
                                  }
                                }

                                const newKey = newClientKey()
                                matchedKey = newKey
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
                                return {
                                  ...p,
                                  ticketTypes: [...p.ticketTypes, newTicket],
                                }
                              })
                              return matchedKey
                            }

                            return (
                              <tr key={group.groupKey} className="hover:bg-white/[0.02] transition-colors text-content">
                                <td className="px-3 py-3 align-top">
                                  <div className="flex items-center gap-2">
                                    <div className="flex -space-x-1 shrink-0">
                                      {group.colors.map((c, i) => (
                                        <span key={i} className="h-3.5 w-3.5 rounded-full border border-white/20 shrink-0" style={{ background: c }} />
                                      ))}
                                    </div>
                                    <span className="font-extrabold text-sm whitespace-nowrap">{group.name}</span>
                                  </div>
                                </td>

                                <td className="px-3 py-3 align-top whitespace-nowrap">
                                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${group.isSeated ? 'bg-primary/10 text-primary' : 'bg-tertiary/10 text-tertiary'}`}>
                                    {group.isSeated ? 'Ghế ngồi' : 'Vé đứng (GA)'}
                                  </span>
                                </td>

                                <td className="px-3 py-3 font-bold text-sm align-top whitespace-nowrap">
                                  {group.totalQuantity.toLocaleString('vi-VN')} {group.isSeated ? 'ghế' : 'chỗ'}
                                </td>

                                <td className="px-3 py-3 align-top space-y-1.5">
                                  <div>
                                    <input
                                      type="text"
                                      className="h-8.5 w-full max-w-[200px] rounded-lg border border-border-soft/40 bg-panel-soft px-2.5 text-xs font-bold text-content outline-none focus:border-tertiary shadow-inner"
                                      value={ticket?.name ?? group.name}
                                      onChange={(e) => {
                                        ensureGroupTicket({ name: e.target.value })
                                      }}
                                      placeholder={isEnglish ? 'Ticket type name...' : 'Tên loại vé...'}
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
                                        className="flex items-center gap-1.5 rounded-lg border border-tertiary/30 bg-tertiary/10 px-2 py-0.5 text-xs font-semibold text-tertiary hover:bg-tertiary/20 transition max-w-[200px] text-left truncate"
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
                                        className="flex items-center gap-1 rounded-lg border border-border-soft/40 bg-panel-soft px-2 py-0.5 text-xs font-semibold text-subtle hover:text-tertiary hover:border-tertiary/50 transition"
                                      >
                                        <span>+ Thêm mô tả</span>
                                      </button>
                                    )}
                                  </div>
                                </td>

                                <td className="px-3 py-3 align-top">
                                  <input
                                    type="text"
                                    placeholder="VD: 500.000"
                                    className="h-8.5 w-full max-w-[125px] rounded-lg border border-border-soft/40 bg-panel-soft px-2.5 text-sm font-extrabold text-content outline-none focus:border-tertiary shadow-inner"
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
                  </div>
                </section>
              )
            })()}
          </>
        )}

        {seatingType === 'GENERAL' && (
          <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-soft/30">
              <div>
                <h2 className="text-[20px] font-semibold text-content flex items-center gap-2">
                  <Icon name="confirmation_number" className="text-[#C99A47]" />
                  Cơ cấu loại vé & Giới hạn mua
                </h2>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                {sessionTickets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const allCollapsed = sessionTickets.every((tt) => collapsedTickets[tt.id || tt.clientKey] !== false)
                      if (allCollapsed) expandAllTickets()
                      else collapseAllTickets()
                    }}
                    title={sessionTickets.every((tt) => collapsedTickets[tt.id || tt.clientKey] !== false) ? 'Mở rộng tất cả' : 'Thu gọn tất cả'}
                    className="h-8.5 w-8.5 rounded-lg border border-border-soft/40 bg-panel-soft text-subtle hover:text-white hover:border-[#C99A47] transition flex items-center justify-center cursor-pointer"
                  >
                    <Icon
                      name={sessionTickets.every((tt) => collapsedTickets[tt.id || tt.clientKey] !== false) ? 'unfold_more' : 'unfold_less'}
                      className="text-[20px]"
                    />
                  </button>
                )}
                <button
                  type="button"
                  onClick={addTicketType}
                  className="org-btn-primary !px-3.5 !py-1.5 !text-sm font-bold gap-1.5 cursor-pointer transition-all"
                >
                  <Icon name="add" className="text-[15px]" />
                  <span>Thêm loại vé</span>
                </button>
              </div>
            </div>

            <div className="mb-5 p-4 rounded-xl border border-border-soft/40 bg-panel-soft/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="text-base font-bold text-content block">
                    Số vé tối đa 1 người được mua mỗi lần đặt
                  </label>
                  <p className="text-sm text-subtle">
                    Áp dụng cho toàn bộ đơn hàng của sự kiện khi khán giả chọn vé phổ thông.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="h-10 w-16 rounded-lg border border-border-soft/60 bg-surface px-2 text-center text-sm font-bold text-content focus:border-[#C99A47] outline-none shadow-sm"
                    value={formData.seating_rules?.max_tickets_per_order ?? 10}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(100, Number(e.target.value) || 1))
                      setFormData((p) => ({
                        ...p,
                        seating_rules: {
                          ...(p.seating_rules || {}),
                          max_tickets_per_order: val,
                        },
                      }))
                    }}
                  />
                  <span className="text-sm font-bold text-white whitespace-nowrap">vé/lần</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {sessionTickets.map((tt, index) => {
                const key = tt.id || tt.clientKey
                const isCollapsed = collapsedTickets[key] !== false
                const ticketPrice = Number(tt.price || 0)
                const ticketQty = Number(tt.quantity || 0)
                const estRevenue = ticketPrice * ticketQty
                const isFree = ticketPrice === 0 && tt.price !== '' && tt.price !== null && tt.price !== undefined

                const quickBenefitTags = [
                  'Vé vào cổng tiêu chuẩn',
                  'Đã bao gồm F&B',
                  'Quà tặng lưu niệm',
                  'Check-in lối ưu tiên',
                  'Chỗ ngồi gần sân khấu',
                ]

                const appendBenefit = (tag) => {
                  const curr = (tt.description || '').trim()
                  if (!curr) {
                    updateTicket(key, 'description', tag)
                  } else if (!curr.toLowerCase().includes(tag.toLowerCase())) {
                    updateTicket(key, 'description', `${curr} • ${tag}`)
                  }
                }

                return (
                  <div
                    key={key}
                    className={`rounded-2xl border transition-all duration-200 overflow-hidden shadow-sm ${isCollapsed
                      ? 'border-border-soft/50 bg-surface hover:border-[#C99A47]/50 hover:shadow-md'
                      : 'border-[#C99A47]/50 bg-surface ring-1 ring-[#C99A47]/20 shadow-md'
                      }`}
                  >
                    {/* Header của vé (Bấm để thu gọn/mở rộng) */}
                    <div
                      onClick={() => toggleTicketCollapse(key)}
                      className={`px-4 py-2.5 flex items-center justify-between cursor-pointer select-none transition-colors ${isCollapsed ? 'hover:bg-panel-soft/60' : 'bg-panel-soft/70 border-b border-border-soft/40'
                        }`}
                    >
                      {/* Left: Thứ tự + Tên vé + Badges tóm tắt */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                        <div className="w-7 h-7 rounded-lg bg-[#C99A47]/10 text-[#C99A47] font-bold text-xs flex items-center justify-center shrink-0 border border-[#C99A47]/25">
                          #{index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className={`text-sm font-bold truncate max-w-[200px] sm:max-w-[300px] ${tt.name?.trim() ? 'text-content' : 'text-muted italic'}`}>
                              {tt.name?.trim() || 'Chưa đặt tên loại vé...'}
                            </h4>
                            {/* Badge giá */}
                            {isFree ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-[#C99A47]/15 text-[#C99A47] border border-[#C99A47]/30">
                                Miễn phí
                              </span>
                            ) : ticketPrice > 0 ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-[#C99A47]/10 text-[#C99A47] border border-[#C99A47]/25">
                                {formatPriceString(tt.price)} VND
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-panel-soft text-muted border border-border-soft/40">
                                Chưa đặt giá
                              </span>
                            )}
                            {/* Badge số lượng */}
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-panel-soft text-subtle border border-border-soft/40">
                              {ticketQty.toLocaleString('vi-VN')} vé
                            </span>
                          </div>
                          {/* Trích đoạn mô tả khi thu gọn */}
                          {isCollapsed && tt.description?.trim() && (
                            <p className="text-[11px] text-muted truncate max-w-[460px] mt-0.5">
                              {tt.description.trim()}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Nút Xóa + Mũi tên thu gọn */}
                      <div className="flex items-center gap-2 shrink-0">
                        {sessionTickets.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeTicket(key)
                            }}
                            className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10 transition cursor-pointer"
                            title="Xóa loại vé này"
                          >
                            <Icon name="delete" className="text-[18px]" />
                          </button>
                        )}
                        <span
                          className="p-1 text-subtle hover:text-[#C99A47] transition rounded-lg"
                          title={isCollapsed ? 'Mở rộng chỉnh sửa' : 'Thu gọn vé'}
                        >
                          <Icon
                            name="expand_more"
                            className={`text-[22px] transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180 text-[#C99A47]'
                              }`}
                          />
                        </span>
                      </div>
                    </div>

                    {/* Thân card khi Mở rộng (Expanded) */}
                    {!isCollapsed && (
                      <div className="p-5 space-y-4 bg-surface/40">
                        <div className="grid grid-cols-1 md:grid-cols-[12fr_8fr_5fr] gap-4">
                          {/* Tên loại vé */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5 min-h-[24px]">
                              <label className="block text-sm font-bold text-white">
                                Tên loại vé <span className="text-red-500 font-bold ml-0.5">*</span>
                              </label>
                            </div>
                            <div>
                              <input
                                type="text"
                                className="w-full h-10 px-3.5 rounded-xl border border-border-soft/50 bg-panel-soft text-content text-sm font-bold focus:border-[#C99A47] focus:ring-1 focus:ring-[#C99A47]/20 outline-none transition"
                                value={tt.name || ''}
                                onChange={(e) => updateTicket(key, 'name', e.target.value)}
                                placeholder="VD: Early Bird, Standard, VIP..."
                              />
                            </div>
                          </div>

                          {/* Giá vé (VND) */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5 min-h-[24px]">
                              <label className="block text-sm font-bold text-white">
                                Giá vé (VND) <span className="text-red-500 font-bold ml-0.5">*</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => updateTicket(key, 'price', 0)}
                                className="text-xs font-bold text-[#C99A47] hover:text-[#E6C17A] cursor-pointer transition-colors no-underline hover:no-underline"
                              >
                                + Miễn phí
                              </button>
                            </div>
                            <div className="relative">
                              <input
                                type="text"
                                className="w-full h-10 pl-3 pr-14 rounded-xl border border-border-soft/50 bg-panel-soft text-content text-sm font-black focus:border-[#C99A47] focus:ring-1 focus:ring-[#C99A47]/20 outline-none transition text-right"
                                value={tt.price !== undefined && tt.price !== null ? formatPriceString(tt.price) : ''}
                                onChange={(e) => updateTicket(key, 'price', parsePriceNumber(e.target.value))}
                                placeholder="0"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white pointer-events-none select-none">
                                VND
                              </span>
                            </div>
                          </div>

                          {/* Số lượng vé */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5 min-h-[24px]">
                              <label className="block text-sm font-bold text-white whitespace-nowrap">
                                Số lượng vé <span className="text-red-500 font-bold ml-0.5">*</span>
                              </label>
                            </div>
                            <div className="relative">
                              <input
                                type="number"
                                min="1"
                                className="w-full h-10 pl-3 pr-10 rounded-xl border border-border-soft/50 bg-panel-soft text-content text-sm font-bold focus:border-[#C99A47] focus:ring-1 focus:ring-[#C99A47]/20 outline-none transition text-center"
                                value={tt.quantity || ''}
                                onChange={(e) => {
                                  const val = Math.max(1, Number(e.target.value) || 1)
                                  updateTicket(key, 'quantity', val)
                                }}
                                placeholder="100"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-white pointer-events-none select-none">
                                vé
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Mô tả loại vé & Gợi ý nhanh */}
                        <div className="space-y-2">
                          <label className="block text-sm font-bold text-white">
                            Mô tả & Quyền lợi đi kèm (Tùy chọn)
                          </label>

                          <textarea
                            rows={2}
                            className="w-full px-3 py-2 rounded-xl border border-border-soft/50 bg-panel-soft text-content text-sm outline-none focus:border-[#C99A47] focus:ring-1 focus:ring-[#C99A47]/20 resize-none placeholder:text-muted"
                            value={tt.description || ''}
                            onChange={(e) => updateTicket(key, 'description', e.target.value)}
                            placeholder={isEnglish ? 'Enter description of perks: Entrance ticket, drinks included, souvenirs...' : 'Nhập mô tả các đặc quyền: Vé vào cửa, đã gồm nước uống, quà tặng lưu niệm...'}
                          />

                          {/* Gợi ý quyền lợi nhanh - Đặt dưới ô input theo yêu cầu */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span className="text-xs font-bold text-[#E6C17A] uppercase">GỢI Ý:</span>
                            {quickBenefitTags.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => appendBenefit(tag)}
                                className="px-2.5 py-1 rounded-md text-xs font-medium bg-panel-soft text-subtle hover:text-[#C99A47] hover:bg-[#C99A47]/10 hover:border-[#C99A47]/40 border border-border-soft/40 transition cursor-pointer"
                              >
                                + {tag}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Footer của vé khi mở: Tóm tắt doanh thu dự kiến */}
                        <div className="flex items-center justify-between pt-3 border-t border-border-soft/30 text-xs">
                          <div className="flex items-center gap-2 text-subtle">
                            <Icon name="payments" className="text-base text-[#C99A47]" />
                            <span>
                              Doanh thu dự kiến:{' '}
                              <strong className="text-[#C99A47] font-bold text-sm">
                                {estRevenue.toLocaleString('vi-VN')} VND
                              </strong>{' '}
                              <span className="text-muted text-[11px]">
                                ({ticketQty.toLocaleString('vi-VN')} vé × {isFree ? 'Miễn phí' : `${formatPriceString(ticketPrice)} VND`})
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {!sessionTickets.length && (
                <div className="py-8 border-2 border-dashed border-border-soft/40 rounded-2xl text-center space-y-2">
                  <Icon name="confirmation_number" className="text-3xl text-muted mx-auto block" />
                  <p className="text-sm font-semibold text-subtle">
                    Chưa có loại vé nào cho phiên này
                  </p>
                  <button
                    type="button"
                    onClick={addTicketType}
                    className="org-btn-primary px-4 py-2 text-xs"
                  >
                    <Icon name="add" className="text-sm" />
                    Thêm loại vé đầu tiên
                  </button>
                </div>
              )}
            </div>
          </section>
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
          <div className="border-b border-border-soft/30 bg-panel-soft/60 px-6 py-4 flex items-center gap-2">
            <Icon name="receipt_long" className="text-[#C99A47] text-base" />
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
              <span className="text-xs font-bold uppercase tracking-wider text-white block">Tổng Doanh Thu</span>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-black text-[#C99A47] tracking-tight">
                  {totalRevenue.toLocaleString('vi-VN')}
                </span>
                <span className="text-xs font-extrabold text-[#C99A47] uppercase">VND</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step4PoliciesSettings({ formData, setFormData, completeness, editPermissions }) {
  const { isEnglish } = useLanguage()
  const { refund_policy: rp } = formData
  const [uploadingPolicy, setUploadingPolicy] = useState(false)
  const [uploadingPermits, setUploadingPermits] = useState(false)
  const policyFileInputRef = useRef(null)
  const permitFileInputRef = useRef(null)
  const toast = useToast()

  const allowRefund = Boolean(rp?.allow_refund ?? rp?.allow_refunds)
  const refundRules = Array.isArray(rp?.refund_rules) ? rp.refund_rules : []
  const refundNotes = rp?.refund_notes || ''

  const handleToggleRefund = (checked) => {
    setFormData((p) => {
      const currentRp = p.refund_policy || {}
      const defaultRules = [
        { days_before: 7, refund_rate: 100 },
        { days_before: 3, refund_rate: 50 },
      ]
      return {
        ...p,
        refund_policy: {
          ...currentRp,
          allow_refund: checked,
          allow_refunds: checked,
          refund_rules: checked
            ? (currentRp.refund_rules && currentRp.refund_rules.length > 0 ? currentRp.refund_rules : defaultRules)
            : [],
        },
      }
    })
  }

  const handleRuleChange = (index, field, value) => {
    setFormData((p) => {
      const currentRp = p.refund_policy || {}
      const rules = [...(currentRp.refund_rules || [])]
      rules[index] = {
        ...rules[index],
        [field]: value === '' ? '' : Math.max(0, Number(value)),
      }
      return {
        ...p,
        refund_policy: {
          ...currentRp,
          refund_rules: rules,
        },
      }
    })
  }

  const handleAddRule = () => {
    if (refundRules.length >= 4) {
      toast.warning('Tối đa chỉ cho phép 4 mốc hoàn tiền.')
      return
    }
    setFormData((p) => {
      const currentRp = p.refund_policy || {}
      const rules = [...(currentRp.refund_rules || [])]
      const lastRule = rules[rules.length - 1]
      const nextDays = lastRule ? Math.max(1, Number(lastRule.days_before) - 2) : 1
      const nextRate = lastRule ? Math.max(0, Number(lastRule.refund_rate) - 25) : 25
      rules.push({ days_before: nextDays, refund_rate: nextRate })
      return {
        ...p,
        refund_policy: {
          ...currentRp,
          refund_rules: rules,
        },
      }
    })
  }

  const handleRemoveRule = (index) => {
    if (refundRules.length <= 1) {
      toast.warning('Cần giữ lại ít nhất 1 mốc hoàn vé khi bật chính sách hoàn tiền.')
      return
    }
    setFormData((p) => {
      const currentRp = p.refund_policy || {}
      const rules = [...(currentRp.refund_rules || [])]
      rules.splice(index, 1)
      return {
        ...p,
        refund_policy: {
          ...currentRp,
          refund_rules: rules,
        },
      }
    })
  }

  const handleNotesChange = (e) => {
    const val = e.target.value.slice(0, 500)
    setFormData((p) => ({
      ...p,
      refund_policy: {
        ...p.refund_policy,
        refund_notes: val,
      },
    }))
  }

  const rulesValidation = useMemo(() => {
    if (!allowRefund) return { valid: true }
    return validateRefundRules(refundRules)
  }, [allowRefund, refundRules])

  const previewLines = useMemo(() => {
    return generateRefundPolicyLines({
      allow_refund: allowRefund,
      refund_rules: refundRules,
      refund_notes: refundNotes,
    })
  }, [allowRefund, refundRules, refundNotes])

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
        {/* Section 1: Event Organization Permits & Legal Documents */}
        <section className="bg-surface rounded-xl border border-border-soft/30 p-6 hover:shadow-md transition-shadow shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-5">
          <div>
            <h3 className="text-[20px] font-semibold text-content flex items-center gap-2">
              <Icon name="verified_user" className="text-[#C99A47]" />
              Giấy phép tổ chức sự kiện & Giấy tờ liên quan
            </h3>
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
              accept=".pdf"
              className="hidden"
              onChange={handlePermitFilesChange}
            />
            <div className="flex flex-col items-center justify-center py-2">
              <div className="size-12 rounded-full bg-[#C99A47]/10 text-[#C99A47] flex items-center justify-center mb-2">
                <Icon name="note_add" className="text-2xl" />
              </div>
              <p className="text-sm font-semibold text-content">
                Tải lên giấy phép & tài liệu sự kiện
              </p>
              <p className="text-xs text-muted mt-1">
                Hỗ trợ định dạng PDF · Tối đa 10MB/file
              </p>
              <button
                type="button"
                disabled={uploadingPermits}
                onClick={() => permitFileInputRef.current?.click()}
                className="mt-3 org-btn-primary px-4 py-2 text-xs disabled:opacity-50 cursor-pointer"
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
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-content truncate">{file.name}</p>
                      <p className="text-[11px] text-muted">
                        {formatFileSize(file.size)} · {file.uploaded_at ? new Date(file.uploaded_at).toLocaleDateString(getAutoLocale()) : (getAutoLocale() === 'en-US' ? 'Uploaded' : 'Đã tải lên')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded-lg text-subtle hover:text-white hover:bg-white/10 transition flex items-center justify-center cursor-pointer"
                        title="Xem tài liệu"
                      >
                        <Icon name="visibility" className="text-[18px]" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemovePermitFile(file.id)}
                        className="p-1 rounded-lg text-subtle hover:text-error hover:bg-error/10 transition cursor-pointer"
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

        {/* Section 2: Attendee Info */}
        <section className="bg-surface rounded-xl border border-border-soft/30 p-6 hover:shadow-md transition-shadow shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[20px] font-semibold text-content flex items-center gap-2">
                <Icon name="contacts" className="text-[#C99A47]" />
                Thông tin người tham dự
              </h3>
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
              <div className="w-11 h-6 bg-border-soft/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#C99A47]" />
              <span className="ml-3 text-sm font-medium text-content">Yêu cầu thu thập</span>
            </label>
          </div>
          <p className="mt-4 text-sm text-subtle">
            Bật tính năng này để yêu cầu người mua cung cấp thông tin (như họ tên, số điện thoại, ngày sinh) cho <b>TỪNG</b> vé họ mua trước khi hoàn tất đăng ký.
          </p>
        </section>

        {/* Section 3: Policies & Terms + Policy File Import */}
        <section className="bg-surface rounded-xl border border-border-soft/30 p-6 hover:shadow-md transition-shadow shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-5">
          <div>
            <h3 className="text-[20px] font-semibold text-content flex items-center gap-2">
              <Icon name="gavel" className="text-[#C99A47]" />
              Chính sách & Điều khoản tham dự
            </h3>
          </div>

          {/* Import Policy File Card */}
          <div className="p-4 rounded-xl bg-panel-soft/60 border border-border-soft/40 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-content uppercase tracking-wider">
                  Import file chính sách sự kiện
                </span>
              </div>
              <div>
                <input
                  type="file"
                  ref={policyFileInputRef}
                  accept=".pdf"
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
                      <span>{rp?.policy_file_url ? 'Thay đổi file' : 'Chọn file (.pdf)'}</span>
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
                Bạn có thể tải lên file chính sách chi tiết của sự kiện (định dạng PDF, không bắt buộc).
              </p>
            )}
          </div>

          <div>
            <label className="text-[13px] text-subtle block mb-2 font-medium">
              Nội dung điều khoản & quy định cho người tham gia
            </label>
            <textarea
              className="w-full border border-border-soft/40 rounded-xl px-4 py-3 text-sm h-36 resize-none outline-none bg-panel-soft text-content placeholder:text-muted focus:border-tertiary focus:ring-1 focus:ring-tertiary transition"
              placeholder={isEnglish ? 'Enter or import additional terms, age limits, dress code, or guidelines for ticket holders...' : 'Nhập hoặc import các điều khoản, quy định độ tuổi, trang phục, hoặc hướng dẫn bổ sung cho người giữ vé...'}
              value={formData.additional_terms}
              onChange={(e) => setFormData((p) => ({ ...p, additional_terms: e.target.value }))}
            />
          </div>
        </section>

        {/* Section 4: Structured Refund Policy */}
        <section className="bg-surface rounded-xl border border-border-soft/30 p-6 hover:shadow-md transition-shadow shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[20px] font-semibold text-content flex items-center gap-2">
                <Icon name="history" className="text-[#C99A47]" />
                Chính sách hoàn vé
              </h3>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                aria-label="Chính sách hoàn vé"
                className="sr-only peer"
                checked={allowRefund}
                onChange={(e) => handleToggleRefund(e.target.checked)}
              />
              <div className="w-11 h-6 bg-border-soft/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#C99A47]" />
            </label>
          </div>

          {!allowRefund ? (
            <div className="p-4 rounded-xl bg-panel-soft/50 border border-border-soft/30 flex items-start gap-3 text-xs text-subtle">
              <Icon name="info" className="text-muted text-base shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                Khách hàng sẽ <strong>không thể yêu cầu hoàn vé</strong> sau khi thanh toán thành công. Mọi vé đã mua được xem là vé không hoàn hủy trong mọi trường hợp.
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="pb-1 border-b border-border-soft/30">
                <div className="text-xs font-semibold text-content uppercase tracking-wider">
                  Cấu hình các mốc hoàn tiền (từ 1 đến 4 mốc)
                </div>
              </div>

              {/* Rules List */}
              <div className="space-y-3">
                {refundRules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl bg-panel-soft border border-border-soft/40"
                  >
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-md bg-[#C99A47]/15 text-[#C99A47] border border-[#C99A47]/30 text-xs font-bold">
                        Mốc {idx + 1}
                      </span>
                      <span className="text-xs text-subtle font-medium">Hủy trước sự kiện ít nhất:</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="365"
                        value={rule.days_before}
                        onChange={(e) => handleRuleChange(idx, 'days_before', e.target.value)}
                        className="w-20 px-2.5 py-1.5 rounded-lg border border-border-soft/60 bg-surface text-sm font-semibold text-content text-center outline-none focus:border-[#C99A47] focus:ring-1 focus:ring-[#C99A47]/20 transition"
                      />
                      <span className="text-xs text-subtle font-medium">ngày</span>
                    </div>

                    <div className="flex items-center gap-2 sm:ml-auto">
                      <span className="text-xs text-subtle font-medium">Hoàn lại:</span>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={rule.refund_rate}
                          onChange={(e) => handleRuleChange(idx, 'refund_rate', e.target.value)}
                          className="w-20 px-2.5 py-1.5 pr-6 rounded-lg border border-border-soft/60 bg-surface text-sm font-bold text-white [html.light_&]:text-[#0D1B2A] text-center outline-none focus:border-[#C99A47] focus:ring-1 focus:ring-[#C99A47]/20 transition"
                        />
                        <span className="absolute right-2 top-1.5 text-xs text-white/80 [html.light_&]:text-[#0D1B2A] font-bold">%</span>
                      </div>
                      <span className="text-xs text-subtle font-medium">giá vé</span>

                      <button
                        type="button"
                        onClick={() => handleRemoveRule(idx)}
                        disabled={refundRules.length <= 1}
                        className="p-1.5 rounded-lg text-subtle hover:text-error hover:bg-error/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-subtle transition ml-1 cursor-pointer"
                        title={refundRules.length <= 1 ? 'Cần ít nhất 1 mốc' : 'Xóa mốc'}
                      >
                        <Icon name="delete" className="text-base" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {refundRules.length < 4 && (
                <button
                  type="button"
                  onClick={handleAddRule}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-white/30 hover:border-white text-xs font-bold text-white hover:bg-white/5 transition cursor-pointer [html.light_&]:border-[#C99A47]/40 [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:border-[#C99A47] [html.light_&]:hover:bg-[#C99A47]/10"
                >
                  <Icon name="add" className="text-base text-white [html.light_&]:text-[#0D1B2A]" />
                  <span>Thêm mốc hoàn vé ({refundRules.length}/4)</span>
                </button>
              )}

              {/* Validation alert if rules are invalid */}
              {!rulesValidation.valid && (
                <div className="p-3 rounded-xl bg-error/10 border border-error/20 flex items-start gap-2 text-xs text-error">
                  <Icon name="error_outline" className="text-base shrink-0 mt-0.5" />
                  <div className="leading-relaxed">{rulesValidation.error}</div>
                </div>
              )}

              {/* Live Preview Box */}
              <div className="p-4 rounded-xl bg-panel-soft/60 border border-border-soft/40 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-content uppercase tracking-wider">
                  <Icon name="visibility" className="text-[#C99A47] text-sm" />
                  <span>Xem trước quy định hiển thị cho khách hàng</span>
                </div>
                <div className="p-3 rounded-lg bg-surface border border-border-soft/40 text-xs text-subtle space-y-1.5">
                  {previewLines.map((line, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-[#C99A47] mt-0.5">•</span>
                      <span className="leading-relaxed">{line.replace(/^•\s*/, '')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Optional Refund Notes */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-subtle font-medium">
                    Ghi chú / Điều kiện bổ sung (tùy chọn)
                  </label>
                  <span className="text-[11px] text-muted">{refundNotes.length}/500</span>
                </div>
                <textarea
                  className="w-full border border-border-soft/40 rounded-xl px-3.5 py-2.5 text-xs h-20 resize-none outline-none bg-panel-soft text-content placeholder:text-muted focus:border-tertiary focus:ring-1 focus:ring-tertiary transition"
                  placeholder={isEnglish ? 'e.g.: Promotional tickets not eligible for refunds; refunds will be processed in 3-5 business days...' : 'Ví dụ: Vé tặng, vé giảm giá đặc biệt không áp dụng hoàn tiền; tiền hoàn sẽ được xử lý trong vòng 3-5 ngày làm việc...'}
                  value={refundNotes}
                  onChange={handleNotesChange}
                />
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
              <Icon
                name={permitFiles.length > 0 ? 'check_circle' : 'warning'}
                className={permitFiles.length > 0 ? 'text-success text-lg mt-0.5 shrink-0' : 'text-warning text-lg mt-0.5 shrink-0'}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-content">Giấy phép tổ chức</p>
                <p className="text-xs text-muted leading-relaxed break-words">
                  {permitFiles.length > 0
                    ? `Đã đính kèm ${permitFiles.length} tài liệu pháp lý`
                    : 'Chưa tải lên giấy phép tổ chức'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Icon name="check_circle" className="text-success text-lg mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
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
                name="check_circle"
                className="text-success text-lg mt-0.5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-content">Chính sách sự kiện</p>
                {rp?.policy_file_url ? (
                  <p className="text-xs text-muted leading-relaxed break-words">
                    Đã đính kèm file:
                    <span className="block mt-0.5 text-[11px] font-medium text-subtle break-all [overflow-wrap:anywhere] leading-snug">
                      ({rp.policy_file_name || 'file'})
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-muted leading-relaxed break-words">
                    {formData.additional_terms?.trim()
                      ? 'Đã nhập điều khoản tham dự'
                      : 'Quy định tiêu chuẩn (Không bắt buộc)'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Icon
                name={allowRefund ? 'check_circle' : 'info'}
                className={allowRefund ? 'text-success text-lg mt-0.5 shrink-0' : 'text-muted text-lg mt-0.5 shrink-0'}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-content">Chính sách hoàn vé</p>
                <p className="text-xs text-muted leading-relaxed break-words">
                  {allowRefund
                    ? `Cho phép hoàn vé (${refundRules.length} mốc)`
                    : 'Không hỗ trợ hoàn vé'}
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
  const { isEnglish } = useLanguage()
  const categoryName = getCategoryName(categories.find((c) => c.id === formData.category_id), isEnglish)
  const firstSession = formData.sessions[0]
  const defaultVenue = venues.find((v) => v.id === firstSession?.venue_id)

  const groupedTickets = []
  formData.ticketTypes.forEach((tt) => {
    const key = `${tt.name}_${tt.price}_${tt.is_seated}`
    let group = groupedTickets.find((g) => g.key === key)
    if (!group) {
      group = {
        key,
        name: tt.name,
        price: tt.price,
        is_seated: tt.is_seated,
        description: tt.description,
        totalQty: 0,
        sessions: [],
      }
      groupedTickets.push(group)
    }
    group.totalQty += Number(tt.quantity || 0)
    const session = formData.sessions.find((s) => (s.id || s.clientKey) === tt.session_key)
    if (session) {
      const sessionIndex = formData.sessions.indexOf(session) + 1
      const ms = new Date(`${session.start_date}T${session.start_time}`).getTime() || 0
      const sessionTitle = session.session_name?.trim()
      const sPrefix = isEnglish ? 'Session' : 'Phiên'
      const sName = sessionTitle
        ? (sessionTitle.toLowerCase().startsWith('phiên') || sessionTitle.toLowerCase().startsWith('session')
            ? sessionTitle
            : `${sPrefix} ${sessionIndex}: ${sessionTitle}`)
        : `${sPrefix} ${sessionIndex}`
      group.sessions.push({
        name: sName,
        qty: tt.quantity,
        timeMs: ms,
      })
    }
  })

  // Sort sessions inside each group chronologically
  groupedTickets.forEach((group) => {
    group.sessions.sort((a, b) => a.timeMs - b.timeMs)
  })

  const totalEventRevenue = formData.ticketTypes.reduce(
    (acc, t) => acc + Number(t.price || 0) * Number(t.quantity || 0),
    0,
  )
  const totalEventTickets = formData.ticketTypes.reduce(
    (acc, t) => acc + Number(t.quantity || 0),
    0,
  )

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-8 space-y-6 pb-8">
        {/* Banner & Header Thông tin sự kiện (Đã xóa hình thức offline/online) */}
        <section className="bg-surface border border-border-soft/30 rounded-2xl overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="h-[260px] sm:h-[280px] relative bg-panel-soft">
            {formData.banner_url && (
              <img src={formData.banner_url} alt="" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 flex items-end gap-4 sm:gap-5">
              {formData.thumbnail_url && (
                <div className="size-24 sm:size-28 bg-surface p-1 rounded-2xl border-2 border-tertiary shadow-2xl z-10 shrink-0">
                  <img src={formData.thumbnail_url} alt="" className="w-full h-full object-cover rounded-xl" />
                </div>
              )}
              <div className="event-hero-banner-overlay mb-1 pb-1 min-w-0 flex-1">
                <h3 className="event-hero-title text-xl sm:text-2xl lg:text-3xl font-black !text-white leading-tight tracking-tight truncate drop-shadow-md">
                  {formData.title || 'Chưa nhập tên sự kiện'}
                </h3>
                <div className="flex gap-2 mt-2.5 flex-wrap items-center">
                  {categoryName && (
                    <span className="bg-tertiary px-3 py-1 rounded-full text-xs font-extrabold !text-white shadow-sm">
                      {categoryName}
                    </span>
                  )}
                  {formData.tags.map((tag) => (
                    <span key={tag} className="bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[11px] font-semibold !text-white border border-white/25">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="p-6">
            <h5 className="text-xs font-bold uppercase tracking-wider text-white mb-1">
              {isEnglish ? 'Event Summary' : 'Mô tả tóm tắt sự kiện'}
            </h5>
            <p className="text-sm text-white/90 leading-relaxed">
              {formData.short_description || (isEnglish ? 'No summary description yet.' : 'Chưa có mô tả tóm tắt.')}
            </p>
          </div>
        </section>

        {/* Lịch trình & Địa điểm */}
        <section className="bg-surface border border-border-soft/30 rounded-2xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-border-soft/30">
            <div className="flex items-center gap-2">
              <Icon name="calendar_today" className="text-[#C99A47] text-xl" />
              <h4 className="text-sm font-extrabold uppercase tracking-wider text-content">
                {isEnglish ? 'Schedule & Venue' : 'Lịch trình & Địa điểm tổ chức'}
              </h4>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-tertiary/10 text-tertiary border border-tertiary/20">
              {formData.sessions.length} {isEnglish ? 'sessions' : 'phiên sự kiện'}
            </span>
          </div>

          <div className="space-y-3">
            {formData.sessions.map((session, idx) => {
              const sVenue = venues.find((v) => v.id === session.venue_id) || defaultVenue
              const dateFormatted = session.start_date
                ? (isEnglish
                    ? new Date(session.start_date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
                    : session.start_date.split('-').reverse().join('/'))
                : (isEnglish ? 'No date selected' : 'Chưa chọn ngày')

              return (
                <div
                  key={session.id || session.clientKey || idx}
                  className="p-4 rounded-xl bg-panel-soft/60 border border-border-soft/40 hover:border-border-soft/70 transition space-y-2.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-[#C99A47]/15 text-[#C99A47] text-xs font-black flex items-center justify-center shrink-0 border border-[#C99A47]/30">
                        #{idx + 1}
                      </span>
                      <h5 className="font-bold text-sm text-content">
                        {session.session_name || `${isEnglish ? 'Session' : 'Phiên'} ${idx + 1}`}
                      </h5>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border self-start sm:self-auto ${session.seating_type === 'ASSIGNED'
                      ? 'bg-primary/10 text-primary border-primary/20'
                      : 'bg-panel-soft text-subtle border-border-soft/50'
                      }`}>
                      {session.seating_type === 'ASSIGNED' ? (isEnglish ? 'Assigned Seating' : 'Sơ đồ ghế chỉ định') : (isEnglish ? 'General Admission' : 'Vé phổ thông (Tự do)')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm pt-2 border-t border-border-soft/20">
                    <div className="flex items-center gap-2 text-content">
                      <Icon name="event" className="text-base text-tertiary shrink-0" />
                      <span className="truncate">
                        {isEnglish ? 'Date:' : 'Ngày:'} <strong className="text-content font-bold">{dateFormatted}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-content">
                      <Icon name="schedule" className="text-base text-tertiary shrink-0" />
                      <span className="truncate">
                        {isEnglish ? 'Showtime:' : 'Giờ diễn ra:'} <strong className="text-content font-bold">{session.start_time || '--:--'} - {session.end_time || '--:--'}</strong>
                      </span>
                    </div>

                    {session.checkin_start_time && (
                      <div className="flex items-center gap-2 text-content">
                        <Icon name="how_to_reg" className="text-base text-tertiary shrink-0" />
                        <span className="truncate">
                          {isEnglish ? 'Check-in opens:' : 'Mở check-in:'} <strong className="text-content font-bold">{session.checkin_start_time}</strong>
                          {session.checkin_start_date && (
                            <span className="text-subtle font-normal ml-1">
                              ({session.checkin_start_date})
                            </span>
                          )}
                        </span>
                      </div>
                    )}

                    {session.direct_sale_start_time && (
                      <div className="flex items-center gap-2 text-content">
                        <Icon name="confirmation_number" className="text-base text-tertiary shrink-0" />
                        <span className="truncate">
                          {isEnglish ? 'Direct sales:' : 'Bán vé trực tiếp:'}{' '}
                          <strong className="text-content font-bold">
                            {session.direct_sale_start_time}
                            {session.direct_sale_start_date ? ` (${session.direct_sale_start_date})` : ''}
                            {session.direct_sale_end_time ? ` - ${session.direct_sale_end_time}` : ''}
                            {session.direct_sale_end_date && session.direct_sale_end_date !== session.direct_sale_start_date ? ` (${session.direct_sale_end_date})` : ''}
                          </strong>
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-content sm:col-span-2">
                      <Icon name="location_on" className="text-base text-tertiary shrink-0" />
                      <span className="truncate">
                        {isEnglish ? 'Venue:' : 'Địa điểm:'} <strong className="text-content font-bold">{sVenue?.name || (isEnglish ? 'No venue selected' : 'Chưa chọn địa điểm')}</strong>
                        {sVenue?.address && <span className="text-subtle font-normal ml-1.5 truncate">({sVenue.address})</span>}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Cơ cấu vé & Chỗ ngồi */}
        <section className="bg-surface border border-border-soft/30 rounded-2xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-border-soft/30">
            <div className="flex items-center gap-2">
              <Icon name="confirmation_number" className="text-[#C99A47] text-xl" />
              <h4 className="text-sm font-extrabold uppercase tracking-wider text-content">
                {isEnglish ? 'Ticket Tiers & Pricing' : 'Cơ cấu vé & Bảng giá'}
              </h4>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <span className="text-white font-medium">{isEnglish ? 'Total:' : 'Tổng:'} <strong className="text-white font-bold">{totalEventTickets.toLocaleString(getAutoLocale())} {isEnglish ? 'tickets' : 'vé'}</strong></span>
              <span className="text-border-soft/60">|</span>
              <span className="text-white font-medium">{isEnglish ? 'Est. revenue:' : 'Dự thu:'} <strong className="text-[#C99A47] font-bold">{totalEventRevenue.toLocaleString(getAutoLocale())} VND</strong></span>
            </div>
          </div>

          <div className="space-y-3">
            {groupedTickets.map((group, index) => {
              const isFree = Number(group.price) === 0
              const TICKET_COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500']
              const colorClass = TICKET_COLORS[index % TICKET_COLORS.length]

              return (
                <div key={group.key} className="flex flex-col p-4 bg-panel-soft/60 rounded-xl border border-border-soft/40 shadow-sm relative overflow-hidden space-y-2">
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 opacity-90 ${colorClass}`} />
                  <div className="flex justify-between items-start pl-2">
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm text-content">{group.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${group.is_seated ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-[#C99A47]/10 text-[#C99A47] border border-[#C99A47]/20'
                          }`}>
                          {group.is_seated ? (isEnglish ? 'Seated' : 'Ghế ngồi') : (isEnglish ? 'Standing / General' : 'Vé tự do')}
                        </span>
                      </div>
                      <p className="text-xs text-subtle font-medium mt-1">
                        {isEnglish ? 'Total issued:' : 'Tổng phát hành:'} <strong className="text-content">{Number(group.totalQty).toLocaleString(getAutoLocale())} {isEnglish ? 'tickets' : 'vé'}</strong>
                      </p>
                      {group.description && (
                        <p className="text-[11px] text-muted mt-1 leading-relaxed italic">
                          {isEnglish ? 'Perks:' : 'Quyền lợi:'} {group.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {isFree ? (
                        <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-[#C99A47]/15 text-[#C99A47] border border-[#C99A47]/30">
                          {isEnglish ? 'Free' : 'Miễn phí'}
                        </span>
                      ) : (
                        <span className="text-sm font-black text-[#C99A47]">
                          {Number(group.price).toLocaleString(getAutoLocale())} VND
                        </span>
                      )}
                    </div>
                  </div>

                  {formData.sessions.length > 1 && group.sessions.length > 0 && (
                    <div className="mt-2 pl-2 pt-2 border-t border-border-soft/25 flex flex-wrap gap-1.5">
                      {group.sessions.map((s, idx) => (
                        <span key={idx} className="text-[11px] bg-surface/80 border border-border-soft/40 px-2 py-0.5 rounded-md text-subtle font-medium">
                          {s.name}: <strong className="text-content">{s.qty} {isEnglish ? 'tickets' : 'vé'}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Giấy phép & Hồ sơ pháp lý sự kiện */}
        <section className="bg-surface border border-border-soft/30 rounded-2xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-border-soft/30">
            <div className="flex items-center gap-2">
              <Icon name="verified_user" className="text-[#C99A47] text-xl" />
              <h4 className="text-sm font-extrabold uppercase tracking-wider text-content">
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
                  className="flex items-center justify-between p-3.5 rounded-xl bg-panel-soft/60 border border-border-soft/40 text-xs hover:border-border-soft/70 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-8 rounded-lg bg-[#C99A47]/10 text-[#C99A47] flex items-center justify-center shrink-0">
                      <Icon
                        name={file.type?.includes('pdf') || file.name?.endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                        className="text-base"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-content truncate">{file.name}</p>
                      <p className="text-[11px] text-muted">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-white hover:text-[#C99A47] hover:bg-white/10 transition flex items-center justify-center shrink-0 cursor-pointer"
                    title="Xem tài liệu"
                  >
                    <Icon name="visibility" className="text-[18px]" />
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/20 text-xs text-warning flex items-start gap-2">
              <Icon name="warning" className="text-base shrink-0 mt-0.5" />
              <span>Chưa có giấy phép tổ chức nào được đính kèm. Vui lòng quay lại Bước 4 để tải lên giấy phép hợp lệ.</span>
            </div>
          )}
        </section>

        {/* Cài đặt & Điều khoản tham dự */}
        <section className="bg-surface border border-border-soft/30 rounded-2xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border-soft/30">
            <Icon name="policy" className="text-[#C99A47] text-xl" />
            <h4 className="text-sm font-extrabold uppercase tracking-wider text-content">Chính sách & Điều khoản tham dự</h4>
          </div>

          <div className="p-4 rounded-xl bg-panel-soft/60 border border-border-soft/30 text-sm flex items-center justify-between">
            <span className="text-white font-medium">Thu thập thông tin người tham dự</span>
            <span className="font-bold text-white px-2.5 py-0.5 rounded-full bg-surface border border-border-soft/40 text-xs">
              {formData.require_attendee_info ? 'Bắt buộc từng vé' : 'Không bắt buộc'}
            </span>
          </div>

          {formData.refund_policy?.policy_file_url && (
            <div className="p-4 rounded-xl bg-panel-soft/60 border border-border-soft/30 text-sm flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon name="description" className="text-blue-500 shrink-0 text-lg" />
                <div className="min-w-0">
                  <span className="text-white font-bold truncate block">
                    {formData.refund_policy.policy_file_name || 'File chính sách sự kiện'}
                  </span>
                  <span className="text-muted text-xs">
                    {formatFileSize(formData.refund_policy.policy_file_size)}
                  </span>
                </div>
              </div>
              <a
                href={formData.refund_policy.policy_file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-white hover:text-[#C99A47] hover:bg-white/10 transition flex items-center justify-center shrink-0 cursor-pointer"
                title="Xem file chính sách"
              >
                <Icon name="visibility" className="text-[18px]" />
              </a>
            </div>
          )}

          {formData.additional_terms && (
            <div className="p-4 rounded-xl bg-panel-soft/60 border border-border-soft/30 text-sm space-y-1.5">
              <span className="font-bold text-white block uppercase text-xs">Điều khoản bổ sung:</span>
              <p className="text-white whitespace-pre-wrap leading-relaxed">{formData.additional_terms}</p>
            </div>
          )}

          <div className="p-4 rounded-xl bg-panel-soft/60 border border-border-soft/30 text-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">Chính sách hoàn vé</span>
              <span className={`font-bold px-2.5 py-0.5 rounded-full bg-surface border border-border-soft/40 text-xs ${formData.refund_policy?.allow_refund ? 'text-emerald-400' : 'text-muted'}`}>
                {formData.refund_policy?.allow_refund ? 'Hỗ trợ hoàn vé' : 'Không hỗ trợ hoàn vé'}
              </span>
            </div>
            {formData.refund_policy?.allow_refund && (
              <div className="pt-2 border-t border-border-soft/30 space-y-1.5 text-white">
                {generateRefundPolicyLines(formData.refund_policy).map((line, idx) => (
                  <div key={idx} className="leading-relaxed">
                    {line}
                  </div>
                ))}
                {formData.refund_policy?.refund_notes && (
                  <div className="pt-1.5 text-muted text-xs italic">
                    Ghi chú: {formData.refund_policy.refund_notes}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Cam kết của Ban tổ chức */}
        <section className="bg-surface border border-border-soft/30 rounded-2xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-2">
            <Icon name="verified" className="text-[#C99A47] text-xl" />
            <h4 className="text-sm font-extrabold uppercase tracking-wider text-content">
              {isEnglish ? 'Organizer Commitment' : 'Cam kết của Ban tổ chức'}
            </h4>
          </div>
          <label className="flex items-start gap-3.5 mt-5 cursor-pointer select-none group">
            <div className="relative flex items-center justify-center shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={Boolean(formData.terms_accepted)}
                onChange={(e) => setFormData((p) => ({ ...p, terms_accepted: e.target.checked }))}
                className="sr-only"
              />
              <div
                className={`size-[19px] rounded-[6px] border transition-all flex items-center justify-center ${
                  formData.terms_accepted
                    ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] border-[#C99A47] shadow-[0_0_8px_rgba(201,154,71,0.5)]'
                    : 'bg-panel-soft/80 border-border-soft/60 group-hover:border-[#C99A47]/60'
                }`}
              >
                {formData.terms_accepted && (
                  <Check className="size-3.5 text-[#0D1B2A] stroke-[3]" />
                )}
              </div>
            </div>
            <div className="text-xs text-content leading-relaxed">
              <strong className="block text-sm mb-1 font-bold text-content">
                {isEnglish ? 'Confirmation of Information & Legal Documents Commitment' : 'Xác nhận cam kết thông tin và hồ sơ pháp lý sự kiện'}
              </strong>
              {isEnglish
                ? 'I certify that all event information, ticket prices, schedules, policies, and attached permits are completely accurate and legally valid. I accept full legal responsibility and agree to comply with EventHub operating terms.'
                : 'Tôi cam đoan toàn bộ thông tin sự kiện, giá vé, lịch trình, chính sách và các giấy phép tổ chức đính kèm là hoàn toàn chính xác, có hiệu lực pháp lý. Tôi chịu hoàn toàn trách nhiệm trước pháp luật và cam kết tuân thủ các quy định hoạt động của EventHub.'}
            </div>
          </label>
        </section>
      </div>

      <aside className="col-span-12 lg:col-span-4 space-y-6 lg:sticky lg:top-20">
        <SetupProgressWidget completeness={completeness} />

        <div className={`bg-surface border border-border-soft/30 ${completeness?.isReady ? 'border-t-success' : 'border-t-warning'} border-t-4 rounded-xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]`}>
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-bold uppercase text-white [html.light_&]:text-[#0D1B2A]">
              {isEnglish ? 'Event Status' : 'Trạng thái sự kiện'}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase border ${completeness?.isReady
                ? 'bg-success/10 text-success border-success/20'
                : (completeness?.percent ?? 0) >= 70
                  ? 'bg-tertiary/10 text-tertiary border-tertiary/20'
                  : 'bg-warning/10 text-warning border-warning/20'
                }`}
            >
              {completeness?.isReady
                ? (isEnglish ? 'Ready' : 'Tuyệt vời')
                : (completeness?.percent ?? 0) >= 70
                  ? (isEnglish ? 'Almost Ready' : 'Gần hoàn thành')
                  : (isEnglish ? 'Incomplete' : 'Chưa hoàn thiện')}
            </span>
          </div>

          {completeness?.isReady ? (
            <div className="p-4 bg-success/10 border border-success/20 rounded-xl mb-6">
              <div className="flex items-center gap-1.5 text-success font-bold text-xs mb-1">
                <Icon name="check_circle" className="text-[16px]" />
                <span>{isEnglish ? 'Event is ready!' : 'Sự kiện đã sẵn sàng!'}</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                {isEnglish
                  ? 'All required information has been filled. You can click "Submit for Review" below to submit to Admin.'
                  : 'Tất cả thông tin bắt buộc đã được điền đầy đủ. Bạn có thể nhấn "Gửi để duyệt" bên dưới để gửi cho Ban quản trị.'}
              </p>
            </div>
          ) : (
            <div className="p-4 bg-warning/10 border border-warning/20 rounded-xl mb-6">
              <div className="flex items-center gap-1.5 text-warning font-bold text-xs mb-1">
                <Icon name="info" className="text-[16px]" />
                <span>
                  {isEnglish
                    ? `${completeness?.missingItems?.length || 0} incomplete item(s):`
                    : `Còn ${completeness?.missingItems?.length || 0} mục chưa hoàn thiện:`}
                </span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                {isEnglish
                  ? 'Please provide the missing details before submitting for approval.'
                  : 'Vui lòng bổ sung các thông tin còn thiếu trước khi gửi sự kiện để phê duyệt.'}
              </p>
            </div>
          )}

          <div className="border-t border-border-soft/30 pt-4 space-y-2.5">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold uppercase text-white [html.light_&]:text-[#0D1B2A]">
                {isEnglish ? 'Checklist' : 'Danh sách kiểm tra'}
              </span>
              <span className="text-xs font-bold text-white [html.light_&]:text-[#0D1B2A]">
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
                    className={`text-[16px] shrink-0 mt-0.5 ${item.completed ? 'text-success' : 'text-error'
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
                    {isEnglish ? `Step ${item.step}` : `Bước ${item.step}`}
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
  const { isEnglish } = useLanguage()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const { eventId: routeEventId } = useParams()
  const [currentStep, setCurrentStep] = useState(1)
  const [maxCompletedStep, setMaxCompletedStep] = useState(1)
  const [eventId, setEventId] = useState(routeEventId || null)
  const [formData, setFormData] = useState(() => {
    const isEn = Boolean(
      (typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en')
    )
    return {
      ...INITIAL_FORM,
      description: isEn ? DEFAULT_EVENT_DESCRIPTION_EN : DEFAULT_EVENT_DESCRIPTION_VI,
    }
  })
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
  const [organizerPlan, setOrganizerPlan] = useState(null)
  const [isAiDocModalOpen, setIsAiDocModalOpen] = useState(false)
  const [aiDraftBanner, setAiDraftBanner] = useState(false)

  const isEditMode = Boolean(routeEventId)

  // Load current subscription plan to enforce plan limits & capabilities
  useEffect(() => {
    fetchCurrentPlan()
      .then((res) => {
        if (res?.active && res?.plan) {
          setOrganizerPlan(res.plan)
        }
      })
      .catch(() => setOrganizerPlan(null))
  }, [])

  useEffect(() => {
    if (location.state?.message) {
      toast.success(location.state.message)
      window.history.replaceState({}, document.title)
    }
    if (location.state?.error) {
      toast.error(location.state.error)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  // Synchronize event description template when language changes, as long as user hasn't customized it yet
  useEffect(() => {
    if (isEditMode) return
    setFormData((prev) => {
      const cur = prev.description || ''
      if (isEnglish && (isDefaultViDescription(cur) || !cur.trim() || cur === '<p><br></p>')) {
        return { ...prev, description: DEFAULT_EVENT_DESCRIPTION_EN }
      }
      if (!isEnglish && (isDefaultEnDescription(cur) || !cur.trim() || cur === '<p><br></p>')) {
        return { ...prev, description: DEFAULT_EVENT_DESCRIPTION_VI }
      }
      return prev
    })
  }, [isEnglish, isEditMode])
  const completeness = useMemo(() => calculateEventCompleteness(formData, isEnglish), [formData, isEnglish])
  const pageTopRef = useRef(null)

  const scrollToTop = useCallback(() => {
    if (pageTopRef.current) {
      pageTopRef.current.scrollIntoView({ behavior: 'auto', block: 'start' })
      const scrollParent = pageTopRef.current.closest('.overflow-y-auto')
      if (scrollParent) {
        scrollParent.scrollTop = 0
      }
    }
    const scrollContainers = document.querySelectorAll('.overflow-y-auto')
    scrollContainers.forEach((el) => {
      if (el.clientHeight > 200) el.scrollTop = 0
    })
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  useEffect(() => {
    scrollToTop()
    const timer = setTimeout(scrollToTop, 60)
    return () => clearTimeout(timer)
  }, [currentStep, scrollToTop])

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
    Promise.all([fetchEventCategories(), fetchOrganizerVenues()])
      .then(([cats, vns]) => {
        setCategories(cats)
        setVenues(vns)


      })
      .catch((err) => {
        console.error(err)
        toast.error('Không thể tải dữ liệu ban đầu. Vui lòng thử lại.')
      })
      .finally(() => {
        if (!routeEventId) setInitialLoading(false)
      })
  }, [routeEventId])

  const populateFromEvent = useCallback((event) => {
    const sessions = (event.sessions || []).map((s) => {
      const start = splitDateTime(s.start_time)
      const end = splitDateTime(s.end_time)
      const checkin = splitDateTime(s.checkin_start_time)
      const dsStart = splitDateTime(s.direct_sale_start_time)
      const dsEnd = splitDateTime(s.direct_sale_end_time)
      const sessionDate = start.date || end.date || ''
      return {
        id: s.id,
        clientKey: s.id,
        session_name: s.session_name,
        start_date: sessionDate,
        start_time: start.time,
        end_date: sessionDate,
        end_time: end.time,
        venue_id: s.venue_id,
        seat_map_id: s.seat_map_id,
        seating_type: s.seat_map_id ? 'ASSIGNED' : 'GENERAL',
        zone_assignments: [],
        disabled_seat_ids: s.disabled_seat_ids || [],
        checkin_start_date: checkin.date || '',
        checkin_start_time: checkin.time || '',
        direct_sale_start_date: dsStart.date || '',
        direct_sale_start_time: dsStart.time || '',
        direct_sale_end_date: dsEnd.date || '',
        direct_sale_end_time: dsEnd.time || '',
      }
    })

    const ticketTypes = (event.ticket_types || []).map((tt) => ({
      id: tt.id,
      clientKey: tt.id,
      session_key: String(tt.event_session_id),
      name: tt.name || '',
      description: tt.description || '',
      price: tt.price !== null && tt.price !== undefined && tt.price !== '' ? Number(tt.price) : '',
      quantity: tt.quantity !== null && tt.quantity !== undefined && tt.quantity !== '' ? Number(tt.quantity) : 1,
      is_seated: Boolean(tt.is_seated),
      zone_id: tt.zone_id || null,
    }))

    setFormData((prev) => {
      const incomingPermits = Array.isArray(event.refund_policy?.permit_files) && event.refund_policy.permit_files.length > 0
        ? event.refund_policy.permit_files
        : (prev.refund_policy?.permit_files || [])
      const incomingPolicyUrl = event.refund_policy?.policy_file_url || prev.refund_policy?.policy_file_url || null
      const incomingPolicyName = event.refund_policy?.policy_file_name || prev.refund_policy?.policy_file_name || null
      const incomingPolicySize = event.refund_policy?.policy_file_size || prev.refund_policy?.policy_file_size || null

      return {
        ...prev,
        title: event.title || prev.title,
        category_id: event.category_id || prev.category_id,
        tags: event.tags || prev.tags,
        format: event.format || prev.format,
        visibility: event.visibility || prev.visibility,
        short_description: event.short_description || prev.short_description,
        description: event.description || prev.description,
        thumbnail_url: event.thumbnail_url || prev.thumbnail_url,
        banner_url: event.banner_url || prev.banner_url,
        sessions,
        ticketTypes,
        seating_rules: {
          require_adjacent_seats: Boolean(event.seating_rules?.require_adjacent_seats ?? prev.seating_rules?.require_adjacent_seats),
          require_same_row: Boolean(event.seating_rules?.require_same_row ?? prev.seating_rules?.require_same_row),
          disallow_single_seat_left: Boolean(event.seating_rules?.disallow_single_seat_left ?? prev.seating_rules?.disallow_single_seat_left),
          max_tickets_per_order: Number.isInteger(Number(event.seating_rules?.max_tickets_per_order)) && Number(event.seating_rules?.max_tickets_per_order) > 0
            ? Number(event.seating_rules.max_tickets_per_order)
            : (prev.seating_rules?.max_tickets_per_order || 10),
        },
        refund_policy: {
          ...prev.refund_policy,
          allow_refund: Boolean(event.refund_policy?.allow_refund ?? event.refund_policy?.allow_refunds ?? prev.refund_policy?.allow_refund),
          allow_refunds: Boolean(event.refund_policy?.allow_refund ?? event.refund_policy?.allow_refunds ?? prev.refund_policy?.allow_refunds),
          refund_rules: Array.isArray(event.refund_policy?.refund_rules) && event.refund_policy.refund_rules.length > 0
            ? event.refund_policy.refund_rules
            : (prev.refund_policy?.refund_rules || [
              { days_before: 7, refund_rate: 100 },
              { days_before: 3, refund_rate: 50 },
            ]),
          refund_notes: event.refund_policy?.refund_notes || prev.refund_policy?.refund_notes || '',
          deadline_days: event.refund_policy?.deadline_days ?? prev.refund_policy?.deadline_days ?? 7,
          permit_files: incomingPermits,
          policy_file_url: incomingPolicyUrl,
          policy_file_name: incomingPolicyName,
          policy_file_size: incomingPolicySize,
        },
        additional_terms: event.additional_terms || prev.additional_terms || '',
        require_attendee_info: event.require_attendee_info !== undefined ? Boolean(event.require_attendee_info) : prev.require_attendee_info,
        terms_accepted: Boolean(event.status && event.status !== 'DRAFT'),
      }
    })
  }, [])

  useEffect(() => {
    if (!routeEventId) return
    setInitialLoading(true)
    fetchOrganizerEvent(routeEventId)
      .then((event) => {
        const ended = isEventEnded(event) || (event.status === 'COMPLETED' && event.approval_status !== 'APPROVED')
        if (ended) {
          toast.error(isEnglish ? 'This event has ended and cannot be edited.' : 'Sự kiện đã kết thúc, không thể chỉnh sửa.')
          navigate(`/organizer/events/${event.id}`)
          return
        }
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
  }, [routeEventId, populateFromEvent, navigate, toast, isEnglish])

  const handleApplyAiDraft = (aiData) => {
    if (!aiData) return

    // Find best matching venue from organizer's venues (do not default to venues[0] if unmatched)
    let defaultVenueId = ''
    if (aiData.venue_id) {
      defaultVenueId = aiData.venue_id
    } else if (venues && venues.length > 0) {
      const vName = (aiData.venue_name || '').trim().toLowerCase()
      if (vName) {
        const matched = venues.find(
          (v) =>
            v.name?.trim().toLowerCase() === vName ||
            v.name?.trim().toLowerCase().includes(vName) ||
            vName.includes(v.name?.trim().toLowerCase())
        )
        if (matched) {
          defaultVenueId = matched.id
        }
      }
    }

    const rawSessions = Array.isArray(aiData.sessions) && aiData.sessions.length > 0
      ? aiData.sessions
      : (aiData.session ? [aiData.session] : [{}])

    const mappedSessions = rawSessions.map((s, idx) => {
      const sKey = newClientKey()
      const sessionDate = s.start_date || ''
      return {
        clientKey: sKey,
        session_name: s.session_name || (rawSessions.length > 1 ? `Phiên ${idx + 1}` : 'Phiên sự kiện'),
        start_date: sessionDate,
        start_time: s.start_time || '',
        end_date: s.end_date || sessionDate,
        end_time: s.end_time || '',
        venue_id: defaultVenueId,
        seat_map_id: aiData.seat_map_id || null,
        seating_type: aiData.seat_map_id ? (aiData.seating_type || 'ASSIGNED_SEATS') : 'GENERAL',
        zone_assignments: [],
        checkin_start_date: s.checkin_start_date || '',
        checkin_start_time: s.checkin_start_time || '',
      }
    })

    const rawTickets = Array.isArray(aiData.ticket_types) && aiData.ticket_types.length > 0
      ? aiData.ticket_types
      : [{ name: 'Vé Tiêu Chuẩn', price: 0, quantity_total: null, description: '' }]

    // Replicate tickets across all sessions so each session satisfies Step 3 validation
    const mappedTicketTypes = []
    mappedSessions.forEach((sess) => {
      rawTickets.forEach((tt) => {
        mappedTicketTypes.push({
          clientKey: newClientKey(),
          session_key: sess.clientKey,
          name: tt.name || 'Vé Tiêu Chuẩn',
          description: tt.description || '',
          price: tt.price !== null && tt.price !== undefined && tt.price !== '' ? Number(tt.price) : 0,
          quantity: (tt.quantity_total !== null && tt.quantity_total !== undefined && Number(tt.quantity_total) > 0) ? Number(tt.quantity_total) : '',
          is_seated: false,
          zone_id: null,
        })
      })
    })

    const isRefundable = Boolean(aiData.refund_policy?.allow_refund ?? aiData.refund_policy?.allow_refunds)

    const incomingPermits = (Array.isArray(aiData.permit_files) && aiData.permit_files.length > 0)
      ? aiData.permit_files
      : (Array.isArray(aiData.refund_policy?.permit_files) && aiData.refund_policy.permit_files.length > 0)
        ? aiData.refund_policy.permit_files
        : []
    const incomingPolicyUrl = aiData.policy_file_url || aiData.refund_policy?.policy_file_url || null
    const incomingPolicyName = aiData.policy_file_name || aiData.refund_policy?.policy_file_name || null
    const incomingPolicySize = aiData.policy_file_size || aiData.refund_policy?.policy_file_size || null

    setFormData((prev) => ({
      ...prev,
      title: aiData.title || prev.title,
      category_id: aiData.category_id || prev.category_id,
      short_description: (aiData.short_description || prev.short_description || '').slice(0, 500),
      description: aiData.description || prev.description,
      additional_terms: aiData.additional_terms || prev.additional_terms,
      tags: Array.isArray(aiData.tags) && aiData.tags.length > 0 ? aiData.tags : prev.tags,
      sessions: mappedSessions.length > 0 ? mappedSessions : prev.sessions,
      ticketTypes: mappedTicketTypes.length > 0 ? mappedTicketTypes : prev.ticketTypes,
      require_attendee_info: aiData.require_attendee_information !== undefined
        ? Boolean(aiData.require_attendee_information)
        : prev.require_attendee_info,
      refund_policy: {
        ...prev.refund_policy,
        allow_refund: isRefundable,
        allow_refunds: isRefundable,
        deadline_days: Number(aiData.refund_policy?.deadline_days) || 7,
        permit_files: incomingPermits.length > 0 ? incomingPermits : (prev.refund_policy?.permit_files || []),
        policy_file_url: incomingPolicyUrl || prev.refund_policy?.policy_file_url || null,
        policy_file_name: incomingPolicyName || prev.refund_policy?.policy_file_name || null,
        policy_file_size: incomingPolicySize || prev.refund_policy?.policy_file_size || null,
      },
    }))

    setAiDraftBanner(true)
    setCurrentStep(1)
    toast.success('Đã áp dụng dữ liệu AI vào bản nháp! Hãy kiểm tra từng bước.')
  }

  const validateStep = (step) => {
    if (step === 1) {
      if (uploadingThumb || uploadingBanner) return 'Vui lòng chờ ảnh thumbnail hoặc ảnh bìa tải lên hoàn tất.'
      if (!formData.title.trim()) return 'Vui lòng nhập tên sự kiện.'
      if (!formData.category_id) return 'Vui lòng chọn danh mục sự kiện.'
      if (!formData.short_description.trim()) return 'Vui lòng nhập mô tả ngắn.'
      const descriptionTextOnly = (formData.description || '').replace(/<[^>]*>/g, '').trim()
      const hasImage = (formData.description || '').includes('<img')
      if (!descriptionTextOnly && !hasImage) return 'Vui lòng nhập mô tả chi tiết sự kiện.'
      if (!formData.thumbnail_url) return 'Vui lòng tải lên ảnh thumbnail.'
      if (!formData.banner_url) return 'Vui lòng tải lên ảnh bìa (banner).'
    }
    if (step === 2) {
      if (!formData.sessions.length) return 'Cần có ít nhất 1 phiên sự kiện.'
      for (let i = 0; i < formData.sessions.length; i++) {
        const s = formData.sessions[i]
        const sName = s.session_name?.trim() || `Phiên ${i + 1}`
        if (!s.start_date || !s.start_time || !s.end_time) {
          return `${sName}: Vui lòng nhập đầy đủ ngày diễn ra, giờ bắt đầu và giờ kết thúc.`
        }
        if (!s.venue_id) return `${sName}: Vui lòng chọn địa điểm tổ chức.`

        const startTime = new Date(`${s.start_date}T${s.start_time}`)
        const endTime = new Date(`${s.start_date}T${s.end_time}`)

        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
          return `${sName}: Thời gian bắt đầu hoặc kết thúc không hợp lệ.`
        }

        const isDraftOrNew = !routeEventId || ['DRAFT', 'HIDDEN'].includes(eventStatus)
        if (isDraftOrNew && startTime.getTime() < Date.now()) {
          return `${sName}: Thời gian bắt đầu sự kiện không thể ở trong quá khứ.`
        }
        if (endTime <= startTime) {
          return `${sName}: Giờ kết thúc (${s.end_time}) phải diễn ra sau giờ bắt đầu (${s.start_time}).`
        }

        if (s.checkin_start_time) {
          const cDate = s.checkin_start_date || s.start_date
          const checkinTime = new Date(`${cDate}T${s.checkin_start_time}`)
          if (isNaN(checkinTime.getTime())) {
            return `${sName}: Thời gian check-in không hợp lệ.`
          }
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const checkinDateOnly = new Date(`${cDate}T00:00:00`)
          const sessionDateOnly = new Date(`${s.start_date}T00:00:00`)

          if (checkinDateOnly < today) {
            return `${sName}: Ngày check-in không được ở trong quá khứ.`
          }
          if (checkinDateOnly > sessionDateOnly) {
            return `${sName}: Ngày check-in không được sau ngày diễn ra sự kiện (${s.start_date}).`
          }
          if (checkinTime > startTime) {
            return `${sName}: Thời gian check-in (${s.checkin_start_time} ngày ${cDate}) phải trước hoặc bằng giờ bắt đầu sự kiện (${s.start_time} ngày ${s.start_date}).`
          }
        }

        if (s.direct_sale_start_time || s.direct_sale_start_date || s.direct_sale_end_time || s.direct_sale_end_date) {
          if ((s.direct_sale_start_time && !s.direct_sale_start_date) || (!s.direct_sale_start_time && s.direct_sale_start_date)) {
            return `${sName}: Vui lòng nhập đầy đủ cả ngày và giờ bắt đầu bán vé trực tiếp.`
          }
          if ((s.direct_sale_end_time && !s.direct_sale_end_date) || (!s.direct_sale_end_time && s.direct_sale_end_date)) {
            return `${sName}: Vui lòng nhập đầy đủ cả ngày và giờ kết thúc bán vé trực tiếp.`
          }

          let dsStartTime = null
          let dsEndTime = null

          if (s.direct_sale_start_date && s.direct_sale_start_time) {
            dsStartTime = new Date(`${s.direct_sale_start_date}T${s.direct_sale_start_time}`)
            if (isNaN(dsStartTime.getTime())) {
              return `${sName}: Thời gian bắt đầu bán vé trực tiếp không hợp lệ.`
            }
          }

          if (s.direct_sale_end_date && s.direct_sale_end_time) {
            dsEndTime = new Date(`${s.direct_sale_end_date}T${s.direct_sale_end_time}`)
            if (isNaN(dsEndTime.getTime())) {
              return `${sName}: Thời gian kết thúc bán vé trực tiếp không hợp lệ.`
            }
          }

          if (dsStartTime && dsEndTime && dsEndTime <= dsStartTime) {
            return `${sName}: Thời gian kết thúc bán vé trực tiếp phải diễn ra sau thời gian bắt đầu.`
          }
        }
      }

      // Check session overlap
      if (formData.sessions.length > 1) {
        for (let i = 0; i < formData.sessions.length; i++) {
          const sA = formData.sessions[i]
          if (!sA.start_date || !sA.start_time || !sA.end_time) continue
          const startA = new Date(`${sA.start_date}T${sA.start_time}`).getTime()
          const endA = new Date(`${sA.start_date}T${sA.end_time}`).getTime()

          for (let j = i + 1; j < formData.sessions.length; j++) {
            const sB = formData.sessions[j]
            if (!sB.start_date || !sB.start_time || !sB.end_time) continue
            const startB = new Date(`${sB.start_date}T${sB.start_time}`).getTime()
            const endB = new Date(`${sB.start_date}T${sB.end_time}`).getTime()

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
      if (!formData.sessions.length) return isEnglish ? 'At least 1 event session is required in Step 2.' : 'Cần có ít nhất 1 phiên sự kiện ở Bước 2.'
      for (let i = 0; i < formData.sessions.length; i++) {
        const s = formData.sessions[i]
        const key = s.id || s.clientKey
        const sName = s.session_name?.trim() || (isEnglish ? `Session ${i + 1}` : `Phiên ${i + 1}`)
        const seatingType = s.seating_type || 'GENERAL'
        if (seatingType === 'ASSIGNED') {
          if (!s.seat_map_id) {
            return isEnglish ? `${sName} is set to assigned seating but no seat map is selected.` : `${sName} được thiết lập có chỗ ngồi nhưng chưa chọn sơ đồ ghế.`
          }
        }
        const tickets = formData.ticketTypes.filter((tt) => String(tt.session_key) === String(key))
        if (!tickets.length) return isEnglish ? `${sName} requires at least 1 ticket tier.` : `${sName} cần ít nhất 1 loại vé.`
        for (const tt of tickets) {
          const tierLabel = tt.name || (isEnglish ? 'ticket tier' : 'loại vé')
          if (!tt.name?.trim()) return isEnglish ? `${sName}: Ticket tier name cannot be empty.` : `${sName}: Tên loại vé không được để trống.`
          if (tt.price === '' || tt.price === null || tt.price === undefined || isNaN(Number(tt.price))) {
            return isEnglish ? `${sName}: Price for "${tierLabel}" cannot be empty.` : `${sName}: Giá vé "${tierLabel}" không được để trống.`
          }
          if (Number(tt.price) < 0) return isEnglish ? `${sName}: Price for "${tierLabel}" must be >= 0.` : `${sName}: Giá vé "${tierLabel}" phải >= 0.`
          if (!tt.quantity || isNaN(Number(tt.quantity)) || Number(tt.quantity) <= 0) {
            return isEnglish ? `${sName}: Quantity for "${tierLabel}" must be > 0.` : `${sName}: Số lượng vé "${tierLabel}" phải > 0.`
          }
        }
      }
    }
    if (step === 4) {
      if (formData.refund_policy?.allow_refund) {
        const validation = validateRefundRules(formData.refund_policy.refund_rules)
        if (!validation.valid) {
          return validation.error || (isEnglish ? 'Invalid refund rules.' : 'Quy tắc hoàn vé không hợp lệ.')
        }
      }
      const permitFiles = formData.refund_policy?.permit_files || []
      if (!permitFiles.length) {
        return isEnglish ? 'Please upload at least 1 permit or related document in Step 4.' : 'Vui lòng tải lên ít nhất 1 giấy phép tổ chức hoặc giấy tờ liên quan ở Bước 4.'
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
      end_time: combineDateTime(s.start_date, s.end_time),
      venue_id: s.venue_id,
      seat_map_id: s.seating_type === 'ASSIGNED' ? s.seat_map_id : null,
      checkin_start_time: (s.checkin_start_time && (s.checkin_start_date || s.start_date)) ? combineDateTime(s.checkin_start_date || s.start_date, s.checkin_start_time) : null,
      direct_sale_start_time: (s.direct_sale_start_time && (s.direct_sale_start_date || s.start_date)) ? combineDateTime(s.direct_sale_start_date || s.start_date, s.direct_sale_start_time) : null,
      direct_sale_end_time: (s.direct_sale_end_time && (s.direct_sale_end_date || s.end_date || s.start_date)) ? combineDateTime(s.direct_sale_end_date || s.end_date || s.start_date, s.direct_sale_end_time) : null,
    }))

  const buildTicketTypesPayload = () => {
    const sessionIdMap = new Map()
    formData.sessions.forEach((s) => {
      if (s.id) {
        sessionIdMap.set(String(s.id), s.id)
      }
      if (s.clientKey) {
        sessionIdMap.set(String(s.clientKey), s.id)
      }
    })
    return formData.ticketTypes
      .map((tt) => {
        const sKeyStr = String(tt.session_key)
        const resolvedSessionId =
          sessionIdMap.get(sKeyStr) ||
          formData.sessions.find(
            (s) => String(s.id) === sKeyStr || String(s.clientKey) === sKeyStr,
          )?.id ||
          tt.session_key

        return {
          id: tt.id || undefined,
          event_session_id: resolvedSessionId,
          name: tt.name ? tt.name.trim() : '',
          description: tt.description ? tt.description.trim() : null,
          price: tt.price === '' || tt.price === null || tt.price === undefined ? 0 : Number(tt.price),
          quantity: tt.quantity === '' || tt.quantity === null || tt.quantity === undefined ? 1 : Number(tt.quantity),
          is_seated: Boolean(tt.is_seated),
        }
      })
      .filter(
        (tt) =>
          Boolean(tt.name) &&
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
    if (!eventId) return
    try {
      const refreshed = await fetchOrganizerEvent(eventId)
      for (const s of formData.sessions) {
        if (s.seating_type !== 'ASSIGNED' || !s.seat_map_id) continue
        const refreshedSession = refreshed.sessions?.find((rs) => String(rs.id) === String(s.id))
        if (!refreshedSession) continue
        const oldTickets = formData.ticketTypes.filter(
          (tt) => String(tt.session_key) === String(s.id) && tt.zone_id,
        )
        const savedTickets = (refreshed.ticket_types || []).filter(
          (tt) => String(tt.event_session_id) === String(refreshedSession.id),
        )
        const assignments = oldTickets
          .map((ot) => {
            const saved = savedTickets.find((st) => st.name?.trim().toLowerCase() === ot.name?.trim().toLowerCase())
            return saved ? { zone_id: ot.zone_id, ticket_type_id: saved.id } : null
          })
          .filter(Boolean)
        if (assignments.length || (s.disabled_seat_ids && s.disabled_seat_ids.length > 0)) {
          await assignZones(eventId, refreshedSession.id, {
            assignments,
            disabled_seat_ids: s.disabled_seat_ids || [],
          })
        }
      }
    } catch (err) {
      console.warn('[CreateEventPage syncZoneAssignments warning]:', err)
    }
  }

  const saveTicketsQuietly = async () => {
    if (!eventId) return
    try {
      const sessionsPayload = buildSessionsPayload()
      const ticketTypesPayload = buildTicketTypesPayload()
      if (ticketTypesPayload.length > 0) {
        await updateOrganizerEvent(eventId, {
          sessions: sessionsPayload,
          ticket_types: ticketTypesPayload,
          seating_rules: formData.seating_rules,
        })
        await syncZoneAssignments()
      }
    } catch (err) {
      console.warn('[CreateEventPage auto-save tickets warning]:', err)
    }
  }

  const handleSaveDraft = async () => {
    if (!formData.title?.trim()) {
      toast.error('Vui lòng nhập ít nhất tên sự kiện để lưu bản nháp.')
      return
    }
    setLoading(true)
    setError('')
    try {
      let currentEventId = eventId
      if (!currentEventId) {
        const created = await createOrganizerEvent({
          title: formData.title,
          category_id: formData.category_id || undefined,
          tags: formData.tags,
          format: formData.format,
          visibility: formData.visibility,
          short_description: formData.short_description,
          description: formData.description,
          thumbnail_url: formData.thumbnail_url,
          banner_url: formData.banner_url,
        })
        currentEventId = created.id
        setEventId(created.id)
      }

      const payload = {
        title: formData.title,
        category_id: formData.category_id || undefined,
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
      }

      if (formData.sessions.length > 0) {
        payload.sessions = buildSessionsPayload()
      }

      const ticketPayload = buildTicketTypesPayload()
      if (ticketPayload.length > 0) {
        payload.ticket_types = ticketPayload
      }

      await updateOrganizerEvent(currentEventId, payload)
      if (ticketPayload.length > 0) {
        await syncZoneAssignments()
      }
      toast.success('Đã lưu bản nháp sự kiện thành công!')
    } catch (err) {
      console.error('[CreateEventPage handleSaveDraft Error]:', err)
      toast.error(getApiMessage(err, 'Không thể lưu bản nháp.'))
    } finally {
      setLoading(false)
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

    // Khi chỉnh sửa sự kiện đã công khai/đã duyệt, các bước chuyển trang không tự ý gọi API lưu cục bộ
    // để tránh kích hoạt tạo Revision sớm trên backend. Toàn bộ thay đổi sẽ được gửi một lần khi bấm 'Lưu lại' ở bước cuối.
    if (isEditMode && eventStatus !== 'DRAFT') {
      const next = Math.min(currentStep + 1, 5)
      setCurrentStep(next)
      setMaxCompletedStep((prev) => Math.max(prev, next))
      return
    }

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
          refund_policy: formData.refund_policy,
          additional_terms: formData.additional_terms,
          require_attendee_info: formData.require_attendee_info,
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
          const checkin = splitDateTime(s.checkin_start_time)
          const dsStart = splitDateTime(s.direct_sale_start_time)
          const dsEnd = splitDateTime(s.direct_sale_end_time)
          const old = formData.sessions.find(
            (os) => (os.id && String(os.id) === String(s.id)) || (os.session_name === s.session_name && String(os.venue_id) === String(s.venue_id)),
          ) || formData.sessions[idx]
          return {
            id: s.id,
            clientKey: s.id,
            session_name: s.session_name,
            start_date: start.date,
            start_time: start.time,
            end_date: start.date,
            end_time: end.time,
            venue_id: s.venue_id,
            seat_map_id: s.seat_map_id,
            seating_type: old?.seating_type || (s.seat_map_id ? 'ASSIGNED' : 'GENERAL'),
            zone_assignments: old?.zone_assignments || [],
            checkin_start_date: checkin.date || old?.checkin_start_date || '',
            checkin_start_time: checkin.time || old?.checkin_start_time || '',
            direct_sale_start_date: dsStart.date || old?.direct_sale_start_date || '',
            direct_sale_start_time: dsStart.time || old?.direct_sale_start_time || '',
            direct_sale_end_date: dsEnd.date || old?.direct_sale_end_date || '',
            direct_sale_end_time: dsEnd.time || old?.direct_sale_end_time || '',
          }
        })
        setFormData((p) => {
          const sessionKeyMap = new Map()
          p.sessions.forEach((oldS, idx) => {
            const newS = sessions.find(
              (ns) => (oldS.id && String(ns.id) === String(oldS.id)) || (oldS.session_name === ns.session_name && String(oldS.venue_id) === String(ns.venue_id)),
            ) || sessions[idx]
            if (newS?.id) {
              if (oldS.id) sessionKeyMap.set(String(oldS.id), String(newS.id))
              if (oldS.clientKey) sessionKeyMap.set(String(oldS.clientKey), String(newS.id))
            }
          })
          const ticketTypes = p.ticketTypes.map((tt) => {
            const newSessionId = sessionKeyMap.get(String(tt.session_key))
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
          refund_policy: formData.refund_policy,
          additional_terms: formData.additional_terms,
          require_attendee_info: formData.require_attendee_info,
        })
        await updateOrganizerEvent(eventId, {
          sessions: sessionsPayload,
          ticket_types: ticketTypesPayload,
          seating_rules: formData.seating_rules,
          refund_policy: formData.refund_policy,
          additional_terms: formData.additional_terms,
          require_attendee_info: formData.require_attendee_info,
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
      const updateResult = await updateOrganizerEvent(eventId, {
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
        version: formData.version,
      })
      await syncZoneAssignments()
      if (updateResult?.pending_revision) {
        navigate('/organizer/events', {
          state: { message: 'Các thay đổi quan trọng đã được lưu thành Bản sửa đổi chờ Quản trị viên duyệt.' },
        })
      } else {
        navigate('/organizer/events', {
          state: { message: 'Đã cập nhật sự kiện thành công.' },
        })
      }
    } catch (err) {
      console.error('[CreateEventPage handleUpdateEvent Error]:', err)
      if (err?.response?.data?.code === 'EVENT_VERSION_CONFLICT') {
        toast.error('Dữ liệu sự kiện đã thay đổi bởi phiên khác. Vui lòng làm mới trang trước khi cập nhật.')
      } else if (err?.response?.data?.code === 'CRITICAL_CHANGE_REQUIRED') {
        toast.error('Thay đổi quan trọng (thay đổi hình thức sự kiện hoặc phiên diễn có vé đã bán) bị từ chối.')
      } else if (err?.response?.data?.code === 'QUOTA_BELOW_COMMITTED') {
        toast.error('Không thể giảm số lượng vé thấp hơn tổng số vé đã thanh toán.')
      } else {
        toast.error(getApiMessage(err, 'Không thể cập nhật sự kiện.'))
      }
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

    // Business Rule: Thời điểm nộp duyệt sự kiện phải cách thời điểm bắt đầu sự kiện tối thiểu 72 giờ (3 ngày) đồng bộ backend
    const validSessionStarts = (formData.sessions || [])
      .map((s) => new Date(`${s.start_date}T${s.start_time}`).getTime())
      .filter((time) => !Number.isNaN(time))

    if (validSessionStarts.length > 0) {
      const earliestStart = Math.min(...validSessionStarts)
      const leadTimeMs = earliestStart - Date.now()
      const requiredLeadTimeMs = 72 * 60 * 60 * 1000 // 72 giờ (3 ngày) đồng bộ với backend

      if (leadTimeMs < requiredLeadTimeMs) {
        const hoursLeft = Math.max(0, Math.round((leadTimeMs / (60 * 60 * 1000)) * 10) / 10)
        const leadMsg = `Sự kiện phải được nộp duyệt trước thời điểm bắt đầu tối thiểu 72 giờ (hiện tại còn ${hoursLeft} giờ). Vui lòng quay lại Bước 2 để điều chỉnh lịch trình sự kiện.`
        setError(leadMsg)
        toast.error(leadMsg)
        setCurrentStep(2)
        return
      }
    }

    setLoading(true)
    setError('')
    setPaymentSetupRequired(false)
    setSubscriptionRequired(false)
    let targetEventId = eventId

    try {
      const eventPayload = {
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
      }

      if (targetEventId) {
        await updateOrganizerEvent(targetEventId, eventPayload)
        await syncZoneAssignments()
      } else {
        const created = await createOrganizerEvent(eventPayload)
        targetEventId = created.id
        setEventId(created.id)
        if (eventPayload.ticket_types?.length > 0) {
          await syncZoneAssignments()
        }
      }

      // 1. Kiểm tra cấu hình thanh toán PayOS nếu sự kiện có vé thu phí
      const hasPaidTickets = (formData.ticketTypes || []).some((tt) => Number(tt.price) > 0)
      if (hasPaidTickets) {
        const channel = await fetchOrganizerPaymentChannel().catch(() => null)
        if (!channel || channel.status !== 'ACTIVE') {
          toast.error('Bạn cần cài đặt và kích hoạt kênh thanh toán PayOS trước khi gửi duyệt sự kiện có bán vé.')
          navigate('/organizer/settings/payment', {
            state: {
              returnTo: targetEventId ? `/organizer/events/${targetEventId}/edit` : '/organizer/events/create',
              error: 'Vui lòng hoàn tất thiết lập kênh thanh toán PayOS trước khi gửi duyệt sự kiện có bán vé.',
            },
          })
          return
        }
      }

      // 2. Kiểm tra gói dịch vụ (Subscription) của Organizer trước khi gửi duyệt
      const planRes = await fetchCurrentPlan().catch(() => null)
      const hasActivePlan = Boolean(planRes?.active && planRes?.plan)
      if (!hasActivePlan) {
        setSubscriptionRequired(true)
        toast.error('Tài khoản của bạn chưa đăng ký gói dịch vụ. Đang chuyển hướng sang trang mua gói...')
        navigate('/organizer/subscriptions', {
          state: {
            returnTo: targetEventId ? `/organizer/events/${targetEventId}/edit` : '/organizer/events/create',
            message: 'Tài khoản chưa có gói dịch vụ hoạt động. Vui lòng mua hoặc kích hoạt gói dịch vụ để có thể gửi duyệt sự kiện.',
          },
        })
        return
      }

      // 3. Tiến hành gửi duyệt sự kiện
      await submitOrganizerEvent(targetEventId)
      navigate('/organizer/events', {
        state: { message: 'Đã gửi sự kiện để duyệt thành công.' },
      })
    } catch (err) {
      console.error('[CreateEventPage handleSubmit Error]:', err)
      if (err?.response?.data) {
        console.error('[CreateEventPage handleSubmit] Backend Response:', JSON.stringify(err.response.data, null, 2))
      }
      const errorCode = err.response?.data?.errorCode
      const errorMessage = err.response?.data?.message || ''

      if (errorCode === 'PAYOS_NOT_CONFIGURED') {
        setPaymentSetupRequired(true)
        navigate('/organizer/settings/payment', {
          state: {
            returnTo: targetEventId ? `/organizer/events/${targetEventId}/edit` : '/organizer/events/create',
            error: errorMessage || 'Vui lòng hoàn tất thiết lập thanh toán trước khi gửi duyệt sự kiện có phí.',
          },
        })
        return
      }

      if (
        errorCode === 'SUBSCRIPTION_REQUIRED' ||
        errorCode === 'STAFF_SUBSCRIPTION_REQUIRED' ||
        errorMessage.includes('gói dịch vụ') ||
        errorMessage.includes('mua hoặc gia hạn gói') ||
        errorMessage.includes('nâng cấp gói') ||
        errorMessage.includes('vượt giới hạn')
      ) {
        setSubscriptionRequired(true)
        toast.error(errorMessage || 'Tài khoản chưa có gói dịch vụ phù hợp với quy mô sự kiện. Đang chuyển hướng sang trang gói dịch vụ...')
        navigate('/organizer/subscriptions', {
          state: {
            returnTo: targetEventId ? `/organizer/events/${targetEventId}/edit` : '/organizer/events/create',
            error: errorMessage || 'Tài khoản chưa có gói dịch vụ phù hợp. Vui lòng nâng cấp gói để gửi duyệt sự kiện.',
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
    if (currentStep === 3) {
      saveTicketsQuietly()
    }
    setCurrentStep((s) => Math.max(1, s - 1))
  }

  const handleStepClick = (targetStep) => {
    if (targetStep === currentStep) return
    if (currentStep === 3) {
      saveTicketsQuietly()
    }
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
      if (isEnglish) return isEditMode ? 'Next: Review & Update' : 'Next: Review & Submit'
      return isEditMode ? 'Tiếp: Xem lại & cập nhật' : 'Tiếp theo: Xem lại & Gửi duyệt'
    }
    if (currentStep === 3) return isEnglish ? 'Next: Policies & Settings' : 'Tiếp theo: Chính sách & Thiết lập'
    if (currentStep === 2) return isEnglish ? 'Next: Tickets & Seating' : 'Tiếp theo: Vé & Sơ đồ ghế'
    return isEnglish ? 'Next' : 'Tiếp theo'
  }, [currentStep, isEditMode, isEnglish])

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-4 border-tertiary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div ref={pageTopRef} className="pb-20 max-w-6xl mx-auto create-event-page">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-content">
            {isEditMode ? 'Chỉnh sửa sự kiện' : 'Tạo sự kiện'}
          </h1>
        </div>
        {!isEditMode && (
          <button
            type="button"
            onClick={() => {
              if (organizerPlan && !organizerPlan.ai_event_creation_enabled) {
                toast.error('Gói dịch vụ hiện tại không hỗ trợ tính năng Tạo sự kiện bằng AI. Vui lòng nâng cấp gói để sử dụng.')
                navigate('/organizer/subscriptions', {
                  state: {
                    returnTo: '/organizer/events/create',
                    message: 'Tính năng Tạo sự kiện bằng AI yêu cầu gói Chuyên Nghiệp hoặc Doanh Nghiệp. Vui lòng nâng cấp gói dịch vụ.',
                  },
                })
                return
              }
              setIsAiDocModalOpen(true)
            }}
            className="ai-led-btn"
            title={organizerPlan && !organizerPlan.ai_event_creation_enabled ? 'Cần nâng cấp gói để tạo sự kiện bằng AI' : 'Tự động tạo bằng AI'}
          >
            <svg
              className="ai-led-svg"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect className="ai-led-track" />
              <rect className="ai-led-beam-glow" pathLength="100" />
              <rect className="ai-led-beam-core" pathLength="100" />
            </svg>
            <span className="ai-led-content flex items-center gap-1.5">
              {organizerPlan && !organizerPlan.ai_event_creation_enabled && (
                <Lock className="size-3.5 text-amber-300" />
              )}
              Tự động tạo bằng AI (Tài liệu / Kế hoạch)
            </span>
          </button>
        )}
      </div>

      {/* ── Phần 1: Thanh theo dõi từng bước (Bỏ khung bọc) ── */}
      <div className="w-full mb-8">
        <WizardStepper
          currentStep={currentStep}
          maxCompletedStep={maxCompletedStep}
          onStepClick={handleStepClick}
        />
      </div>

      {/* ── Phần 2: Nội dung điền (Bỏ khung bọc) ── */}
      <div className="w-full create-event-content">
        {aiDraftBanner && (
          <div className="mb-6 p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 flex items-start justify-between gap-3 text-sm text-indigo-200 animate-in fade-in">
            <div className="flex items-start gap-3">
              <Sparkles className="size-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">Bản nháp đã được AI điền tự động từ tài liệu!</p>
                <p className="text-xs text-indigo-300 mt-0.5">
                  Vui lòng rà soát lại thông tin qua các bước, tải lên ảnh poster/banner, giấy phép tổ chức và tùy chỉnh theo ý muốn trước khi nộp duyệt.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAiDraftBanner(false)}
              className="text-indigo-400 hover:text-white p-1 rounded-lg"
            >
              <Icon name="close" className="text-sm" />
            </button>
          </div>
        )}

        
        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/40 bg-red-500/10 flex items-start justify-between gap-3 text-sm text-red-200 animate-in fade-in">
            <div className="flex items-start gap-3">
              <Icon name="error_outline" className="text-red-400 text-xl shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-white">Chưa thể gửi duyệt sự kiện</p>
                <p className="text-xs text-red-200 mt-0.5 leading-relaxed">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setError('')}
              className="text-red-400 hover:text-white p-1 rounded-lg cursor-pointer"
            >
              <Icon name="close" className="text-sm" />
            </button>
          </div>
        )}

        <fieldset>
          {currentStep === 1 && (
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
              isEditMode={isEditMode}
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
              organizerPlan={organizerPlan}
              isEditMode={isEditMode}
              eventId={routeEventId}
            />
          )}
          {currentStep === 4 && (
            <Step4PoliciesSettings
              formData={formData}
              setFormData={setFormData}
              completeness={completeness}
              editPermissions={editPermissions}
            />
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

      {/* ── Phần 3: Các button (Bỏ khung bọc) ── */}
      <div className="w-full flex flex-wrap items-center justify-between gap-4 pt-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/organizer/events')}
            className="px-6 py-2.5 rounded-full border border-white/20 bg-[#101c30] text-slate-200 text-sm font-semibold hover:bg-error/15 hover:border-error/50 hover:text-error shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all cursor-pointer [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:text-[#0D1B2A] [html.light_&]:shadow-sm"
          >
            {isEnglish ? 'Cancel' : 'Hủy'}
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={loading || editPermissions?.is_time_locked}
            className="px-6 py-2.5 rounded-full border border-white/20 bg-[#101c30] text-white text-sm font-semibold hover:bg-[#182b4a] hover:border-[#C99A47]/60 shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:text-[#0D1B2A] [html.light_&]:shadow-sm [html.light_&]:hover:bg-[#F8F3EA]"
          >
            <Icon name="save" className="text-[18px] text-[#C99A47]" />
            <span>{isEnglish ? 'Save Draft' : 'Lưu bản nháp'}</span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={loading}
              className="px-6 py-2.5 rounded-full border border-white/20 bg-[#101c30] text-white text-sm font-semibold hover:bg-[#182b4a] hover:border-white/40 shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:text-[#0D1B2A] [html.light_&]:shadow-sm [html.light_&]:hover:bg-[#F8F3EA]"
            >
              <Icon name="arrow_back" className="text-[18px]" />
              <span>{isEnglish ? 'Back' : 'Quay lại'}</span>
            </button>
          )}
          {currentStep < 5 && (
            <button
              type="button"
              onClick={handleNext}
              disabled={loading}
              className="org-btn-primary px-8 py-2.5 text-sm font-bold shadow-md disabled:opacity-50 transition cursor-pointer"
            >
              {loading ? (isEnglish ? 'Saving...' : 'Đang lưu...') : (currentStep === 4 ? (isEnglish ? 'Next' : 'Tiếp theo') : nextLabel)}
              {!loading && <Icon name="arrow_forward" className="text-[18px]" />}
            </button>
          )}

          {isEditMode && currentStep === 5 && (
            <button
              type="button"
              onClick={handleUpdateEvent}
              disabled={loading || !isValidAllSteps()}
              title={!isValidAllSteps() ? (isEnglish ? 'Event information is incomplete or invalid' : 'Thông tin sự kiện còn thiếu hoặc không hợp lệ') : ''}
              className="org-btn-primary px-8 py-2.5 text-sm font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition ml-2 cursor-pointer"
            >
              {loading ? (isEnglish ? 'Saving...' : 'Đang lưu...') : (isEnglish ? 'Save' : 'Lưu lại')}
            </button>
          )}

          {currentStep === 5 && (!isEditMode ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !completeness.isReady}
              title={!completeness.isReady ? (isEnglish ? `${completeness.missingItems.length} items remaining (${completeness.percent}% completed)` : `Còn ${completeness.missingItems.length} mục chưa hoàn tất (Độ hoàn thiện ${completeness.percent}%)`) : ''}
              className="btn-led-submit ml-2"
            >
              <svg className="btn-led-submit-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                <rect className="btn-led-submit-track" />
                <rect className="btn-led-submit-beam-glow" pathLength="100" />
                <rect className="btn-led-submit-beam-core" pathLength="100" />
              </svg>
              <span className="btn-led-submit-content">
                {loading ? (isEnglish ? 'Submitting...' : 'Đang gửi...') : (isEnglish ? 'Submit for Review' : 'Gửi để duyệt')}
              </span>
            </button>
          ) : (isEditMode && ['DRAFT', 'HIDDEN'].includes(eventStatus)) ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !completeness.isReady}
              title={!completeness.isReady ? (isEnglish ? `${completeness.missingItems.length} items remaining (${completeness.percent}% completed)` : `Còn ${completeness.missingItems.length} mục chưa hoàn tất (Độ hoàn thiện ${completeness.percent}%)`) : ''}
              className="btn-led-submit ml-2"
            >
              <svg className="btn-led-submit-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                <rect className="btn-led-submit-track" />
                <rect className="btn-led-submit-beam-glow" pathLength="100" />
                <rect className="btn-led-submit-beam-core" pathLength="100" />
              </svg>
              <span className="btn-led-submit-content">
                {loading ? (isEnglish ? 'Processing...' : 'Đang xử lý...') : (isEnglish ? 'Submit for Review' : 'Gửi duyệt')}
              </span>
            </button>
          ) : null)}
        </div>
      </div>

      <AiDocumentExtractorModal
        isOpen={isAiDocModalOpen}
        onClose={() => setIsAiDocModalOpen(false)}
        onApply={handleApplyAiDraft}
        venues={venues}
        onVenuesUpdated={async () => {
          try {
            const vns = await fetchOrganizerVenues()
            setVenues(vns || [])
          } catch (e) {
            console.error('Failed to refresh organizer venues:', e)
          }
        }}
      />
    </div>
  )
}
