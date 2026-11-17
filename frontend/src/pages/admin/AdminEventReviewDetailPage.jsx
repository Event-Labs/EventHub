import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Calendar,
  CalendarX,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Tag,
  Video,
  Info,
  Ban,
  ShieldAlert,
  FileText,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  FileCheck,
  Image as ImageIcon,
  Type,
  SpellCheck,
  AlertCircle,
  Check,
  X,
  Eye,
  EyeOff,
  Download,
  Bot,
  Copy,
  Loader2,
  Square,
  LayoutGrid,
  Table,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Ticket,
  Plus,
} from 'lucide-react'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'

import {
  fetchAdminEventDetail,
  reviewAdminEvent,
  fetchAdminAiReview,
  runAdminAiReview,
  cancelAdminAutoReview,
  fetchAdminAutoReviewScanStatus,
  fetchDocumentPreviewBlob,
  extractDocumentText,
  suspendAdminEvent,
  unsuspendAdminEvent,
  approveCancellationRequest,
  initiateForceCancel,
  confirmForceCancel,
  reviewAdminEventRevision,
} from '@/services/adminEvents.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { translatePhrase } from '@/i18n/phraseDictionary.js'
import { cleanAndFormatVenue, translateEventHtmlDescription } from '@/i18n/eventTranslations.js'
import { Page, Panel, Badge, StatusBadge, ImagePlaceholder } from './AdminComponents.jsx'
import { AdminReviewCriteriaModal } from './AdminReviewCriteriaModal.jsx'
import { AdminSuspendModal } from './AdminSuspendModal.jsx'
import { AdminEventCancellationDetailPage } from './AdminEventCancellationDetailPage.jsx'

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------
function formatFileSize(bytes) {
  if (!bytes || Number.isNaN(Number(bytes))) return ''
  const b = Number(bytes)
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function resolvePermit(permit, idx) {
  if (!permit) return null
  if (typeof permit === 'string') {
    const cleanUrl = permit.trim()
    const fileName = cleanUrl.split('/').pop()?.split('?')[0] || `Tài liệu #${idx + 1}`
    const isPdf = cleanUrl.toLowerCase().includes('.pdf')
    const isImg = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(cleanUrl)
    return {
      id: `doc-${idx}`,
      name: decodeURIComponent(fileName),
      url: cleanUrl,
      size: null,
      type: isPdf ? 'application/pdf' : isImg ? 'image/jpeg' : 'document',
    }
  }

  const url = permit?.url || permit?.file_url || permit?.secure_url || permit?.link || ''
  const rawName = permit?.name || permit?.file_name || permit?.filename || permit?.title
  const fileName = rawName || (url ? decodeURIComponent(url.split('/').pop()?.split('?')[0]) : `Giấy phép #${idx + 1}`)
  const type = permit?.type || permit?.mime_type || ''
  const isPdf = type.includes('pdf') || fileName.toLowerCase().endsWith('.pdf') || url.toLowerCase().includes('.pdf')
  const isImg = type.includes('image') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(fileName) || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(url)

  return {
    id: permit?.id || `permit-${idx}`,
    name: fileName,
    url,
    size: permit?.size || permit?.file_size || null,
    type: isPdf ? 'application/pdf' : isImg ? 'image/jpeg' : (type || 'document'),
    uploaded_at: permit?.uploaded_at || null,
  }
}

function formatShortDate(value) {
  if (!value) return ''
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return ''
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${hours}:${minutes} ${day}/${month}`
  } catch (_e) {
    return ''
  }
}

const getAutoLocale = () =>
  ((typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en'))
    ? 'en-US'
    : 'vi-VN'

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(getAutoLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------
// AI Review Sub-components (3 Core Colors: Green / Amber / Red on Neutral Slate)
// ---------------------------------------------------------------------------
// Enterprise AI Review Sub-Components (Modern Dark SaaS System)
// Design Tokens:
// Background: #081126 | Surface: #101D32 | Card: #1A2940 | Border: #263751
// Gold: #E8B85D | Critical: #FF4569 | Success: #10B981 | Warning: #F59E0B | Info: #60A5FA | AI: #A78BFA
// ---------------------------------------------------------------------------

function AiExecutiveSummaryCard({ aiData }) {
  const { isEnglish } = useLanguage()
  if (!aiData) return null

  const {
    recommendation,
    summary,
    quality_score = 85,
    risk_score = 10,
    critical_violations = [],
    warnings = [],
  } = aiData
  const criticalCount = critical_violations.length
  const warningCount = warnings.length

  const getStatusConfig = () => {
    if (recommendation === 'APPROVE') {
      return {
        badgeBg: 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30',
        badgeText: isEnglish ? 'AI RECOMMENDATION: APPROVE' : 'Khuyến nghị AI: Phê duyệt',
        title: isEnglish ? 'Eligible for approval' : 'Đủ điều kiện phê duyệt',
        icon: CheckCircle2,
        iconColor: 'text-[#10B981]',
        iconBg: 'bg-[#10B981]/15 border-[#10B981]/30',
        defaultSummary: isEnglish
          ? 'Event complies with core platform policies and terms.'
          : 'Sự kiện tuân thủ các quy định và điều khoản cốt lõi của EventHub.',
      }
    }
    if (recommendation === 'REJECT') {
      return {
        badgeBg: 'bg-[#FF4569]/15 text-[#FF4569] border-[#FF4569]/30',
        badgeText: isEnglish ? 'AI RECOMMENDATION: REJECT' : 'Khuyến nghị AI: Từ chối yêu cầu',
        title: isEnglish ? 'Critical policy violations detected' : 'Phát hiện vi phạm nghiêm trọng',
        icon: ShieldAlert,
        iconColor: 'text-[#FF4569]',
        iconBg: 'bg-[#FF4569]/15 border-[#FF4569]/30',
        defaultSummary: isEnglish
          ? 'Mandatory policy violations detected. Recommendation: reject or request revision.'
          : 'Phát hiện nội dung hoặc tài liệu vi phạm chính sách bắt buộc. Đề xuất từ chối hoặc yêu cầu điều chỉnh lại.',
      }
    }
    return {
      badgeBg: 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30',
      badgeText: isEnglish ? 'AI RECOMMENDATION: NEEDS COMPARISON' : 'Khuyến nghị AI: Cần đối chiếu thêm',
      title: isEnglish ? 'Requires administrator review' : 'Cần quản trị viên xem xét',
      icon: AlertTriangle,
      iconColor: 'text-[#F59E0B]',
      iconBg: 'bg-[#F59E0B]/15 border-[#F59E0B]/30',
      defaultSummary: isEnglish
        ? 'Event has minor conditions or notices requiring administrator review before approval.'
        : 'Sự kiện có một số thiếu sót hoặc điều kiện cần lưu ý trước khi quyết định phê duyệt.',
    }
  }

  const config = getStatusConfig()

  return (
    <div className="mb-4 space-y-3">
      {/* Top: AI Recommendation Header */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border ${config.badgeBg}`}>
            {config.badgeText}
          </span>
        </div>
        <h4 className="font-display text-sm font-bold text-slate-100 [html.light_&]:text-[#0D1B2A]">
          {config.title}
        </h4>
        <p className="text-xs text-slate-300 leading-relaxed [html.light_&]:text-slate-600">
          {translatePhrase(summary, isEnglish ? 'en' : 'vi') || config.defaultSummary}
        </p>
      </div>

      {/* Metrics Row (Unified Single Grid) */}
      <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-[#263751] [html.light_&]:border-slate-200">
        {/* Metric 1: Quality Score */}
        <div className="rounded-xl border border-[#263751] bg-[#1A2940] p-2.5 space-y-1.5 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] font-medium text-slate-400 [html.light_&]:text-slate-600">{isEnglish ? 'Quality score' : 'Chất lượng thông tin'}</span>
            <span className="font-bold text-[#10B981]">{quality_score}/100</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#081126] border border-[#263751]/60 overflow-hidden [html.light_&]:bg-slate-200 [html.light_&]:border-slate-300">
            <div
              className="h-full bg-gradient-to-r from-[#10B981] to-[#E8B85D] rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, quality_score))}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Risk Score */}
        <div className="rounded-xl border border-[#263751] bg-[#1A2940] p-2.5 space-y-1.5 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] font-medium text-slate-400 [html.light_&]:text-slate-600">{isEnglish ? 'Risk index' : 'Chỉ số rủi ro'}</span>
            <span className={`font-bold ${risk_score > 50 ? 'text-[#FF4569]' : risk_score > 20 ? 'text-[#F59E0B]' : 'text-[#10B981]'}`}>
              {risk_score}/100
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#081126] border border-[#263751]/60 overflow-hidden [html.light_&]:bg-slate-200 [html.light_&]:border-slate-300">
            <div
              className={`h-full rounded-full transition-all duration-500 ${risk_score > 50 ? 'bg-[#FF4569]' : risk_score > 20 ? 'bg-[#F59E0B]' : 'bg-[#10B981]'}`}
              style={{ width: `${Math.min(100, Math.max(0, risk_score))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBanner({ recommendation, summary }) {
  return <AiExecutiveSummaryCard aiData={{ recommendation, summary }} />
}

function PolicyFindingCard({ item, severity = 'CRITICAL', onClick }) {
  const { isEnglish } = useLanguage()
  const isCrit = severity === 'CRITICAL'
  const policy = item.policy_code || (isCrit ? (isEnglish ? 'VIOLATION' : 'VI PHẠM') : (isEnglish ? 'NOTICE' : 'LƯU Ý'))
  const rawIssue = item.issue || item.message || (typeof item === 'string' ? item : '')
  const issue = isEnglish ? (translatePhrase(rawIssue, 'en') || rawIssue) : rawIssue
  const quote = item.highlighted_text

  return (
    <div className={`group rounded-xl border ${isCrit ? 'border-[#FF4569]/30 bg-[#1A2940] hover:border-[#FF4569]/60 [html.light_&]:border-rose-200 [html.light_&]:bg-slate-50' : 'border-[#F59E0B]/30 bg-[#1A2940] hover:border-[#F59E0B]/60 [html.light_&]:border-amber-200 [html.light_&]:bg-slate-50'} p-3.5 space-y-2.5 transition shadow-sm`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-mono font-bold text-white tracking-wide truncate [html.light_&]:text-[#0D1B2A]">
          {policy}
        </span>
        <button
          type="button"
          onClick={() => onClick?.(`[${isCrit ? (isEnglish ? 'Violation' : 'Vi phạm') : (isEnglish ? 'Notice' : 'Lưu ý')} ${policy}] ${issue}`)}
          className="inline-flex items-center gap-1 text-[9px] font-medium text-[#E8B85D] hover:text-[#F3F4F6] [html.light_&]:text-amber-700 [html.light_&]:hover:text-amber-800 transition cursor-pointer shrink-0"
          title={isEnglish ? 'Click to copy to notes' : 'Bấm để sao chép vào ghi chú'}
        >
          <span>+</span>
          <span>{isEnglish ? 'Add to notes' : 'Thêm vào ghi chú'}</span>
        </button>
      </div>

      <p className="text-xs font-semibold text-slate-100 leading-snug break-words [html.light_&]:text-[#0D1B2A]">{issue}</p>

      {quote && (
        <div className="rounded-lg border-l-2 border-[#E8B85D] bg-[#081126] px-3 py-2 text-[11px] text-slate-300 [html.light_&]:bg-white [html.light_&]:border-slate-200 [html.light_&]:text-slate-700">
          <span className="font-bold text-[#E8B85D] block mb-0.5 [html.light_&]:text-amber-700">{isEnglish ? 'Extracted evidence:' : 'Bằng chứng trích xuất:'}</span>
          <p className="italic font-mono break-words text-slate-300 [html.light_&]:text-slate-600">&ldquo;{quote}&rdquo;</p>
        </div>
      )}
    </div>
  )
}

function PolicyViolationCard({ item, onClick }) {
  return <PolicyFindingCard item={item} severity="CRITICAL" onClick={onClick} />
}

function PolicyWarningCard({ item, onClick }) {
  return <PolicyFindingCard item={item} severity="WARNING" onClick={onClick} />
}

function CompliantCheckItem({ check }) {
  const { isEnglish } = useLanguage()
  const rawText = typeof check === 'string' ? check : check.title || check.issue || JSON.stringify(check)
  const text = isEnglish ? (translatePhrase(rawText, 'en') || rawText) : rawText
  return (
    <div className="flex items-start gap-2.5 text-left py-1">
      <span className="mt-2 size-1.5 rounded-full bg-[#10B981] shrink-0" />
      <span className="text-sm font-medium text-slate-200 leading-relaxed [html.light_&]:text-[#0D1B2A]">{text}</span>
    </div>
  )
}

function SuggestionCard({ suggestion, onClick }) {
  const { isEnglish } = useLanguage()
  const rawText = typeof suggestion === 'string' ? suggestion : suggestion.text || JSON.stringify(suggestion)
  const text = isEnglish ? (translatePhrase(rawText, 'en') || rawText) : rawText
  return (
    <li
      onClick={() => onClick?.(isEnglish ? `[Suggestion] ${text}` : `[Gợi ý] ${text}`)}
      className="flex items-start gap-2.5 text-sm text-slate-200 leading-relaxed hover:text-white [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:text-amber-800 cursor-pointer transition group"
      title={isEnglish ? 'Click to copy into notes' : 'Bấm để thêm vào ghi chú'}
    >
      <span className="mt-2 size-1.5 rounded-full bg-[#E8B85D] shrink-0 group-hover:scale-125 transition-transform" />
      <span className="flex-1 break-words">{text}</span>
    </li>
  )
}

function ContentSpellingAuditCard({ contentReview, event, onClick }) {
  const { isEnglish } = useLanguage()
  // Fallback to client-side evaluation if contentReview is absent or incomplete
  const fallbackReview = useMemo(() => {
    if (!event) return null
    const title = String(event.title || '').trim()
    const rawDesc = String(event.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const textLower = `${title} ${event.short_description || ''} ${rawDesc}`.toLowerCase()

    let titleStatus = 'VALID'
    let titleAnalysis = `Tiêu đề sự kiện "${title}" rõ ràng, đúng nhận diện chương trình, không vi phạm chuẩn mực.`
    if (!title || title.length < 5) {
      titleStatus = 'NEEDS_IMPROVEMENT'
      titleAnalysis = 'Tiêu đề sự kiện quá ngắn, chưa đủ thông tin định danh rõ ràng.'
    } else if (/(\b(x100|bao l[oờ]|ki[eế]m ti[eề]n nhanh|l[uừ]a)\b)/i.test(title)) {
      titleStatus = 'VIOLATION'
      titleAnalysis = 'Tiêu đề chứa dấu hiệu giật tít lừa đảo, cam kết lợi nhuận hoặc từ ngữ cấm.'
    }

    let descStatus = 'VALID'
    let descAnalysis = ''
    const sensitiveFraudWords = ['chuyển khoản stk', 'stk cá nhân', 'inbox zalo', 'telegram đầu tư', 'bao lời 100%', 'cam kết lãi']
    const foundFraud = sensitiveFraudWords.find((w) => textLower.includes(w))

    const charCount = rawDesc.length
    const wordCount = rawDesc.split(/\s+/).filter(Boolean).length
    const hasActors = /(diễn viên|nghệ sĩ|đạo diễn|ca sĩ|khách mời|speaker|diễn giả|ns\.)/i.test(rawDesc)
    const hasSynopsis = /(nội dung|cốt truyện|vở kịch|câu chuyện|chương trình|giới thiệu|tiết mục)/i.test(rawDesc)
    const hasRules = /(quy định|lưu ý|cảnh báo|độ tuổi|trang phục|dresscode|vật dụng|cấm|check-in|vé)/i.test(rawDesc)
    const isHorrorOrMature = /(kịch ma|kinh dị|ma quái|nhà có ma|con quỷ|rùng rợn|18\+|kinh hoàng)/i.test(textLower)

    if (foundFraud) {
      descStatus = 'VIOLATION'
      descAnalysis = `Phát hiện từ khóa nghi vấn giao dịch ngoài sàn / cam kết phi thực tế: "${foundFraud}".`
    } else if (charCount < 50) {
      descStatus = 'NEEDS_IMPROVEMENT'
      descAnalysis = 'Mô tả chi tiết sự kiện quá sơ sài, gần như chưa có nội dung chương trình để khán giả tham khảo.'
    } else {
      const parts = []
      if (charCount >= 100) parts.push(`Mô tả chi tiết có độ dài ${charCount} ký tự (${wordCount} từ).`)
      if (hasActors) parts.push('Đã giới thiệu rõ đạo diễn và dàn diễn viên/nghệ sĩ tham gia biểu diễn.')
      if (hasSynopsis) parts.push('Có phần tóm tắt nội dung và chủ đề sự kiện.')
      else parts.push('Nội dung cốt truyện/kịch bản sự kiện còn ngắn, chưa nêu rõ chi tiết câu chuyện.')

      if (isHorrorOrMature) {
        if (!hasRules) {
          descStatus = 'NEEDS_IMPROVEMENT'
          parts.push('LƯU Ý: Đây là thể loại Kịch Ma/Kinh dị (hiệu ứng 4D, âm thanh giật gân), nhưng mô tả chưa có cảnh báo an toàn & khuyến cáo độ tuổi (ví dụ: hạn chế trẻ nhỏ dưới 12 tuổi, cảnh báo người có tiền sử tim mạch/huyết áp hoặc phụ nữ mang thai).')
        } else {
          parts.push('Có quy định tham gia và khuyến cáo an toàn cho người tham dự.')
        }
      } else if (!hasRules && charCount < 300) {
        parts.push('Khuyến nghị bổ sung thêm mục Lưu ý khi tham gia (thời gian check-in, đồ uống/vật dụng được phép mang vào).')
      }
      descAnalysis = parts.join(' ')
    }

    const spellingIssues = []
    if (/\s+[;:,.\?!]|\b[;:,.\?!][^\s\d"'\)\]\}\>]/.test(`${title} ${rawDesc}`)) {
      spellingIssues.push('Khoảng cách trước/sau dấu câu (; hoặc :) chưa đồng bộ')
    }
    if (/\bQủy\b/i.test(`${title} ${rawDesc}`)) {
      spellingIssues.push('Từ "Qủy" nên chuẩn hóa thành "Quỷ" (dấu hỏi trên chữ u/y chuẩn tiếng Việt)')
    }

    return {
      title_status: titleStatus,
      title_analysis: titleAnalysis,
      description_status: descStatus,
      description_analysis: descAnalysis,
      spelling_grammar_issues: spellingIssues,
      hasActors,
      hasSynopsis,
      hasRules,
      isHorrorOrMature,
    }
  }, [event])

  const effectiveReview = contentReview || fallbackReview
  if (!effectiveReview) return null

  const titleStatus = effectiveReview.title_status || 'VALID'
  const descStatus = effectiveReview.description_status || 'VALID'
  const descAnalysis = effectiveReview.description_analysis || ''
  const titleAnalysis = effectiveReview.title_analysis || ''
  const spellingIssues = Array.isArray(effectiveReview.spelling_grammar_issues) ? effectiveReview.spelling_grammar_issues : []

  const getStatusBadge = (st) => {
    if (st === 'VIOLATION') {
      return <span className="rounded bg-[#FF4569]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#FF4569] border border-[#FF4569]/30 whitespace-nowrap">Vi phạm</span>
    }
    if (st === 'NEEDS_IMPROVEMENT') {
      return <span className="rounded bg-[#F59E0B]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#F59E0B] border border-[#F59E0B]/30 whitespace-nowrap">Cần bổ sung</span>
    }
    return <CheckCircle2 className="size-4 text-[#10B981] shrink-0" />
  }

  const isHeaderViolation = descStatus === 'VIOLATION' || titleStatus === 'VIOLATION'
  const isHeaderWarning = descStatus === 'NEEDS_IMPROVEMENT' || titleStatus === 'NEEDS_IMPROVEMENT'

  const getHeaderBadge = () => {
    if (isHeaderViolation) {
      return (
        <span className="rounded-full bg-[#FF4569]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-[#FF4569] border border-[#FF4569]/30 whitespace-nowrap">
          Có vi phạm
        </span>
      )
    }
    if (isHeaderWarning) {
      return (
        <span className="rounded-full bg-[#F59E0B]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-[#F59E0B] border border-[#F59E0B]/30 whitespace-nowrap">
          Cần bổ sung
        </span>
      )
    }
    return (
      <span className="rounded-full bg-[#10B981]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-[#10B981] border border-[#10B981]/30 whitespace-nowrap">
        Đạt chuẩn
      </span>
    )
  }

  const overallTone = descStatus === 'VIOLATION' || titleStatus === 'VIOLATION'
    ? 'border-[#FF4569]/30 bg-[#101D32] [html.light_&]:bg-rose-50/40 [html.light_&]:border-rose-200'
    : descStatus === 'NEEDS_IMPROVEMENT' || titleStatus === 'NEEDS_IMPROVEMENT'
      ? 'border-[#F59E0B]/30 bg-[#101D32] [html.light_&]:bg-amber-50/40 [html.light_&]:border-amber-200'
      : 'border-[#263751] bg-[#101D32] [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-100 [html.light_&]:text-[#0D1B2A]">
          <FileText className="size-3.5 text-white [html.light_&]:text-[#0D1B2A]" />
          {isEnglish ? 'Description & Content Audit' : 'Kiểm duyệt Mô tả & Nội dung sự kiện'}
        </span>
        {getHeaderBadge()}
      </div>

      <div className={`rounded-2xl border ${overallTone} p-4 space-y-3.5 shadow-sm`}>
        {/* Description Audit Section */}
      <div className="space-y-1.5 pl-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-100 [html.light_&]:text-[#0D1B2A]">
            <span className="size-1.5 rounded-full bg-[#E8B85D] shrink-0"></span>
            <span>Mô tả chi tiết sự kiện:</span>
          </div>
          {getStatusBadge(descStatus)}
        </div>

        {descAnalysis ? (
          <p className="text-xs text-slate-300 leading-relaxed break-words pl-3.5 [html.light_&]:text-slate-600">{descAnalysis}</p>
        ) : (
          <p className="text-xs text-slate-400 italic pl-3.5 [html.light_&]:text-slate-500">Mô tả bài viết đã được quét, không phát hiện vi phạm.</p>
        )}

        {/* Feature Checkpoints */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 pl-3.5 text-[11px]">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#081126] border border-[#263751] text-slate-300 [html.light_&]:bg-white [html.light_&]:border-slate-300 [html.light_&]:text-slate-700">
            ✓ Giới thiệu & Cốt truyện
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${descStatus === 'NEEDS_IMPROVEMENT' ? 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30 [html.light_&]:bg-amber-100 [html.light_&]:text-amber-800' : 'bg-[#081126] border border-[#263751] text-slate-300 [html.light_&]:bg-white [html.light_&]:border-slate-300 [html.light_&]:text-slate-700'}`}>
            {descStatus === 'NEEDS_IMPROVEMENT' ? '⚠ Cần cảnh báo độ tuổi / an toàn' : '✓ Quy định & An toàn'}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#081126] border border-[#263751] text-slate-300 [html.light_&]:bg-white [html.light_&]:border-slate-300 [html.light_&]:text-slate-700">
            ✓ Minh bạch thanh toán
          </span>
        </div>

        {descStatus !== 'VALID' && (
          <div className="pt-1.5 pl-3.5">
            <button
              type="button"
              onClick={() => onClick?.(`[Góp ý mô tả chi tiết] ${descAnalysis}`)}
              className="inline-flex items-center gap-1 text-[9px] font-medium text-[#E8B85D] hover:text-[#F3F4F6] [html.light_&]:text-amber-700 [html.light_&]:hover:text-amber-800 transition cursor-pointer"
            >
              <span>+</span>
              <span>Thêm nhận xét mô tả vào ghi chú</span>
            </button>
          </div>
        )}
      </div>

      {/* Title Audit Section */}
      {titleAnalysis && (
        <div className="space-y-1.5 pl-1 pt-1 border-t border-[#263751]/40 [html.light_&]:border-slate-200">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-100 [html.light_&]:text-[#0D1B2A]">
              <span className="size-1.5 rounded-full bg-[#E8B85D] shrink-0"></span>
              <span>Tiêu đề sự kiện:</span>
            </div>
            {getStatusBadge(titleStatus)}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed pl-3.5 [html.light_&]:text-slate-600">{titleAnalysis}</p>
        </div>
      )}

      {/* Spelling & Grammar Issues */}
      {spellingIssues.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[#263751]/40 [html.light_&]:border-slate-200 pl-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#E8B85D] [html.light_&]:text-amber-700">
            <SpellCheck className="size-4 text-[#E8B85D] [html.light_&]:text-amber-700" />
            <span>Phát hiện {spellingIssues.length} lưu ý chính tả / dấu câu:</span>
          </div>
          <div className="space-y-1 pl-1">
            {spellingIssues.map((issue, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 py-1 text-xs text-slate-200 [html.light_&]:text-[#0D1B2A]"
              >
                <div className="flex items-start gap-2">
                  <span className="size-1.5 rounded-full bg-[#E8B85D] mt-1.5 shrink-0" />
                  <span className="leading-relaxed">{issue}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onClick?.(`[Lỗi chính tả / văn bản] ${issue}`)}
                  className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-medium text-[#E8B85D] hover:text-[#F3F4F6] transition cursor-pointer ml-2"
                  title="Bấm để sao chép vào ghi chú"
                >
                  <span>+</span>
                  <span>Thêm</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

function DocumentModerationAuditCard({ documentReview, documentAnalysis, onPreviewDoc, onClick }) {
  const { isEnglish } = useLanguage()
  const items = Array.isArray(documentReview?.items) ? documentReview.items : []
  const docAnalysisList = Array.isArray(documentAnalysis) ? documentAnalysis : []

  if (items.length === 0 && docAnalysisList.length === 0) {
    return null
  }

  const overallVerdict = documentReview?.overall_document_verdict || documentReview?.overall_verdict || 'SAFE'

  const getStatusBadge = (st) => {
    if (st === 'VIOLATION') return <span className="rounded bg-[#FF4569]/15 px-2 py-0.5 text-[10px] font-bold text-[#FF4569] border border-[#FF4569]/30">Vi phạm tài liệu</span>
    if (st === 'WARNING') return <span className="rounded bg-[#F59E0B]/15 px-2 py-0.5 text-[10px] font-bold text-[#F59E0B] border border-[#F59E0B]/30">Cần lưu ý</span>
    return <span className="rounded bg-[#10B981]/15 px-2 py-0.5 text-[10px] font-bold text-[#10B981] border border-[#10B981]/30">Hợp lệ</span>
  }

  const getRelevanceBadge = (rel) => {
    if (rel === 'HIGH') return <span className="rounded bg-[#10B981]/15 px-2 py-0.5 text-[10px] font-semibold text-[#10B981] border border-[#10B981]/30">Khớp sự kiện & pháp lý</span>
    if (rel === 'MEDIUM') return <span className="rounded bg-[#60A5FA]/15 px-2 py-0.5 text-[10px] font-semibold text-[#60A5FA] border border-[#60A5FA]/30">Liên quan sự kiện</span>
    if (rel === 'LOW') return <span className="rounded bg-[#F59E0B]/15 px-2 py-0.5 text-[10px] font-semibold text-[#F59E0B] border border-[#F59E0B]/30">Độ liên quan thấp</span>
    if (rel === 'NOT_RELEVANT') return <span className="rounded bg-[#FF4569]/15 px-2 py-0.5 text-[10px] font-semibold text-[#FF4569] border border-[#FF4569]/30">Không liên quan</span>
    return null
  }

  const getDocTypeBadge = (name = '', url = '') => {
    const lower = `${name} ${url}`.toLowerCase()
    if (lower.includes('.pdf')) return <span className="text-[10px] font-bold text-[#FF4569] bg-[#FF4569]/15 px-1.5 py-0.5 rounded border border-[#FF4569]/30">PDF</span>
    if (lower.includes('.docx') || lower.includes('.doc')) return <span className="text-[10px] font-bold text-[#60A5FA] bg-[#60A5FA]/15 px-1.5 py-0.5 rounded border border-[#60A5FA]/30">WORD DOCX</span>
    if (/\.(jpg|jpeg|png|webp)/.test(lower)) return <span className="text-[10px] font-bold text-[#10B981] bg-[#10B981]/15 px-1.5 py-0.5 rounded border border-[#10B981]/30">ẢNH SCAN</span>
    return <span className="text-[10px] font-bold text-slate-300 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">TÀI LIỆU</span>
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-100 [html.light_&]:text-[#0D1B2A]">
          <FileCheck className="size-3.5 text-white [html.light_&]:text-[#0D1B2A]" />
          Kiểm duyệt Tài liệu Giấy phép ({items.length || docAnalysisList.length} tệp)
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${overallVerdict === 'VIOLATION'
            ? 'bg-[#FF4569]/15 text-[#FF4569] border border-[#FF4569]/30'
            : overallVerdict === 'WARNING'
              ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
              : 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30'
          }`}>
          {overallVerdict === 'VIOLATION' ? 'Có vi phạm' : overallVerdict === 'WARNING' ? 'Cần lưu ý' : 'Hợp lệ'}
        </span>
      </div>

      <div className="space-y-2">
        {items.map((doc, idx) => {
          const matchingAnalysis = docAnalysisList.find(a => (doc.url && a.url === doc.url) || (doc.fileName && a.fileName === doc.fileName) || (a.source && a.source.includes(String(idx + 1))))
          const extractedText = matchingAnalysis?.extractedText || null

          return (
            <div key={idx} className="rounded-xl border border-[#263751] bg-[#1A2940] p-3.5 space-y-2.5 [html.light_&]:bg-white [html.light_&]:border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {getDocTypeBadge(doc.fileName, doc.url)}
                  <span className="font-bold text-slate-100 truncate max-w-[220px] [html.light_&]:text-[#0D1B2A]" title={doc.fileName}>
                    {doc.fileName || `Tài liệu ${idx + 1}`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {getRelevanceBadge(doc.relevance_to_event)}
                  {getStatusBadge(doc.status)}
                </div>
              </div>

              {/* Phân tích tính liên quan & nội dung */}
              {doc.analysis && (
                <p className="text-xs text-slate-300 leading-relaxed [html.light_&]:text-slate-600">
                  {doc.analysis}
                </p>
              )}

              {/* Chi tiết vi phạm cụ thể: Vi phạm gì & Vi phạm chỗ nào trong tài liệu */}
              {(doc.violation_type || (doc.status === 'VIOLATION' && doc.issues?.length > 0)) && (
                <div className="rounded-lg border border-[#FF4569]/30 bg-[#081126] p-2.5 space-y-2 [html.light_&]:bg-rose-50/50 [html.light_&]:border-rose-200">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#FF4569] [html.light_&]:text-rose-700">
                    <ShieldAlert className="size-3.5 text-[#FF4569] [html.light_&]:text-rose-700 shrink-0" />
                    <span>Vi phạm: {doc.violation_type || 'Nội dung tài liệu vi phạm quy định'}</span>
                  </div>

                  {doc.violating_location && (
                    <div className="rounded-md border-l-2 border-[#E8B85D] bg-[#101D32] p-2.5 text-[11px] text-slate-300 font-mono [html.light_&]:bg-white [html.light_&]:border-slate-200 [html.light_&]:text-slate-700">
                      <span className="font-bold text-[#E8B85D] not-italic block mb-1 [html.light_&]:text-amber-700">
                        Trích dẫn vi phạm trong tài liệu:
                      </span>
                      &ldquo;{doc.violating_location}&rdquo;
                    </div>
                  )}

                  {Array.isArray(doc.issues) && doc.issues.length > 0 && (
                    <div className="space-y-1 text-xs text-[#FF4569]/90 [html.light_&]:text-rose-700">
                      {doc.issues.map((iss, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="text-[#FF4569]">•</span>
                          <span>{iss}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Gợi ý điều chỉnh */}
              {doc.suggestion && (
                <div className="rounded-lg border border-[#E8B85D]/30 bg-[#081126] px-3 py-2 text-xs flex items-center justify-between gap-2 [html.light_&]:bg-amber-50/50 [html.light_&]:border-amber-200">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-bold text-[#E8B85D] block [html.light_&]:text-amber-800">Gợi ý tài liệu:</span>
                    <span className="text-slate-200 [html.light_&]:text-slate-800">{doc.suggestion}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onClick?.(`[Gợi ý tài liệu ${doc.fileName || idx + 1}] ${doc.suggestion}`)}
                    className="shrink-0 inline-flex items-center gap-0.5 font-medium text-[9px] text-[#E8B85D] hover:text-[#F3F4F6] [html.light_&]:text-amber-700 [html.light_&]:hover:text-amber-800 transition cursor-pointer ml-2"
                    title="Bấm để sao chép vào ghi chú"
                  >
                    <span>+</span>
                    <span>Thêm</span>
                  </button>
                </div>
              )}


            </div>
          )
        })}
      </div>
    </div>
  )
}

function VisualCoTOcrSection({ ocrReasoning, extractedTexts }) {
  const [expanded, setExpanded] = useState(false)
  const hasCoT = Boolean(
    ocrReasoning?.step1_scene_context ||
    ocrReasoning?.step2_anchor_text ||
    ocrReasoning?.step3_stylized_decoding ||
    ocrReasoning?.step4_moderation_verdict
  )
  const texts = Array.isArray(extractedTexts) ? extractedTexts : []

  if (!hasCoT && texts.length === 0) return null

  const getFontStyleLabel = (style) => {
    switch (style) {
      case 'STYLIZED_HORROR': return 'Chữ kinh dị / Uốn lượn'
      case 'NEON_GLOW': return 'Hiệu ứng Neon'
      case '3D_EFFECT': return 'Hiệu ứng 3D'
      case 'HANDWRITTEN': return 'Chữ viết tay'
      default: return 'Phông chữ chuẩn'
    }
  }

  const getEffectLabel = (eff) => {
    switch (eff) {
      case 'BLOOD_SPLATTER': return 'Vệt máu nghệ thuật'
      case 'SMOKE': return 'Khói sương'
      case 'DISTORTION': return 'Biến dạng'
      default: return null
    }
  }

  return (
    <div className="space-y-2.5 mt-2 pt-2 border-t border-[#263751]/60 [html.light_&]:border-slate-200">
      {/* Extracted Texts List */}
      {texts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#E8B85D] [html.light_&]:text-amber-700">
              <Sparkles className="size-3.5 text-[#E8B85D] [html.light_&]:text-amber-700" />
              <span>Văn bản giải mã qua Visual OCR ({texts.length} cụm từ):</span>
            </div>
            {hasCoT && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="grid size-6 place-items-center rounded-lg border border-[#263751] bg-[#101D32] text-slate-300 hover:text-white hover:border-[#E8B85D]/60 hover:bg-[#1A2940] transition cursor-pointer active:scale-95 shadow-sm shrink-0 [html.light_&]:bg-white [html.light_&]:border-slate-300 [html.light_&]:text-slate-700 [html.light_&]:hover:bg-slate-100"
                title={expanded ? 'Thu gọn chi tiết suy luận OCR' : 'Xem chi tiết suy luận OCR'}
              >
                {expanded ? <EyeOff className="size-3.5 text-[#E8B85D] [html.light_&]:text-amber-700" /> : <Eye className="size-3.5 text-slate-300 [html.light_&]:text-slate-700" />}
              </button>
            )}
          </div>
          <div className="space-y-1.5 pl-1">
            {texts.map((t, i) => {
              const effectText = getEffectLabel(t.visual_effect)
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs flex-wrap"
                >
                  <span className="size-1.5 rounded-full bg-[#E8B85D] mt-1.5 shrink-0" />
                  <span className="font-bold text-slate-100 tracking-wide [html.light_&]:text-[#0D1B2A]">
                    &ldquo;{t.text}&rdquo;
                  </span>
                  {t.is_event_title && (
                    <span className="rounded bg-[#1A2940] border border-[#263751] px-1.5 py-0.5 text-[10px] font-medium text-white [html.light_&]:bg-slate-100 [html.light_&]:border-slate-300 [html.light_&]:text-[#0D1B2A]">
                      Tên sự kiện
                    </span>
                  )}
                  <span className="rounded bg-[#1A2940] border border-[#263751] px-1.5 py-0.5 text-[10px] font-medium text-white [html.light_&]:bg-slate-100 [html.light_&]:border-slate-300 [html.light_&]:text-[#0D1B2A]">
                    {getFontStyleLabel(t.font_style)}
                  </span>
                  {effectText && (
                    <span className="rounded bg-[#1A2940] border border-[#263751] px-1.5 py-0.5 text-[10px] font-medium text-white [html.light_&]:bg-slate-100 [html.light_&]:border-slate-300 [html.light_&]:text-[#0D1B2A]">
                      {effectText}
                    </span>
                  )}
                  {t.confidence && (
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                      t.confidence === 'HIGH'
                        ? 'bg-[#10B981]/15 border-[#10B981]/30 text-[#10B981] [html.light_&]:bg-emerald-50 [html.light_&]:border-emerald-200 [html.light_&]:text-emerald-700'
                        : 'bg-[#F59E0B]/15 border-[#F59E0B]/30 text-[#F59E0B] [html.light_&]:bg-amber-50 [html.light_&]:border-amber-200 [html.light_&]:text-amber-800'
                    }`}>
                      {t.confidence === 'HIGH' ? 'Tin cậy cao' : 'Tin cậy TB'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 4-Step CoT Reasoning (Bỏ khung bọc, đổi sang màu trắng) */}
      {hasCoT && expanded && (
        <div className="space-y-2 pt-2 text-xs leading-relaxed border-t border-[#263751]/40 [html.light_&]:border-slate-200 pl-1">
          {ocrReasoning.step1_scene_context && (
            <div className="space-y-0.5">
              <h5 className="font-bold text-white [html.light_&]:text-[#0D1B2A]">
                1. Phân tích bối cảnh & Chủ đề (Scene & Theme Context):
              </h5>
              <p className="text-white/90 leading-relaxed [html.light_&]:text-slate-700">{ocrReasoning.step1_scene_context}</p>
            </div>
          )}
          {ocrReasoning.step2_anchor_text && (
            <div className="space-y-0.5">
              <h5 className="font-bold text-white [html.light_&]:text-[#0D1B2A]">
                2. Quét vùng chữ rõ nét làm mồi ngữ cảnh (Anchor Text):
              </h5>
              <p className="text-white/90 leading-relaxed [html.light_&]:text-slate-700">{ocrReasoning.step2_anchor_text}</p>
            </div>
          )}
          {ocrReasoning.step3_stylized_decoding && (
            <div className="space-y-0.5">
              <h5 className="font-bold text-white [html.light_&]:text-[#0D1B2A]">
                3. Giải mã phông chữ biến dạng & Khung xương (Stylized Typography):
              </h5>
              <p className="text-white/90 leading-relaxed [html.light_&]:text-slate-700">{ocrReasoning.step3_stylized_decoding}</p>
            </div>
          )}
          {ocrReasoning.step4_moderation_verdict && (
            <div className="space-y-0.5">
              <h5 className="font-bold text-white [html.light_&]:text-[#0D1B2A]">
                4. Đánh giá kiểm duyệt (Moderation Verdict):
              </h5>
              <p className="text-white/90 leading-relaxed [html.light_&]:text-slate-700">{ocrReasoning.step4_moderation_verdict}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ImageModerationAuditCard({ imageReview, visionAnalysis, event, onClick }) {
  const { isEnglish } = useLanguage()
  // Strictly filter out any PERMIT items to never mix documents with images
  const items = Array.isArray(imageReview?.items) ? imageReview.items.filter(it => !it.source?.startsWith('PERMIT')) : []
  const visionItems = Array.isArray(visionAnalysis) ? visionAnalysis.filter(v => !v.source?.startsWith('PERMIT')) : []

  if (items.length === 0 && visionItems.length === 0 && !imageReview?.poster_analysis && !imageReview?.banner_analysis) {
    return null
  }

  const overallVerdict = imageReview?.overall_image_verdict || imageReview?.overall_verdict || 'SAFE'

  const getSourceLabel = (src) => {
    if (src === 'MAIN_POSTER') return 'Ảnh đại diện chính (Poster)'
    if (src === 'COVER_BANNER') return 'Ảnh bìa (Cover Banner)'
    if (src?.startsWith('DESCRIPTION_IMAGE')) return `Ảnh trong mô tả (${src.replace('DESCRIPTION_IMAGE_', '#')})`
    return src || 'Hình ảnh'
  }

  const getThumbnailUrl = (src, url) => {
    if (url && typeof url === 'string' && url.trim()) return url.trim()
    if (src === 'MAIN_POSTER') return event?.thumbnail_url || event?.poster_url || event?.image || event?.thumbnail || null
    if (src === 'COVER_BANNER') return event?.banner_url || event?.cover_url || event?.banner || null
    return null
  }

  const formatAnalysis = (text, source) => {
    if (!text || typeof text !== 'string') return ''
    if (/[\u0E00-\u0E7F\u1780-\u17FF\u0E80-\u0EFF\u1000-\u109F\u0900-\u097F]/.test(text) || /(.)\1{4,}/.test(text) || /(.{2,8})\1{3,}/.test(text)) {
      return `${getSourceLabel(source)} có bố cục trực quan rõ nét, phù hợp với chủ đề sự kiện và không vi phạm quy chuẩn.`
    }
    return text
  }

  const getStatusBadge = (st) => {
    if (st === 'VIOLATION') return <span className="rounded bg-[#FF4569]/15 px-2 py-0.5 text-[10px] font-bold text-[#FF4569] border border-[#FF4569]/30">Vi phạm</span>
    if (st === 'WARNING') return <span className="rounded bg-[#F59E0B]/15 px-2 py-0.5 text-[10px] font-bold text-[#F59E0B] border border-[#F59E0B]/30">Cần lưu ý</span>
    if (st === 'MISSING') return <span className="rounded bg-[#FF4569]/15 px-2 py-0.5 text-[10px] font-bold text-[#FF4569] border border-[#FF4569]/30">Chưa có</span>
    return <span className="rounded bg-[#10B981]/15 px-2 py-0.5 text-[10px] font-bold text-[#10B981] border border-[#10B981]/30">Hợp lệ</span>
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-100 [html.light_&]:text-[#0D1B2A]">
          <ImageIcon className="size-3.5 text-white [html.light_&]:text-[#0D1B2A]" />
          Kiểm duyệt Hình ảnh ({items.length || visionItems.length} ảnh)
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${overallVerdict === 'VIOLATION'
          ? 'bg-[#FF4569]/15 text-[#FF4569] border border-[#FF4569]/30'
          : overallVerdict === 'WARNING'
            ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
            : 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30'
          }`}>
          {overallVerdict === 'VIOLATION' ? 'Có vi phạm' : overallVerdict === 'WARNING' ? 'Cần lưu ý' : 'An toàn'}
        </span>
      </div>

      {/* Render structured items from image_review.items */}
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((img, idx) => {
            const thumbUrl = getThumbnailUrl(img.source, img.url)
            return (
              <div key={idx} className="rounded-xl border border-[#263751] bg-[#1A2940] p-3.5 space-y-2.5 [html.light_&]:bg-white [html.light_&]:border-slate-200">
                <div className="flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt=""
                        className="size-11 rounded-lg object-cover border border-[#263751] shrink-0 [html.light_&]:border-slate-200"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.parentElement?.querySelector('.img-fallback-icon');
                          if (fallback) fallback.style.display = 'grid';
                        }}
                      />
                    ) : null}
                    <div
                      className="img-fallback-icon size-11 rounded-lg bg-[#081126] border border-[#263751] grid place-items-center text-slate-400 shrink-0 [html.light_&]:bg-slate-100 [html.light_&]:border-slate-200"
                      style={{ display: thumbUrl ? 'none' : 'grid' }}
                    >
                      <ImageIcon className="size-5 text-[#A78BFA]" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-slate-100 block truncate [html.light_&]:text-[#0D1B2A]">{getSourceLabel(img.source)}</span>
                      <span className="text-[11px] text-slate-400 [html.light_&]:text-slate-500">Hình ảnh sự kiện</span>
                    </div>
                  </div>
                  {getStatusBadge(img.status)}
                </div>

                {img.analysis && (
                  <p className="text-xs text-slate-300 leading-relaxed [html.light_&]:text-slate-600">{formatAnalysis(img.analysis, img.source)}</p>
                )}

                {/* Visual CoT OCR 4-step Reasoning & Extracted Texts */}
                <VisualCoTOcrSection
                  ocrReasoning={img.ocr_reasoning}
                  extractedTexts={img.extracted_texts}
                />

                {Array.isArray(img.issues) && img.issues.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {img.issues.map((iss, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-[#FF4569]">
                        <AlertCircle className="size-3.5 shrink-0 text-[#FF4569] mt-0.5" />
                        <span>{iss}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Gợi ý hình ảnh */}
                {img.suggestion && (
                  <div className="rounded-lg border border-[#E8B85D]/30 bg-[#081126] px-3 py-2 text-xs flex items-center justify-between gap-2 [html.light_&]:bg-amber-50/50 [html.light_&]:border-amber-200">
                    <div className="space-y-0.5">
                      <span className="text-[11px] font-bold text-[#E8B85D] block [html.light_&]:text-amber-800">Gợi ý hình ảnh:</span>
                      <span className="text-slate-200 [html.light_&]:text-slate-800">{img.suggestion}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onClick?.(`[Gợi ý ảnh ${getSourceLabel(img.source)}] ${img.suggestion}`)}
                      className="shrink-0 inline-flex items-center gap-0.5 font-medium text-[9px] text-[#E8B85D] hover:text-[#F3F4F6] [html.light_&]:text-amber-700 [html.light_&]:hover:text-amber-800 transition cursor-pointer ml-2"
                      title="Bấm để sao chép vào ghi chú"
                    >
                      <span>+</span>
                      <span>Thêm</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : visionItems.length > 0 ? (
        <div className="space-y-2.5">
          {visionItems.map((img, idx) => (
            <div key={idx} className="rounded-xl border border-[#263751] bg-[#1A2940] p-3 space-y-1 [html.light_&]:bg-white [html.light_&]:border-slate-200">
              <span className="text-sm font-bold text-slate-100 [html.light_&]:text-[#0D1B2A]">{getSourceLabel(img.source)}</span>
              <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">{img.description}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[#263751] bg-[#1A2940] p-3.5 space-y-2 text-xs text-slate-300 [html.light_&]:bg-white [html.light_&]:border-slate-200">
          {imageReview?.poster_analysis && <div><strong>Poster:</strong> {imageReview.poster_analysis}</div>}
          {imageReview?.banner_analysis && <div><strong>Banner:</strong> {imageReview.banner_analysis}</div>}
        </div>
      )}
    </div>
  )
}

function parseAiReviewData(aiData) {
  if (!aiData) return null

  const rec = typeof aiData.recommendation === 'string' ? aiData.recommendation : 'APPROVE'
  let rawWarnings = aiData.warnings
  if (typeof rawWarnings === 'string') {
    try {
      rawWarnings = JSON.parse(rawWarnings)
    } catch {
      // keep as string
    }
  }

  // If rawWarnings is an object with rich structure
  if (rawWarnings && typeof rawWarnings === 'object' && !Array.isArray(rawWarnings)) {
    const rawCrit = Array.isArray(rawWarnings.critical_violations) ? rawWarnings.critical_violations : []
    const rawWarn = Array.isArray(rawWarnings.warnings) ? rawWarnings.warnings : []
    const rawComp = Array.isArray(rawWarnings.compliant_checks) ? rawWarnings.compliant_checks : []
    const rawSugg = Array.isArray(rawWarnings.suggestions) ? rawWarnings.suggestions : []

    // Clean image_review to ensure permit documents are never mixed in
    const rawImageReview = rawWarnings.image_review || aiData.image_review || null
    let cleanImageReview = null
    if (rawImageReview) {
      cleanImageReview = {
        ...rawImageReview,
        items: (rawImageReview.items || []).filter(i => !i.source?.startsWith('PERMIT')),
      }
    }

    // Extract document_review and document_analysis
    const rawDocReview = rawWarnings.document_review || aiData.document_review || null
    const docAnalysis = rawWarnings.document_analysis || aiData.document_analysis || null

    return {
      recommendation: rec,
      summary: typeof rawWarnings.summary === 'string' ? rawWarnings.summary : typeof aiData.summary === 'string' ? aiData.summary : '',
      risk_score: Number(rawWarnings.risk_score ?? aiData.risk_score ?? (rec === 'REJECT' ? 85 : rec === 'NEEDS_REVIEW' ? 40 : 5)),
      quality_score: Number(rawWarnings.quality_score ?? aiData.quality_score ?? 85),
      critical_violations: rawCrit.map(v => typeof v === 'string' ? { policy_code: 'VI PHẠM', issue: v } : {
        policy_code: typeof v?.policy_code === 'string' ? v.policy_code : 'CHÍNH SÁCH',
        issue: typeof v?.issue === 'string' ? v.issue : typeof v?.message === 'string' ? v.message : JSON.stringify(v || {}),
        highlighted_text: typeof v?.highlighted_text === 'string' ? v.highlighted_text : null,
      }),
      warnings: rawWarn.map(w => typeof w === 'string' ? { policy_code: 'LƯU Ý', issue: w } : {
        policy_code: typeof w?.policy_code === 'string' ? w.policy_code : 'LƯU Ý',
        issue: typeof w?.issue === 'string' ? w.issue : typeof w?.message === 'string' ? w.message : JSON.stringify(w || {}),
        highlighted_text: typeof w?.highlighted_text === 'string' ? w.highlighted_text : null,
      }),
      compliant_checks: rawComp.map(c => typeof c === 'string' ? c : c?.title || c?.issue || c?.message || JSON.stringify(c || {})),
      suggestions: rawSugg.map(s => typeof s === 'string' ? s : s?.text || s?.issue || s?.message || JSON.stringify(s || {})),
      content_review: rawWarnings.content_review || aiData.content_review || null,
      image_review: cleanImageReview,
      document_review: rawDocReview,
      document_analysis: docAnalysis,
      vision_analysis: rawWarnings.vision_analysis || aiData.vision_analysis || null,
    }
  }

  // If rawWarnings is an array (flat strings or objects)
  const criticalViolations = []
  const yellowWarnings = []
  const compliantChecks = []
  const suggestions = []

  if (Array.isArray(rawWarnings)) {
    rawWarnings.forEach(w => {
      if (typeof w === 'string') {
        if (w.includes('[HIGH]') || w.includes('[Vi phạm')) {
          criticalViolations.push({ policy_code: 'VI PHẠM', issue: w.replace('[HIGH]', '').trim() })
        } else if (w.startsWith('💡') || w.includes('[Gợi ý]')) {
          suggestions.push(w.replace('💡', '').replace('[Gợi ý]', '').trim())
        } else if (w.startsWith('✅') || w.includes('[HỢP LỆ]')) {
          compliantChecks.push(w.replace('✅', '').replace('[HỢP LỆ]', '').trim())
        } else {
          yellowWarnings.push({ policy_code: 'LƯU Ý', issue: w.replace('[MEDIUM]', '').trim() })
        }
      } else if (w && typeof w === 'object') {
        const item = {
          policy_code: typeof w?.policy_code === 'string' ? w.policy_code : (w.severity === 'HIGH' ? 'VI PHẠM' : 'LƯU Ý'),
          issue: typeof w?.issue === 'string' ? w.issue : typeof w?.message === 'string' ? w.message : JSON.stringify(w),
          highlighted_text: typeof w?.highlighted_text === 'string' ? w.highlighted_text : null,
        }
        if (w.severity === 'HIGH') {
          criticalViolations.push(item)
        } else {
          yellowWarnings.push(item)
        }
      }
    })
  }

  return {
    recommendation: rec,
    summary: typeof aiData.summary === 'string' ? aiData.summary : '',
    risk_score: Number(aiData.risk_score ?? (rec === 'REJECT' ? 85 : rec === 'NEEDS_REVIEW' ? 40 : 5)),
    quality_score: Number(aiData.quality_score ?? 85),
    critical_violations: criticalViolations,
    warnings: yellowWarnings,
    compliant_checks: compliantChecks.length > 0 ? compliantChecks : (rec === 'APPROVE' ? ['Sự kiện không vi phạm chính sách', 'Thông tin rõ ràng'] : []),
    suggestions: suggestions,
    content_review: aiData.content_review || null,
    image_review: aiData.image_review || null,
    document_review: aiData.document_review || null,
    document_analysis: aiData.document_analysis || null,
    vision_analysis: aiData.vision_analysis || null,
  }
}

// ---------------------------------------------------------------------------
// Revision Diff Helpers
// ---------------------------------------------------------------------------
function decodeHtmlToPlain(html) {
  if (!html) return ''
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim()
}

function getBlockTagLabel(tag) {
  const t = String(tag || 'p').toLowerCase()
  if (t === 'li') return 'Danh sách liệt kê (• <li>)'
  if (/^h[1-6]$/.test(t)) return `Tiêu đề mục (<${t}>)`
  if (t === 'blockquote') return 'Trích dẫn (<blockquote>)'
  return 'Đoạn văn (<p>)'
}

function extractSemanticHtmlBlocks(html) {
  if (!html || typeof html !== 'string') return []
  const blocks = []
  const blockRegex = /<(p|li|h[1-6]|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let match
  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase()
    const innerHtml = match[2] || ''
    const fullHtml = match[0]
    const text = decodeHtmlToPlain(innerHtml)
    const hasImage = /<img\b/i.test(innerHtml)
    if (!text && !hasImage) continue
    blocks.push({
      tag,
      tagLabel: getBlockTagLabel(tag),
      html: fullHtml,
      innerHtml,
      text,
      hasBold: /<(strong|b)\b/i.test(innerHtml),
      hasItalic: /<(em|i)\b/i.test(innerHtml),
      hasImage,
    })
  }

  if (blocks.length === 0) {
    const plain = decodeHtmlToPlain(html)
    if (plain) {
      plain.split('\n').map((s) => s.trim()).filter(Boolean).forEach((line) => {
        blocks.push({
          tag: 'p',
          tagLabel: 'Đoạn văn',
          html: `<p>${line}</p>`,
          innerHtml: line,
          text: line,
          hasBold: false,
          hasItalic: false,
          hasImage: false,
        })
      })
    }
  }
  return blocks
}

function computeWordDiffTokens(oldStr, newStr) {
  const aStr = String(oldStr ?? '').trim()
  const bStr = String(newStr ?? '').trim()
  if (aStr === bStr) {
    return {
      oldTokens: aStr ? [{ text: aStr, type: 'same' }] : [],
      newTokens: bStr ? [{ text: bStr, type: 'same' }] : [],
      hasChanges: false,
    }
  }

  const tokenize = (s) => s.split(/(\s+|[.,;!?()[\]{}"'“”‘’/\\—–-]+)/).filter((t) => t !== '')
  const aTokens = tokenize(aStr)
  const bTokens = tokenize(bStr)

  if (aTokens.length * bTokens.length > 250000) {
    return {
      oldTokens: aStr ? [{ text: aStr, type: 'removed' }] : [],
      newTokens: bStr ? [{ text: bStr, type: 'added' }] : [],
      hasChanges: true,
    }
  }

  const m = aTokens.length
  const n = bTokens.length
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1))

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (aTokens[i] === bTokens[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1]
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const rawOld = []
  const rawNew = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (aTokens[i] === bTokens[j]) {
      rawOld.push({ text: aTokens[i], type: 'same' })
      rawNew.push({ text: bTokens[j], type: 'same' })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rawOld.push({ text: aTokens[i], type: 'removed' })
      i++
    } else {
      rawNew.push({ text: bTokens[j], type: 'added' })
      j++
    }
  }
  while (i < m) {
    rawOld.push({ text: aTokens[i], type: 'removed' })
    i++
  }
  while (j < n) {
    rawNew.push({ text: bTokens[j], type: 'added' })
    j++
  }

  const mergeTokens = (list) => {
    const merged = []
    for (const item of list) {
      const last = merged[merged.length - 1]
      if (last && last.type === item.type) {
        last.text += item.text
      } else {
        merged.push({ ...item })
      }
    }
    return merged
  }

  return {
    oldTokens: mergeTokens(rawOld),
    newTokens: mergeTokens(rawNew),
    hasChanges: true,
  }
}

function computeHtmlDescriptionDiff(oldHtml, newHtml) {
  const oldBlocks = extractSemanticHtmlBlocks(oldHtml)
  const newBlocks = extractSemanticHtmlBlocks(newHtml)
  const m = oldBlocks.length
  const n = newBlocks.length

  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldBlocks[i].text === newBlocks[j].text) {
        dp[i][j] = 1 + dp[i + 1][j + 1]
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const anchors = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (oldBlocks[i].text === newBlocks[j].text) {
      anchors.push([i, j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    } else {
      j++
    }
  }
  anchors.push([m, n])

  const items = []
  let prevI = 0
  let prevJ = 0

  for (const [currI, currJ] of anchors) {
    const removedSlice = oldBlocks.slice(prevI, currI)
    const addedSlice = newBlocks.slice(prevJ, currJ)
    const pairCount = Math.min(removedSlice.length, addedSlice.length)

    for (let k = 0; k < pairCount; k++) {
      const ob = removedSlice[k]
      const nb = addedSlice[k]
      items.push({
        type: 'TEXT_CHANGE',
        blockNumber: prevJ + k + 1,
        oldBlock: ob,
        newBlock: nb,
        wordDiff: computeWordDiffTokens(ob.text, nb.text),
        formatChanged: ob.tag !== nb.tag,
        formatSummary: ob.tag !== nb.tag ? `${ob.tagLabel} → ${nb.tagLabel}` : null,
      })
    }

    for (let k = pairCount; k < removedSlice.length; k++) {
      items.push({
        type: 'REMOVED_BLOCK',
        blockNumber: prevI + k + 1,
        oldBlock: removedSlice[k],
      })
    }

    for (let k = pairCount; k < addedSlice.length; k++) {
      items.push({
        type: 'ADDED_BLOCK',
        blockNumber: prevJ + k + 1,
        newBlock: addedSlice[k],
      })
    }

    if (currI < m && currJ < n) {
      const ob = oldBlocks[currI]
      const nb = newBlocks[currJ]
      const tagChanged = ob.tag !== nb.tag
      const styleChanged = ob.hasBold !== nb.hasBold || ob.hasItalic !== nb.hasItalic
      if (tagChanged || styleChanged) {
        const formatParts = []
        if (tagChanged) formatParts.push(`${ob.tagLabel} → ${nb.tagLabel}`)
        if (ob.hasBold !== nb.hasBold) formatParts.push(nb.hasBold ? 'Thêm in đậm' : 'Bỏ in đậm')
        if (ob.hasItalic !== nb.hasItalic) formatParts.push(nb.hasItalic ? 'Thêm in nghiêng' : 'Bỏ in nghiêng')
        items.push({
          type: 'FORMAT_CHANGE',
          blockNumber: currJ + 1,
          oldBlock: ob,
          newBlock: nb,
          formatSummary: formatParts.join(' • '),
        })
      }
    }

    prevI = currI + 1
    prevJ = currJ + 1
  }

  return {
    totalOldBlocks: m,
    totalNewBlocks: n,
    items,
  }
}

function parseJsonObjSafe(val) {
  if (!val) return {}
  if (typeof val === 'string') {
    try {
      return JSON.parse(val)
    } catch {
      return {}
    }
  }
  return typeof val === 'object' ? val : {}
}

function normalizeRefundPolicyForDiff(policy) {
  const p = parseJsonObjSafe(policy)
  const allowRefund = Boolean(p.allow_refund ?? p.allow_refunds)
  const rules = allowRefund && Array.isArray(p.refund_rules)
    ? p.refund_rules
        .map((r) => ({
          days_before: Number(r?.days_before || 0),
          refund_rate: Number(r?.refund_rate ?? r?.percentage ?? 0),
        }))
        .sort((a, b) => b.days_before - a.days_before)
    : []
  return {
    allow_refund: allowRefund,
    refund_rules: rules,
    refund_notes: typeof p.refund_notes === 'string' ? p.refund_notes.trim() : '',
    deadline_days: p.deadline_days !== undefined && p.deadline_days !== null ? Number(p.deadline_days) : null,
    policy_file_url: p.policy_file_url || null,
    policy_file_name: p.policy_file_name || null,
  }
}

function normalizePermitFilesForDiff(policyOrPermits) {
  const p = parseJsonObjSafe(policyOrPermits)
  const files = Array.isArray(policyOrPermits)
    ? policyOrPermits
    : Array.isArray(p.permit_files)
      ? p.permit_files
      : []
  return files
    .filter(Boolean)
    .map((f) => ({
      id: f.id || null,
      url: f.url || f.file_url || null,
      name: f.name || f.file_name || 'Tài liệu đính kèm',
      size: f.size ? Number(f.size) : null,
      type: f.type || f.mime_type || 'document',
    }))
}

function normalizeSeatingRulesForDiff(rules) {
  const r = parseJsonObjSafe(rules)
  return {
    require_adjacent_seats: Boolean(r.require_adjacent_seats),
    require_same_row: Boolean(r.require_same_row),
    disallow_single_seat_left: Boolean(r.disallow_single_seat_left),
    max_tickets_per_order:
      Number.isInteger(Number(r.max_tickets_per_order)) && Number(r.max_tickets_per_order) > 0
        ? Number(r.max_tickets_per_order)
        : 10,
  }
}

function formatRefundSummaryText(normPolicy) {
  if (!normPolicy?.allow_refund) return 'Không hỗ trợ hoàn vé'
  const rulesStr = (normPolicy.refund_rules || [])
    .map((r) => `Trước ${r.days_before} ngày: hoàn ${r.refund_rate}%`)
    .join('; ')
  const notesStr = normPolicy.refund_notes ? ` (Ghi chú: ${normPolicy.refund_notes})` : ''
  return `Cho phép hoàn vé${rulesStr ? ` — ${rulesStr}` : ''}${notesStr}`
}

function formatSeatingRulesSummaryText(normRules) {
  if (!normRules) return 'Mặc định'
  const parts = [
    `Tối đa ${normRules.max_tickets_per_order || 10} vé/đơn`,
    normRules.require_adjacent_seats ? 'Bắt buộc ghế liền kề' : 'Không bắt buộc ghế liền kề',
    normRules.require_same_row ? 'Bắt buộc cùng hàng' : 'Không bắt buộc cùng hàng',
    normRules.disallow_single_seat_left ? 'Cấm để trống ghế lẻ' : 'Cho phép trống ghế lẻ',
  ]
  return parts.join(' • ')
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function AdminEventReviewDetailPage() {
  const { isEnglish } = useLanguage()
  const { eventId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [confirmState, setConfirmState] = useState(null)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [isCriteriaOpen, setIsCriteriaOpen] = useState(false)
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false)
  const [suspendLoading, setSuspendLoading] = useState(false)
  const [selectedTicketSessionId, setSelectedTicketSessionId] = useState('ALL')
  const [ticketViewMode, setTicketViewMode] = useState('grid') // 'grid' | 'table'
  const [showFullDescDiff, setShowFullDescDiff] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && previewDoc) {
        setPreviewDoc(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewDoc])

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------
  const { data: event, isLoading, isError } = useQuery({
    queryKey: ['admin-event-detail', eventId],
    queryFn: () => fetchAdminEventDetail(eventId),
    enabled: !!eventId,
  })

  // Parse pending revision details (comprehensive diff across all fields, tickets, sessions, tags, description, media, policies)
  const revisionDetails = useMemo(() => {
    const rev = event?.pending_revision
    if (!rev) return null

    const diffList = Array.isArray(rev.diff) ? rev.diff : Array.isArray(rev.proposed_changes) ? rev.proposed_changes : []
    const before = rev.payload_before || {}
    const after = rev.payload_after || {}

    const allSessions = Array.isArray(before.sessions) && before.sessions.length > 0 ? before.sessions : (event?.sessions || [])
    const sessionNameById = new Map(allSessions.map((s, idx) => [String(s.id), s.session_name || `Phiên #${idx + 1}`]))

    // 1. Ticket changes
    const rawTicketChanges = []
    const diffTickets = diffList.filter((d) => d.field === 'ticket_type' || d.field === 'ticket_added' || d.field === 'ticket_removed')

    if (diffTickets.length > 0) {
      diffTickets.forEach((dt) => {
        const sName = dt.event_session_id ? sessionNameById.get(String(dt.event_session_id)) : null
        if (dt.field === 'ticket_type') {
          rawTicketChanges.push({
            id: dt.ticket_id,
            sessionName: sName,
            name: dt.ticket_name || dt.newValue?.name || dt.oldValue?.name || 'Vé',
            typeLabel:
              dt.priceChanged && dt.qtyChanged
                ? 'Đổi giá & số lượng'
                : dt.priceChanged
                  ? 'Đổi giá vé'
                  : dt.qtyChanged
                    ? 'Đổi số lượng'
                    : dt.nameChanged
                      ? 'Đổi tên hạng vé'
                      : dt.descChanged
                        ? 'Đổi mô tả vé'
                        : 'Cập nhật hạng vé',
            priceChanged: Boolean(dt.priceChanged),
            oldPrice: Number(dt.oldPrice ?? dt.oldValue?.price ?? 0),
            newPrice: Number(dt.newPrice ?? dt.newValue?.price ?? 0),
            qtyChanged: Boolean(dt.qtyChanged),
            oldQuantity: Number(dt.oldQuantity ?? dt.oldValue?.quantity ?? 0),
            newQuantity: Number(dt.newQuantity ?? dt.newValue?.quantity ?? 0),
            nameChanged: Boolean(dt.nameChanged),
            oldName: dt.oldValue?.name,
            newName: dt.newValue?.name,
            descChanged: Boolean(dt.descChanged),
            oldDescription: dt.oldValue?.description || '',
            newDescription: dt.newValue?.description || '',
          })
        } else if (dt.field === 'ticket_added') {
          rawTicketChanges.push({
            sessionName: sName,
            name: dt.ticket_name || dt.newValue?.name || 'Vé mới',
            typeLabel: 'Thêm hạng vé mới',
            isAdded: true,
            newPrice: Number(dt.newValue?.price || 0),
            newQuantity: Number(dt.newValue?.quantity || 0),
          })
        } else if (dt.field === 'ticket_removed') {
          rawTicketChanges.push({
            sessionName: sName,
            name: dt.ticket_name || dt.oldValue?.name || 'Vé đã xóa',
            typeLabel: 'Xóa hạng vé',
            isRemoved: true,
            oldPrice: Number(dt.oldValue?.price || 0),
            oldQuantity: Number(dt.oldValue?.quantity || 0),
          })
        }
      })
    } else if (Array.isArray(after.ticket_types)) {
      const beforeTickets = Array.isArray(before.ticket_types) && before.ticket_types.length > 0 ? before.ticket_types : (event?.ticket_types || [])
      const beforeMap = new Map(beforeTickets.map((t) => [t.id, t]))

      after.ticket_types.forEach((att) => {
        const sName = att.event_session_id ? sessionNameById.get(String(att.event_session_id)) : null
        if (att.id && beforeMap.has(att.id)) {
          const btt = beforeMap.get(att.id)
          const priceChanged = att.price !== undefined && Number(att.price) !== Number(btt.price)
          const qtyChanged = att.quantity !== undefined && Number(att.quantity) !== Number(btt.quantity)
          const nameChanged = Boolean(att.name && att.name.trim() !== (btt.name || '').trim())
          const descChanged = att.description !== undefined && String(att.description || '').trim() !== String(btt.description || '').trim()

          if (priceChanged || qtyChanged || nameChanged || descChanged) {
            rawTicketChanges.push({
              id: att.id,
              sessionName: sName,
              name: att.name || btt.name || 'Vé',
              typeLabel:
                priceChanged && qtyChanged
                  ? 'Đổi giá & số lượng'
                  : priceChanged
                    ? 'Đổi giá vé'
                    : qtyChanged
                      ? 'Đổi số lượng'
                      : nameChanged
                        ? 'Đổi tên hạng vé'
                        : 'Cập nhật hạng vé',
              priceChanged,
              oldPrice: Number(btt.price || 0),
              newPrice: Number(att.price ?? btt.price ?? 0),
              qtyChanged,
              oldQuantity: Number(btt.quantity || 0),
              newQuantity: Number(att.quantity ?? btt.quantity ?? 0),
              nameChanged,
              oldName: btt.name,
              newName: att.name,
              descChanged,
              oldDescription: btt.description || '',
              newDescription: att.description || '',
            })
          }
        } else if (!att.id) {
          rawTicketChanges.push({
            sessionName: sName,
            name: att.name || 'Vé mới',
            typeLabel: 'Thêm hạng vé mới',
            isAdded: true,
            newPrice: Number(att.price || 0),
            newQuantity: Number(att.quantity || 0),
          })
        }
      })
    }

    // Group identical ticket changes across multiple sessions for cleaner display
    const ticketGroupMap = new Map()
    rawTicketChanges.forEach((tc) => {
      const gKey = `${tc.name}__${tc.typeLabel}__${tc.oldPrice ?? ''}__${tc.newPrice ?? ''}__${tc.oldQuantity ?? ''}__${tc.newQuantity ?? ''}__${tc.oldName ?? ''}__${tc.newDescription ?? ''}`
      if (!ticketGroupMap.has(gKey)) {
        ticketGroupMap.set(gKey, {
          ...tc,
          sessionsAffected: tc.sessionName ? [tc.sessionName] : [],
        })
      } else if (tc.sessionName) {
        ticketGroupMap.get(gKey).sessionsAffected.push(tc.sessionName)
      }
    })
    const ticketChanges = Array.from(ticketGroupMap.values())

    // 2. Session changes (ONLY sessions that actually changed)
    const sessionChanges = []
    const diffSessions = diffList.filter((d) => d.field?.startsWith('session_') || d.field === 'sessions_added' || d.field === 'session_removed')

    if (diffSessions.length > 0) {
      diffSessions.forEach((ds) => {
        if (ds.field === 'sessions_added') {
          sessionChanges.push({
            name: ds.newValue?.session_name || 'Suất diễn mới',
            typeLabel: 'Thêm suất diễn mới',
            isAdded: true,
            startTime: ds.newValue?.start_time,
            endTime: ds.newValue?.end_time,
          })
        } else if (ds.field === 'session_removed') {
          sessionChanges.push({
            name: ds.oldValue?.session_name || 'Suất diễn đã xóa',
            typeLabel: 'Xóa suất diễn',
            isRemoved: true,
            oldStartTime: ds.oldValue?.start_time,
            oldEndTime: ds.oldValue?.end_time,
          })
        } else if (ds.field?.endsWith('_name')) {
          sessionChanges.push({
            name: String(ds.newValue || 'Suất diễn'),
            oldName: String(ds.oldValue || ''),
            nameChanged: true,
            typeLabel: 'Đổi tên suất diễn',
          })
        } else {
          const oldStart = ds.oldValue?.start_time
          const oldEnd = ds.oldValue?.end_time
          const newStart = ds.newValue?.start_time || oldStart
          const newEnd = ds.newValue?.end_time || oldEnd
          const timeChanged =
            (oldStart && newStart && new Date(oldStart).getTime() !== new Date(newStart).getTime()) ||
            (oldEnd && newEnd && new Date(oldEnd).getTime() !== new Date(newEnd).getTime())
          const nameChanged = Boolean(ds.newValue?.session_name && ds.oldValue?.session_name && ds.newValue.session_name !== ds.oldValue.session_name)
          sessionChanges.push({
            name: ds.newValue?.session_name || ds.oldValue?.session_name || 'Suất diễn',
            oldName: ds.oldValue?.session_name,
            nameChanged,
            timeChanged,
            typeLabel: timeChanged ? 'Đổi thời gian diễn' : 'Điều chỉnh suất diễn',
            startTime: newStart,
            endTime: newEnd,
            oldStartTime: oldStart,
            oldEndTime: oldEnd,
          })
        }
      })
    } else if (Array.isArray(after.sessions) && Array.isArray(before.sessions) && before.sessions.length > 0) {
      const beforeMap = new Map(before.sessions.map((s) => [s.id, s]))
      after.sessions.forEach((as, idx) => {
        if (as.id && beforeMap.has(as.id)) {
          const bs = beforeMap.get(as.id)
          const timeChanged =
            new Date(as.start_time).getTime() !== new Date(bs.start_time).getTime() ||
            new Date(as.end_time).getTime() !== new Date(bs.end_time).getTime()
          const nameChanged = Boolean(as.session_name && as.session_name !== bs.session_name)
          if (timeChanged || nameChanged) {
            sessionChanges.push({
              name: as.session_name || bs.session_name || `Suất #${idx + 1}`,
              oldName: bs.session_name,
              nameChanged,
              timeChanged,
              typeLabel: timeChanged && nameChanged ? 'Đổi tên & thời gian' : timeChanged ? 'Đổi thời gian diễn' : 'Đổi tên suất diễn',
              startTime: as.start_time,
              endTime: as.end_time,
              oldStartTime: bs.start_time,
              oldEndTime: bs.end_time,
            })
          }
        } else if (!as.id) {
          sessionChanges.push({
            name: as.session_name || `Suất #${idx + 1}`,
            typeLabel: 'Thêm suất diễn mới',
            isAdded: true,
            startTime: as.start_time,
            endTime: as.end_time,
          })
        }
      })
      const afterIds = new Set(after.sessions.filter((s) => s.id).map((s) => s.id))
      before.sessions.forEach((bs, idx) => {
        if (bs.id && !afterIds.has(bs.id)) {
          sessionChanges.push({
            name: bs.session_name || `Suất #${idx + 1}`,
            typeLabel: 'Xóa suất diễn',
            isRemoved: true,
            oldStartTime: bs.start_time,
            oldEndTime: bs.end_time,
          })
        }
      })
    }

    // 3. Tag changes (Tags)
    let tagChanges = null
    const rawOldTags = before.tags !== undefined ? before.tags : event?.tags
    const rawNewTags = after.tags !== undefined ? after.tags : diffList.find((d) => d.field === 'tags')?.newValue
    if (rawNewTags !== undefined) {
      const oldTags = Array.isArray(rawOldTags) ? rawOldTags.map((t) => String(t).trim()).filter(Boolean) : []
      const newTags = Array.isArray(rawNewTags) ? rawNewTags.map((t) => String(t).trim()).filter(Boolean) : []
      if (JSON.stringify(oldTags) !== JSON.stringify(newTags)) {
        const oldSet = new Set(oldTags)
        const newSet = new Set(newTags)
        const added = newTags.filter((t) => !oldSet.has(t))
        const removed = oldTags.filter((t) => !newSet.has(t))
        const unchanged = newTags.filter((t) => oldSet.has(t))
        tagChanges = {
          oldTags,
          newTags,
          added,
          removed,
          unchanged,
        }
      }
    }

    // 4. Detailed Description changes (HTML Description)
    let descriptionChange = null
    const oldDesc = String(before.description ?? event?.description ?? '').trim()
    const newDescRaw = after.description !== undefined ? after.description : diffList.find((d) => d.field === 'description')?.newValue
    if (newDescRaw !== undefined) {
      const newDesc = String(newDescRaw ?? '').trim()
      if (oldDesc !== newDesc) {
        const diffData = computeHtmlDescriptionDiff(oldDesc, newDesc)
        descriptionChange = {
          oldHtml: oldDesc,
          newHtml: newDesc,
          ...diffData,
        }
      }
    }

    // 5. Media changes (Banner & Thumbnail)
    const mediaChanges = []
    const checkMediaField = (field, label) => {
      const oldUrl = before[field] !== undefined ? before[field] : event?.[field]
      const newUrl = after[field] !== undefined ? after[field] : diffList.find((d) => d.field === field)?.newValue
      if (newUrl !== undefined && String(oldUrl || '') !== String(newUrl || '')) {
        mediaChanges.push({
          field,
          label,
          oldUrl: oldUrl || null,
          newUrl: newUrl || null,
        })
      }
    }
    checkMediaField('thumbnail_url', 'Ảnh thu nhỏ (Poster / Thumbnail)')
    checkMediaField('banner_url', 'Ảnh bìa sự kiện (Banner)')

    // 6. Text & General Field changes (Title, Short Description, Additional Terms, Format, Visibility, Category, Attendee Info, Refund Policy, Permits, Seating Rules)
    const generalChanges = []

    const checkTextField = (field, label) => {
      const oldVal = String(before[field] ?? event?.[field] ?? '').trim()
      const newRaw = after[field] !== undefined ? after[field] : diffList.find((d) => d.field === field)?.newValue
      if (newRaw !== undefined) {
        const newVal = String(newRaw ?? '').trim()
        if (oldVal !== newVal) {
          generalChanges.push({
            field,
            label,
            kind: 'text',
            oldValue: oldVal || 'Chưa cập nhật',
            newValue: newVal || 'Đã xóa nội dung',
            wordDiff: computeWordDiffTokens(oldVal, newVal),
          })
        }
      }
    }
    checkTextField('title', 'Tiêu đề sự kiện')
    checkTextField('short_description', 'Mô tả ngắn (Tóm tắt)')
    checkTextField('additional_terms', 'Điều khoản bổ sung')

    // Format
    const oldFormat = before.format ?? event?.format
    const newFormat = after.format !== undefined ? after.format : diffList.find((d) => d.field === 'format')?.newValue
    if (newFormat !== undefined && String(oldFormat || '') !== String(newFormat || '')) {
      const fmtMap = { OFFLINE: 'Trực tiếp (Offline)', ONLINE: 'Trực tuyến (Online)', HYBRID: 'Kết hợp (Hybrid)' }
      generalChanges.push({
        field: 'format',
        label: 'Hình thức tổ chức',
        kind: 'badge',
        oldValue: fmtMap[oldFormat] || oldFormat || '—',
        newValue: fmtMap[newFormat] || newFormat || '—',
      })
    }

    // Visibility
    const oldVis = before.visibility ?? event?.visibility
    const newVis = after.visibility !== undefined ? after.visibility : diffList.find((d) => d.field === 'visibility')?.newValue
    if (newVis !== undefined && oldVis !== undefined && String(oldVis || '') !== String(newVis || '')) {
      const visMap = { PUBLIC: 'Công khai (Public)', PRIVATE: 'Riêng tư (Private)', UNLISTED: 'Không công khai (Unlisted)' }
      generalChanges.push({
        field: 'visibility',
        label: 'Chế độ hiển thị',
        kind: 'badge',
        oldValue: visMap[oldVis] || oldVis,
        newValue: visMap[newVis] || newVis,
      })
    }

    // Category
    const oldCat = before.category_id ?? event?.category_id
    const newCat = after.category_id !== undefined ? after.category_id : diffList.find((d) => d.field === 'category_id')?.newValue
    if (newCat !== undefined && String(oldCat || '') !== String(newCat || '')) {
      generalChanges.push({
        field: 'category_id',
        label: 'Danh mục sự kiện',
        kind: 'badge',
        oldValue: before.category_name || event?.category_name || String(oldCat || 'Chưa phân loại'),
        newValue: after.category_name || String(newCat || 'Chưa phân loại'),
      })
    }

    // Require Attendee Info
    const oldReqInfo = before.require_attendee_info ?? event?.require_attendee_info
    const newReqInfo = after.require_attendee_info !== undefined ? after.require_attendee_info : diffList.find((d) => d.field === 'require_attendee_info')?.newValue
    if (newReqInfo !== undefined && oldReqInfo !== undefined && Boolean(oldReqInfo) !== Boolean(newReqInfo)) {
      generalChanges.push({
        field: 'require_attendee_info',
        label: 'Yêu cầu thông tin người tham dự',
        kind: 'badge',
        oldValue: oldReqInfo ? 'Có yêu cầu' : 'Không yêu cầu',
        newValue: newReqInfo ? 'Có yêu cầu' : 'Không yêu cầu',
      })
    }

    // Refund Policy & Permit Files (deep normalized check to prevent JSONB key-order false positives)
    if (after.refund_policy !== undefined || diffList.some((d) => d.field === 'refund_policy' || d.field === 'permit_files')) {
      const oldPolicyNorm = normalizeRefundPolicyForDiff(before.refund_policy ?? event?.refund_policy)
      const newPolicyNorm = normalizeRefundPolicyForDiff(after.refund_policy ?? diffList.find((d) => d.field === 'refund_policy')?.newValue)
      if (JSON.stringify(oldPolicyNorm) !== JSON.stringify(newPolicyNorm)) {
        generalChanges.push({
          field: 'refund_policy',
          label: 'Chính sách hoàn tiền',
          kind: 'policy',
          oldValue: formatRefundSummaryText(oldPolicyNorm),
          newValue: formatRefundSummaryText(newPolicyNorm),
        })
      }

      if (after.refund_policy !== undefined || diffList.some((d) => d.field === 'permit_files')) {
        const oldPermits = normalizePermitFilesForDiff(before.refund_policy ?? event?.refund_policy)
        const newPermits = normalizePermitFilesForDiff(after.refund_policy ?? diffList.find((d) => d.field === 'permit_files')?.newValue)
        if (
          JSON.stringify(oldPermits.map((p) => `${p.url || ''}__${p.name || ''}`)) !==
          JSON.stringify(newPermits.map((p) => `${p.url || ''}__${p.name || ''}`))
        ) {
          generalChanges.push({
            field: 'permit_files',
            label: 'Giấy phép & Tài liệu đính kèm',
            kind: 'policy',
            oldValue: oldPermits.length > 0 ? oldPermits.map((p) => p.name).join(', ') : 'Không có tài liệu',
            newValue: newPermits.length > 0 ? newPermits.map((p) => p.name).join(', ') : 'Không có tài liệu',
          })
        }
      }
    }

    // Seating Rules
    if (after.seating_rules !== undefined || diffList.some((d) => d.field === 'seating_rules')) {
      const oldRules = normalizeSeatingRulesForDiff(before.seating_rules ?? event?.seating_rules)
      const newRules = normalizeSeatingRulesForDiff(after.seating_rules ?? diffList.find((d) => d.field === 'seating_rules')?.newValue)
      if (JSON.stringify(oldRules) !== JSON.stringify(newRules)) {
        generalChanges.push({
          field: 'seating_rules',
          label: 'Quy tắc chọn ghế',
          kind: 'policy',
          oldValue: formatSeatingRulesSummaryText(oldRules),
          newValue: formatSeatingRulesSummaryText(newRules),
        })
      }
    }

    // Build summary pills for quick overview
    const summaryPills = []
    if (tagChanges) {
      const parts = []
      if (tagChanges.added.length > 0) parts.push(`+${tagChanges.added.length} mới`)
      if (tagChanges.removed.length > 0) parts.push(`-${tagChanges.removed.length} xóa`)
      summaryPills.push({
        key: 'tags',
        label: 'Thẻ sự kiện (Tags)',
        badge: parts.join(', ') || 'Cập nhật',
        tone: 'emerald',
      })
    }
    if (descriptionChange) {
      const blockCount = descriptionChange.items?.length || 1
      summaryPills.push({
        key: 'description',
        label: 'Mô tả chi tiết',
        badge: `${blockCount} đoạn chỉnh sửa`,
        tone: 'amber',
      })
    }
    if (ticketChanges.length > 0) {
      summaryPills.push({
        key: 'tickets',
        label: 'Hạng vé',
        badge: `${ticketChanges.length} mục`,
        tone: 'amber',
      })
    }
    if (sessionChanges.length > 0) {
      summaryPills.push({
        key: 'sessions',
        label: 'Suất diễn',
        badge: `${sessionChanges.length} suất`,
        tone: 'indigo',
      })
    }
    if (mediaChanges.length > 0) {
      summaryPills.push({
        key: 'media',
        label: 'Hình ảnh sự kiện',
        badge: `${mediaChanges.length} ảnh`,
        tone: 'purple',
      })
    }
    generalChanges.forEach((gc) => {
      summaryPills.push({
        key: gc.field,
        label: gc.label,
        badge: 'Đã sửa',
        tone: 'blue',
      })
    })

    return {
      ticketChanges,
      sessionChanges,
      tagChanges,
      descriptionChange,
      mediaChanges,
      generalChanges,
      summaryPills,
      submittedAt: rev.submitted_at || null,
      changeClass: rev.change_class || 'MAJOR',
    }
  }, [
    event?.pending_revision,
    event?.ticket_types,
    event?.sessions,
    event?.tags,
    event?.description,
    event?.short_description,
    event?.title,
    event?.format,
    event?.visibility,
    event?.category_id,
    event?.category_name,
    event?.thumbnail_url,
    event?.banner_url,
    event?.refund_policy,
    event?.seating_rules,
    event?.additional_terms,
    event?.require_attendee_info,
  ])

  // Group tickets across sessions with rich session metadata
  const groupedTickets = useMemo(() => {
    if (!Array.isArray(event?.ticket_types) || event.ticket_types.length === 0) return []
    const groups = []
    const rawSessions = Array.isArray(event?.sessions) ? event.sessions : []

    // Map each session with its index, clear title, and time
    const sessionMap = new Map()
    rawSessions.forEach((s, idx) => {
      const sIndex = idx + 1
      const rawName = s.session_name?.trim() || ''
      const hasPrefix = /^phiên\s*\d+/i.test(rawName)
      const cleanName = hasPrefix ? rawName : (rawName ? `Phiên ${sIndex}: ${rawName}` : `Phiên ${sIndex}`)
      const timeStr = formatShortDate(s.start_time)

      sessionMap.set(String(s.id), {
        id: String(s.id),
        index: sIndex,
        rawName,
        displayName: cleanName,
        timeStr,
        start_time: s.start_time,
        end_time: s.end_time,
      })
    })

    const ticketsToGroup = selectedTicketSessionId === 'ALL'
      ? event.ticket_types
      : event.ticket_types.filter((t) => String(t.event_session_id) === String(selectedTicketSessionId))

    ticketsToGroup.forEach((ticket) => {
      const name = ticket?.name?.trim() || 'Vé tiêu chuẩn'
      const price = Number(ticket?.price || 0)
      const isSeated = Boolean(ticket?.is_seated)
      const key = `${name.toLowerCase()}___${price}___${isSeated}`

      let group = groups.find((g) => g.key === key)
      if (!group) {
        group = {
          key,
          name,
          price,
          is_seated: isSeated,
          description: ticket?.description,
          totalQuantity: 0,
          sessions: [],
          uniqueQuantities: new Set(),
        }
        groups.push(group)
      }

      const sSessionId = String(ticket?.event_session_id)
      const existingSession = group.sessions.find((s) => String(s.sessionId) === sSessionId)
      if (existingSession) {
        return
      }

      const qty = Number(ticket?.quantity || 0)
      group.totalQuantity += qty
      group.uniqueQuantities.add(qty)

      const sMeta = sessionMap.get(sSessionId)
      const sessionIndex = sMeta?.index || (group.sessions.length + 1)
      const sessionDisplayName = sMeta?.displayName || `Phiên ${sessionIndex}`
      const sessionTime = sMeta?.timeStr || ''

      group.sessions.push({
        sessionId: ticket?.event_session_id,
        sessionIndex,
        sessionName: sessionDisplayName,
        rawSessionName: sMeta?.rawName || '',
        timeStr: sessionTime,
        quantity: qty,
      })
    })

    // Sort sessions inside each group chronologically by sessionIndex
    groups.forEach((g) => {
      g.sessions.sort((a, b) => a.sessionIndex - b.sessionIndex)
    })

    return groups
  }, [event?.ticket_types, event?.sessions, selectedTicketSessionId])

  const totalTicketsCount = useMemo(() => {
    return groupedTickets.reduce((sum, g) => sum + g.totalQuantity, 0)
  }, [groupedTickets])

  const totalTicketsRevenue = useMemo(() => {
    return groupedTickets.reduce((sum, g) => sum + g.totalQuantity * g.price, 0)
  }, [groupedTickets])

  const [isScanningActive, setIsScanningActive] = useState(() => {
    try {
      return localStorage.getItem(`eh_ai_scanning_${eventId}`) === 'true'
    } catch {
      return false
    }
  })

  // Scan Status Query
  const { data: scanStatus } = useQuery({
    queryKey: ['admin-auto-review-scan-status'],
    queryFn: fetchAdminAutoReviewScanStatus,
    refetchInterval: (query) => (query.state.data?.isRunning || isScanningActive ? 1200 : 4000),
  })

  // AI Review Query - polls every 2s while scanning is active so result loads automatically even after reload
  const aiReviewQuery = useQuery({
    queryKey: ['admin-ai-review', eventId],
    queryFn: () => fetchAdminAiReview(eventId),
    enabled: !!eventId,
    refetchInterval: () => (isScanningActive || scanStatus?.isRunning ? 2000 : false),
  })

  const [isManuallyCancelled, setIsManuallyCancelled] = useState(false)

  // Cancel AI Mutation
  const cancelAiMutation = useMutation({
    mutationFn: cancelAdminAutoReview,
    onSuccess: (res) => {
      toast.success(res.message || 'Đã gửi lệnh dừng tiến trình quét AI.')
      setIsScanningActive(false)
      try { localStorage.removeItem(`eh_ai_scanning_${eventId}`) } catch { }
      queryClient.setQueryData(['admin-auto-review-scan-status'], { isRunning: false })
      queryClient.invalidateQueries({ queryKey: ['admin-auto-review-scan-status'] })
      queryClient.invalidateQueries({ queryKey: ['admin-ai-review', eventId] })
      queryClient.invalidateQueries({ queryKey: ['admin-event-detail', eventId] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể hủy tiến trình quét.'))
    },
  })

  // Run AI Review Mutation
  const runAiMutation = useMutation({
    mutationFn: () => runAdminAiReview(event),
    onSuccess: (data) => {
      setIsScanningActive(false)
      try { localStorage.removeItem(`eh_ai_scanning_${eventId}`) } catch { }
      if (isManuallyCancelled || data?.cancelled) {
        toast.info(data?.message || 'Tiến trình quét đã được dừng theo yêu cầu.')
      } else {
        toast.success('Đã hoàn thành phân tích sự kiện bằng AI!')
        queryClient.setQueryData(['admin-ai-review', eventId], data)
      }
      queryClient.invalidateQueries({ queryKey: ['admin-event-detail', eventId] })
      queryClient.invalidateQueries({ queryKey: ['admin-auto-review-scan-status'] })
    },
    onError: (err) => {
      setIsScanningActive(false)
      try { localStorage.removeItem(`eh_ai_scanning_${eventId}`) } catch { }
      if (isManuallyCancelled) return
      toast.error(err.response?.data?.message || 'Không thể chạy phân tích AI.')
      queryClient.invalidateQueries({ queryKey: ['admin-auto-review-scan-status'] })
    },
  })

  const isScanningThisEvent = Boolean(
    !isManuallyCancelled && (
      runAiMutation.isPending ||
      (scanStatus?.isRunning && (String(scanStatus?.eventId) === String(eventId) || !scanStatus?.eventId)) ||
      (isScanningActive && !aiReviewQuery.data && !event?.aiReview)
    )
  )

  const handleStartAi = () => {
    setIsAiExpanded(true)
    setIsManuallyCancelled(false)
    setIsScanningActive(true)
    try { localStorage.setItem(`eh_ai_scanning_${eventId}`, 'true') } catch { }
    runAiMutation.mutate()
  }

  const handleCancelAi = () => {
    setIsManuallyCancelled(true)
    setIsScanningActive(false)
    try { localStorage.removeItem(`eh_ai_scanning_${eventId}`) } catch { }
    runAiMutation.reset()
    cancelAiMutation.mutate()
    queryClient.setQueryData(['admin-auto-review-scan-status'], { isRunning: false })
  }

  // Detect completion when reloaded or when backend scan ends
  const prevScanningRef = useRef(false)
  useEffect(() => {
    if (prevScanningRef.current && !scanStatus?.isRunning) {
      setIsScanningActive(false)
      try { localStorage.removeItem(`eh_ai_scanning_${eventId}`) } catch { }
      queryClient.invalidateQueries({ queryKey: ['admin-ai-review', eventId] })
      queryClient.invalidateQueries({ queryKey: ['admin-event-detail', eventId] })
    }
    prevScanningRef.current = Boolean(scanStatus?.isRunning && (String(scanStatus?.eventId) === String(eventId) || !scanStatus?.eventId))
  }, [scanStatus?.isRunning, scanStatus?.eventId, eventId, queryClient])

  useEffect(() => {
    if ((aiReviewQuery.data || event?.aiReview) && !runAiMutation.isPending && !scanStatus?.isRunning) {
      setIsScanningActive(false)
      try { localStorage.removeItem(`eh_ai_scanning_${eventId}`) } catch { }
    }
  }, [aiReviewQuery.data, event?.aiReview, runAiMutation.isPending, scanStatus?.isRunning, eventId])

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  const { register, handleSubmit, setValue, getValues, watch } = useForm({
    defaultValues: { review_note: '' },
  })
  const [isNoteExpanded, setIsNoteExpanded] = useState(false)
  const [isAiExpanded, setIsAiExpanded] = useState(true)
  const reviewNoteWatch = watch('review_note') || ''
  const hasNote = Boolean(reviewNoteWatch.trim())
  const noteLinesCount = reviewNoteWatch.split('\n').filter(Boolean).length

  const reviewMutation = useMutation({
    mutationFn: (payload) => reviewAdminEvent(eventId, payload),
    onSuccess: (_, variables) => {
      toast.success(
        variables.status === 'APPROVED'
          ? 'Đã phê duyệt sự kiện.'
          : variables.status === 'REJECTED'
            ? 'Đã từ chối sự kiện.'
            : 'Đã yêu cầu chỉnh sửa.'
      )
      queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      navigate('/admin/events/review')
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Thao tác thất bại.'))
    },
  })

  const [revisionNote, setRevisionNote] = useState('')

  const reviewRevisionMutation = useMutation({
    mutationFn: ({ decision, note }) => reviewAdminEventRevision(eventId, { decision, note }),
    onSuccess: (_, vars) => {
      toast.success(vars.decision === 'APPROVE' ? 'Đã phê duyệt bản sửa đổi thành công!' : 'Đã từ chối bản sửa đổi.')
      setRevisionNote('')
      queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      navigate('/admin/events/review')
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể xử lý bản sửa đổi.'))
    },
  })

  // -------------------------------------------------------------------------
  // Render Loading/Error
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <Page>
        <div className="py-20 text-center text-sm text-subtle">Đang tải dữ liệu sự kiện...</div>
      </Page>
    )
  }

  if (isError || !event) {
    return (
      <Page>
        <div className="py-20 text-center text-error">
          <p>Không thể tải dữ liệu sự kiện hoặc sự kiện không tồn tại.</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-tertiary underline">
            Quay lại
          </button>
        </div>
      </Page>
    )
  }

  // -------------------------------------------------------------------------
  // Derived State / AI Data Resolution
  // -------------------------------------------------------------------------
  const rawAiReview = aiReviewQuery.data || event.aiReview
  const aiData = parseAiReviewData(rawAiReview)

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleWarningClick = (text) => {
    const currentNote = getValues('review_note') || ''
    if (currentNote.trim()) {
      setValue('review_note', `${currentNote}\n- ${text}`)
    } else {
      setValue('review_note', `- ${text}`)
    }
    setIsNoteExpanded(true)
    toast.success('Đã thêm vào ghi chú kiểm duyệt!')
  }

  const handleCopyAllIssues = () => {
    if (!aiData) return
    const lines = []
    if (aiData.critical_violations && aiData.critical_violations.length > 0) {
      lines.push('=== VI PHẠM CHÍNH SÁCH ===')
      aiData.critical_violations.forEach((v) => {
        lines.push(`- [${v.policy_code || 'VI PHẠM'}] ${v.issue || v.message || v}${v.highlighted_text ? ` (Trích dẫn: "${v.highlighted_text}")` : ''}`)
      })
    }
    if (aiData.warnings && aiData.warnings.length > 0) {
      if (lines.length > 0) lines.push('')
      lines.push('=== CẢNH BÁO CẦN LƯU Ý ===')
      aiData.warnings.forEach((w) => {
        lines.push(`- [${w.policy_code || 'LƯU Ý'}] ${w.issue || w.message || w}${w.highlighted_text ? ` (Trích dẫn: "${w.highlighted_text}")` : ''}`)
      })
    }
    if (aiData.suggestions && aiData.suggestions.length > 0) {
      if (lines.length > 0) lines.push('')
      lines.push('=== GỢI Ý ĐIỀU CHỈNH ===')
      aiData.suggestions.forEach((s) => {
        lines.push(`- ${typeof s === 'string' ? s : s.text || JSON.stringify(s)}`)
      })
    }

    if (lines.length === 0) {
      setValue('review_note', 'Sự kiện tuân thủ các điều khoản và chính sách EventHub. Đồng ý phê duyệt.')
    } else {
      setValue('review_note', lines.join('\n'))
    }
    setIsNoteExpanded(true)
    toast.success('Đã sao chép toàn bộ đánh giá AI vào Ghi chú!')
  }

  const onSubmitReview = (status) => {
    return handleSubmit((data) => {
      if (event?.cancel_request?.status === 'PENDING') {
        const isApprove = status === 'APPROVED'
        setConfirmState({
          title: isApprove ? 'Phê duyệt yêu cầu hủy sự kiện' : 'Từ chối yêu cầu hủy sự kiện',
          subtitle: isApprove ? 'Chấp thuận hủy sự kiện và khởi tạo hoàn tiền.' : 'Bác bỏ yêu cầu hủy sự kiện từ Ban tổ chức.',
          eventTitle: event?.title,
          description: isApprove
            ? 'Sự kiện sẽ chuyển sang trạng thái ĐÃ HỦY và hệ thống sẽ tự động tạo danh sách yêu cầu hoàn tiền cho toàn bộ đơn hàng đã thanh toán.'
            : 'Yêu cầu hủy sự kiện sẽ bị từ chối. Sự kiện sẽ gỡ bỏ hạn chế bán vé do yêu cầu hủy và trở lại hoạt động bình thường.',
          tone: isApprove ? 'danger' : 'neutral',
          confirmText: isApprove ? 'Xác nhận duyệt hủy' : 'Từ chối yêu cầu',
          cancelText: 'Hủy bỏ',
          confirmColor: isApprove ? 'bg-error' : 'bg-subtle',
          onConfirm: async () => {
            try {
              if (isApprove) {
                await approveCancellationRequest(eventId, { decision: 'APPROVE', note: data.review_note?.trim() || null })
                toast.success('Đã phê duyệt yêu cầu hủy sự kiện. Danh sách hoàn tiền đã được tạo.')
              } else {
                await approveCancellationRequest(eventId, { decision: 'REJECT', rejection_reason: data.review_note?.trim() || 'Admin từ chối yêu cầu hủy' })
                toast.info('Đã từ chối yêu cầu hủy sự kiện.')
              }
              setConfirmState(null)
              queryClient.invalidateQueries({ queryKey: ['admin-events'] })
              navigate('/admin/events/review')
            } catch (err) {
              toast.error(getApiMessage(err, 'Không thể xử lý yêu cầu hủy sự kiện.'))
            }
          }
        })
        return
      }

      if (event?.pending_revision) {
        const decision = status === 'APPROVED' ? 'APPROVE' : 'REJECT'
        setConfirmState({
          title: decision === 'APPROVE' ? 'Phê duyệt sửa đổi sự kiện' : 'Từ chối bản sửa đổi',
          subtitle: decision === 'APPROVE' ? 'Áp dụng các thay đổi mới vào sự kiện trực tiếp.' : 'Giữ nguyên cấu hình sự kiện hiện tại.',
          eventTitle: event?.title,
          description: decision === 'APPROVE'
            ? 'Toàn bộ nội dung chỉnh sửa đề xuất từ Ban tổ chức sẽ được áp dụng chính thức vào sự kiện và mở lại bán vé (nếu đang tạm dừng).'
            : 'Bản đề xuất sửa đổi sẽ bị từ chối và lưu vào lịch sử kiểm duyệt. Cấu hình sự kiện hiện tại sẽ được giữ nguyên.',
          tone: decision === 'APPROVE' ? 'gold' : 'danger',
          confirmText: decision === 'APPROVE' ? 'Phê duyệt sửa đổi' : 'Từ chối sửa đổi',
          cancelText: 'Hủy bỏ',
          confirmColor: decision === 'APPROVE' ? undefined : 'bg-error',
          onConfirm: () => {
            reviewRevisionMutation.mutate({ decision, note: data.review_note?.trim() || null })
            setConfirmState(null)
          }
        })
        return
      }

      if (status === 'APPROVED') {
        setConfirmState({
          title: 'Xác nhận phê duyệt',
          description: 'Bạn có chắc chắn muốn phê duyệt sự kiện này?',
          tone: 'gold',
          confirmText: 'Phê duyệt',
          cancelText: 'Hủy bỏ',
          onConfirm: () => {
            reviewMutation.mutate({
              status,
              review_note: data.review_note?.trim() || null,
            })
            setConfirmState(null)
          }
        })
      } else {
        setConfirmState({
          title: 'Xác nhận từ chối',
          description: 'Bạn có chắc chắn muốn từ chối sự kiện này? Vui lòng đảm bảo đã nhập lý do.',
          confirmText: 'Từ chối',
          confirmColor: 'bg-error',
          onConfirm: () => {
            reviewMutation.mutate({
              status,
              review_note: data.review_note?.trim() || null,
            })
            setConfirmState(null)
          }
        })
      }
    })()
  }

  const handleApproveCancelRequest = async () => {
    try {
      await approveCancellationRequest(eventId, { decision: 'APPROVE' })
      toast.success('Đã phê duyệt hủy sự kiện. Danh sách hoàn tiền đã được tạo tự động.')
      queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      queryClient.invalidateQueries({ queryKey: ['admin-event-detail', eventId] })
      navigate('/admin/events/review')
    } catch (err) {
      toast.error(getApiMessage(err, 'Không thể phê duyệt yêu cầu hủy.'))
    }
  }

  const handleRejectCancelRequest = async () => {
    const reason = window.prompt('Nhập lý do từ chối yêu cầu hủy sự kiện:')
    if (!reason?.trim()) return
    try {
      await approveCancellationRequest(eventId, { decision: 'REJECT', rejection_reason: reason.trim() })
      toast.info('Đã từ chối yêu cầu hủy sự kiện.')
      queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      queryClient.invalidateQueries({ queryKey: ['admin-event-detail', eventId] })
      navigate('/admin/events/review')
    } catch (err) {
      toast.error(getApiMessage(err, 'Không thể từ chối yêu cầu hủy.'))
    }
  }

  const handleConfirmSuspend = async ({ reason, note }) => {
    setSuspendLoading(true)
    try {
      await suspendAdminEvent(eventId, { reason, note })
      toast.success('Đã đình chỉ sự kiện. Sự kiện đã bị ẩn và tạm dừng bán vé.')
      setIsSuspendModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      queryClient.invalidateQueries({ queryKey: ['admin-event-detail', eventId] })
    } catch (err) {
      toast.error(getApiMessage(err, 'Không thể đình chỉ sự kiện.'))
    } finally {
      setSuspendLoading(false)
    }
  }

  const handleSuspendEvent = () => {
    setIsSuspendModalOpen(true)
  }

  const handleUnsuspendEvent = () => {
    setConfirmState({
      title: 'Gỡ đình chỉ sự kiện',
      subtitle: 'Khôi phục hiển thị và quyền mở bán vé.',
      eventTitle: event?.title,
      description: `Bạn có chắc chắn muốn gỡ lệnh đình chỉ cho sự kiện "${event?.title}"? Sự kiện sẽ được hiển thị trở lại và Ban tổ chức có thể tiếp tục mở bán vé bình thường.`,
      tone: 'success',
      confirmText: 'Xác nhận gỡ đình chỉ',
      cancelText: 'Hủy bỏ',
      onConfirm: async () => {
        try {
          await unsuspendAdminEvent(eventId)
          toast.success('Đã hủy đình chỉ sự kiện.')
          setConfirmState(null)
          queryClient.invalidateQueries({ queryKey: ['admin-events'] })
          queryClient.invalidateQueries({ queryKey: ['admin-event-detail', eventId] })
        } catch (err) {
          toast.error(getApiMessage(err, 'Không thể hủy đình chỉ sự kiện.'))
        }
      },
    })
  }


  const handleReviewRevision = (decision) => {
    if (decision === 'APPROVE') {
      setConfirmState({
        title: 'Phê duyệt sửa đổi sự kiện',
        subtitle: 'Áp dụng các thay đổi mới vào sự kiện trực tiếp.',
        eventTitle: event?.title,
        description: 'Toàn bộ nội dung chỉnh sửa đề xuất từ Ban tổ chức sẽ được áp dụng chính thức vào sự kiện và mở lại bán vé (nếu đang tạm dừng).',
        tone: 'gold',
        confirmText: 'Xác nhận duyệt sửa đổi',
        cancelText: 'Hủy bỏ',
        onConfirm: () => {
          reviewRevisionMutation.mutate({ decision: 'APPROVE', note: revisionNote.trim() || null })
          setConfirmState(null)
        },
      })
    } else {
      setConfirmState({
        title: 'Từ chối bản sửa đổi',
        subtitle: 'Giữ nguyên cấu hình sự kiện hiện tại.',
        eventTitle: event?.title,
        description: 'Bản đề xuất sửa đổi sẽ bị từ chối và lưu vào lịch sử kiểm duyệt. Cấu hình sự kiện hiện tại sẽ được giữ nguyên.',
        tone: 'danger',
        confirmText: 'Từ chối sửa đổi',
        cancelText: 'Hủy bỏ',
        onConfirm: () => {
          reviewRevisionMutation.mutate({ decision: 'REJECT', note: revisionNote.trim() || null })
          setConfirmState(null)
        },
      })
    }
  }

  const isPending = reviewMutation.isPending || reviewRevisionMutation.isPending
  const isPendingReview = event?.status === 'PENDING_REVIEW' || Boolean(event?.pending_revision)
  const customScrollbar = "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20"

  // If this event has a cancellation request or is cancelled, render the dedicated cancellation review page
  if (event?.cancel_request?.status === 'PENDING' || event?.status === 'CANCELLED') {
    return <AdminEventCancellationDetailPage />
  }

  const totalIssuesCount = (aiData?.critical_violations?.length || 0) + (aiData?.warnings?.length || 0)

  return (
    <div className={`space-y-4 pb-8 ${!isPendingReview ? 'max-w-5xl mx-auto' : ''}`}>
      {/* Top Header - Tách hoàn toàn ra ngoài khung lớn, không viền khung bọc */}
      <div className="flex shrink-0 items-center justify-between gap-4 px-1 py-1">
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 sm:gap-3.5 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/admin/events/review')}
            className="grid size-9 sm:size-10 shrink-0 place-items-center rounded-full bg-white/5 text-slate-300 transition hover:bg-white/15 hover:text-white border border-white/10 shadow-sm cursor-pointer [html.light_&]:bg-white [html.light_&]:border-slate-300 [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:bg-slate-100"
            title="Quay lại danh sách duyệt sự kiện"
          >
            <ArrowLeft className="size-4 sm:size-5" />
          </button>
          <h1 className="font-display text-base sm:text-xl font-black text-white drop-shadow-sm line-clamp-2 max-w-2xl [html.light_&]:text-[#0D1B2A]">
            {isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title}
          </h1>
          {event.status === 'CANCELLED' ? (
            <Badge tone="red">Đã hủy</Badge>
          ) : event.cancel_request?.status === 'PENDING' ? (
            <Badge tone="red">Chờ duyệt hủy</Badge>
          ) : event.display_state === 'SUSPENDED_BY_ADMIN' ? (
            <Badge tone="red">Bị đình chỉ</Badge>
          ) : event.pending_revision && event.pending_revision.status === 'SUBMITTED' ? (
            <Badge tone="purple">Sửa đổi chờ duyệt</Badge>
          ) : event.sales_status === 'PAUSED' ? (
            <Badge tone="amber">Tạm dừng bán vé</Badge>
          ) : (
            <StatusBadge status={event.status} />
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {event.display_state === 'SUSPENDED_BY_ADMIN' && (
            <button
              type="button"
              onClick={handleUnsuspendEvent}
              className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition cursor-pointer"
            >
              Mở lại đình chỉ
            </button>
          )}
        </div>
      </div>

      {/* Main Split Screen */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Column: Event Details */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          {/* Cancellation Request Banner */}
          {event.cancel_request?.status === 'PENDING' && (
            <div className="mb-6 rounded-xl border border-rose-500/30 bg-[#141b2d] p-5 shadow-sm [html.light_&]:bg-rose-50/70 [html.light_&]:border-rose-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20">
                    <ShieldAlert className="size-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">Yêu cầu hủy sự kiện từ Ban tổ chức</h3>
                      <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-rose-300 border border-rose-500/25">
                        Chờ duyệt hủy
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 [html.light_&]:text-slate-600 mt-1 leading-relaxed">
                      Sự kiện này đang có yêu cầu hủy và tạm dừng bán vé.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/admin/events/cancellations/${eventId}`)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-semibold text-white transition cursor-pointer"
                >
                  <CalendarX className="size-4" />
                  <span>Trang duyệt hủy</span>
                  <ExternalLink className="size-3.5" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-black/20 p-3 rounded-lg border border-white/5 [html.light_&]:bg-white [html.light_&]:border-rose-100">
                <div>
                  <span className="text-slate-400 [html.light_&]:text-slate-600 font-medium">Lý do hủy:</span>{' '}
                  <strong className="text-white [html.light_&]:text-[#0D1B2A]">
                    {event.cancel_request.reason_code === 'FORCE_MAJEURE' ? 'Bất khả kháng (Thiên tai, dịch bệnh, pháp lý)' : 'Lý do từ Ban tổ chức (Kế hoạch, lịch trình, tài chính)'}
                  </strong>
                </div>
                {event.cancel_request.refund_mode && (
                  <div>
                    <span className="text-slate-400 [html.light_&]:text-slate-600 font-medium">Phương thức hoàn tiền:</span>{' '}
                    <strong className="text-white [html.light_&]:text-[#0D1B2A]">
                      {event.cancel_request.refund_mode === 'MODE_A' ? (isEnglish ? 'Automatic via payOS' : 'Tự động qua payOS') : (isEnglish ? 'Manual transfer VietQR' : 'Chuyển khoản thủ công VietQR')}
                    </strong>
                  </div>
                )}
                <div className="md:col-span-2">
                  <span className="text-slate-400 [html.light_&]:text-slate-600 font-medium">{isEnglish ? 'Explanation:' : 'Giải trình:'}</span>
                  <p className="mt-1 text-slate-300 bg-white/[0.03] p-2 rounded border border-white/5 italic [html.light_&]:bg-rose-100/40 [html.light_&]:border-rose-200 [html.light_&]:text-[#0D1B2A]">
                    "{event.cancel_request.reason_note || event.cancel_request.note || event.cancel_request.reason || (isEnglish ? 'No detailed explanation' : 'Không có giải trình chi tiết')}"
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Pending Revision Banner */}
          {event.pending_revision && (
            <div className="mb-6 rounded-2xl border border-amber-500/25 bg-gradient-to-b from-[#141f3d]/95 to-[#0f172e]/95 p-4 sm:p-6 shadow-[0_12px_36px_rgba(0,0,0,0.35)] [html.light_&]:from-white [html.light_&]:to-slate-50/90 [html.light_&]:border-[#C99A47]/40 [html.light_&]:shadow-md">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10 [html.light_&]:border-slate-200">
                <div className="flex items-start gap-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-inner [html.light_&]:bg-amber-50 [html.light_&]:text-amber-700 [html.light_&]:border-amber-300">
                    <Sparkles className="size-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-white [html.light_&]:text-[#0D1B2A]">
                        Bản sửa đổi sự kiện chờ duyệt
                      </h3>
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300 border border-amber-500/25 [html.light_&]:bg-amber-100 [html.light_&]:text-amber-800 [html.light_&]:border-amber-300">
                        {revisionDetails?.summaryPills?.length || 0} hạng mục thay đổi
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 [html.light_&]:text-slate-600 mt-1">
                      Ban tổ chức đã gửi đề xuất chỉnh sửa sự kiện. Các nội dung thay đổi được đối chiếu chi tiết <strong className="text-rose-300 [html.light_&]:text-rose-700">Trước khi sửa</strong> và <strong className="text-emerald-300 [html.light_&]:text-emerald-700">Sau khi sửa</strong> bên dưới.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {revisionDetails?.submittedAt && (
                    <span className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300 border border-white/10 [html.light_&]:bg-slate-100 [html.light_&]:text-slate-700 [html.light_&]:border-slate-200">
                      Gửi lúc: <strong className="text-white [html.light_&]:text-[#0D1B2A]">{formatDate(revisionDetails.submittedAt)}</strong>
                    </span>
                  )}
                  <span className="rounded-full bg-purple-500/15 px-3 py-1 text-[11px] font-bold text-purple-300 border border-purple-500/30 shrink-0 [html.light_&]:bg-purple-50 [html.light_&]:text-purple-800 [html.light_&]:border-purple-200">
                    Chờ duyệt sửa đổi
                  </span>
                </div>
              </div>

              {/* Summary Pills Bar */}
              {revisionDetails?.summaryPills && revisionDetails.summaryPills.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-black/30 px-3.5 py-2.5 border border-white/5 [html.light_&]:bg-slate-100/80 [html.light_&]:border-slate-200">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-slate-600 mr-1">
                    Tóm tắt chỉnh sửa:
                  </span>
                  {revisionDetails.summaryPills.map((pill) => (
                    <span
                      key={pill.key}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] border border-white/10 px-2.5 py-1 text-xs font-semibold text-white [html.light_&]:bg-white [html.light_&]:text-[#0D1B2A] [html.light_&]:border-slate-300 shadow-xs"
                    >
                      <span className="size-1.5 rounded-full bg-amber-400" />
                      <span>{pill.label}</span>
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-300 border border-amber-500/25 [html.light_&]:bg-amber-50 [html.light_&]:text-amber-800 [html.light_&]:border-amber-200">
                        {pill.badge}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {/* Proposed Changes Detailed Cards */}
              <div className="mt-4 space-y-4">
                {/* 1. TAGS DIFF CARD */}
                {revisionDetails?.tagChanges && (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-3.5 [html.light_&]:bg-white [html.light_&]:border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5 [html.light_&]:border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-700 [html.light_&]:border-emerald-200">
                          <Tag className="size-3.5" />
                        </span>
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                            Thẻ sự kiện (Tags)
                          </h4>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                        {revisionDetails.tagChanges.added.length > 0 && (
                          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-emerald-300 [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-700 [html.light_&]:border-emerald-200">
                            +{revisionDetails.tagChanges.added.length} thẻ mới
                          </span>
                        )}
                        {revisionDetails.tagChanges.removed.length > 0 && (
                          <span className="rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-rose-300 [html.light_&]:bg-rose-50 [html.light_&]:text-rose-700 [html.light_&]:border-rose-200">
                            -{revisionDetails.tagChanges.removed.length} thẻ đã xóa
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Highlighted Added / Removed Tags */}
                    {(revisionDetails.tagChanges.added.length > 0 || revisionDetails.tagChanges.removed.length > 0) && (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.03] p-3 border border-white/5 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 [html.light_&]:text-slate-600 mr-1">
                          Chi tiết thay đổi:
                        </span>
                        {revisionDetails.tagChanges.added.map((t) => (
                          <span
                            key={`add-${t}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 px-3 py-1 text-xs font-bold text-emerald-300 shadow-xs [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-800 [html.light_&]:border-emerald-300"
                          >
                            <Plus className="size-3 stroke-[2.5]" />
                            <span>#{t}</span>
                            <span className="text-[10px] font-medium opacity-80">(Mới thêm)</span>
                          </span>
                        ))}
                        {revisionDetails.tagChanges.removed.map((t) => (
                          <span
                            key={`rem-${t}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 border border-rose-500/35 px-3 py-1 text-xs font-bold text-rose-300 shadow-xs [html.light_&]:bg-rose-50 [html.light_&]:text-rose-800 [html.light_&]:border-rose-300"
                          >
                            <X className="size-3 stroke-[2.5]" />
                            <span className="line-through">#{t}</span>
                            <span className="text-[10px] font-medium opacity-80">(Đã xóa)</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Before vs After Tag Sets */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2 [html.light_&]:bg-slate-50/70 [html.light_&]:border-slate-200">
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-slate-600">
                          <span>Trước khi sửa</span>
                          <span>{revisionDetails.tagChanges.oldTags.length} thẻ</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {revisionDetails.tagChanges.oldTags.length > 0 ? (
                            revisionDetails.tagChanges.oldTags.map((t) => {
                              const isRemoved = revisionDetails.tagChanges.removed.includes(t)
                              return (
                                <span
                                  key={`old-${t}`}
                                  className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium border ${
                                    isRemoved
                                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30 line-through [html.light_&]:bg-rose-50 [html.light_&]:text-rose-700 [html.light_&]:border-rose-200'
                                      : 'bg-white/5 text-slate-300 border-white/10 [html.light_&]:bg-white [html.light_&]:text-slate-700 [html.light_&]:border-slate-200'
                                  }`}
                                >
                                  #{t}
                                </span>
                              )
                            })
                          ) : (
                            <span className="text-slate-500 italic">Chưa có thẻ nào</span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.03] p-3 space-y-2 [html.light_&]:bg-emerald-50/40 [html.light_&]:border-emerald-200">
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-emerald-300 [html.light_&]:text-emerald-700">
                          <span>Sau khi sửa (Đề xuất mới)</span>
                          <span>{revisionDetails.tagChanges.newTags.length} thẻ</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {revisionDetails.tagChanges.newTags.length > 0 ? (
                            revisionDetails.tagChanges.newTags.map((t) => {
                              const isAdded = revisionDetails.tagChanges.added.includes(t)
                              return (
                                <span
                                  key={`new-${t}`}
                                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs border ${
                                    isAdded
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold shadow-xs [html.light_&]:bg-emerald-100 [html.light_&]:text-emerald-800 [html.light_&]:border-emerald-300'
                                      : 'bg-white/5 text-slate-200 border-white/10 font-medium [html.light_&]:bg-white [html.light_&]:text-slate-700 [html.light_&]:border-slate-200'
                                  }`}
                                >
                                  {isAdded && <Plus className="size-3" />}
                                  <span>#{t}</span>
                                </span>
                              )
                            })
                          ) : (
                            <span className="text-slate-500 italic">Đã xóa toàn bộ thẻ</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. DETAILED DESCRIPTION DIFF CARD */}
                {revisionDetails?.descriptionChange && (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-3.5 [html.light_&]:bg-white [html.light_&]:border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5 [html.light_&]:border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/25 [html.light_&]:bg-amber-50 [html.light_&]:text-amber-700 [html.light_&]:border-amber-200">
                          <FileText className="size-3.5" />
                        </span>
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                            Mô tả chi tiết sự kiện
                          </h4>
                          <p className="text-[11px] text-slate-400 [html.light_&]:text-slate-500">
                            {revisionDetails.descriptionChange.items?.length > 0
                              ? `Phát hiện ${revisionDetails.descriptionChange.items.length} vị trí thay đổi nội dung / định dạng trên tổng số ${revisionDetails.descriptionChange.totalNewBlocks} đoạn.`
                              : 'Cập nhật định dạng HTML mô tả sự kiện.'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowFullDescDiff((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition cursor-pointer [html.light_&]:bg-slate-100 [html.light_&]:border-slate-300 [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:bg-slate-200"
                      >
                        <Eye className="size-3.5" />
                        <span>{showFullDescDiff ? 'Thu gọn toàn văn' : 'So sánh toàn bộ mô tả (Trước & Sau)'}</span>
                        {showFullDescDiff ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                      </button>
                    </div>

                    {/* Specific Changed Blocks List */}
                    {revisionDetails.descriptionChange.items && revisionDetails.descriptionChange.items.length > 0 ? (
                      <div className="space-y-3">
                        {revisionDetails.descriptionChange.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2.5 [html.light_&]:bg-slate-50/70 [html.light_&]:border-slate-200"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300 [html.light_&]:bg-slate-200 [html.light_&]:text-slate-700">
                                  Đoạn #{item.blockNumber}
                                </span>
                                {item.type === 'TEXT_CHANGE' && (
                                  <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 [html.light_&]:bg-amber-50 [html.light_&]:text-amber-800 [html.light_&]:border-amber-200">
                                    Chỉnh sửa nội dung văn bản
                                  </span>
                                )}
                                {item.type === 'FORMAT_CHANGE' && (
                                  <span className="rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold text-indigo-300 [html.light_&]:bg-indigo-50 [html.light_&]:text-indigo-800 [html.light_&]:border-indigo-200">
                                    Thay đổi định dạng trình bày: {item.formatSummary}
                                  </span>
                                )}
                                {item.type === 'ADDED_BLOCK' && (
                                  <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-800 [html.light_&]:border-emerald-200">
                                    Thêm đoạn nội dung mới ({item.newBlock.tagLabel})
                                  </span>
                                )}
                                {item.type === 'REMOVED_BLOCK' && (
                                  <span className="rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-[10px] font-bold text-rose-300 [html.light_&]:bg-rose-50 [html.light_&]:text-rose-800 [html.light_&]:border-rose-200">
                                    Xóa đoạn nội dung ({item.oldBlock.tagLabel})
                                  </span>
                                )}
                              </div>
                              {item.type === 'TEXT_CHANGE' && item.formatSummary && (
                                <span className="text-[11px] font-medium text-indigo-300 [html.light_&]:text-indigo-700">
                                  Định dạng: {item.formatSummary}
                                </span>
                              )}
                            </div>

                            {item.type === 'TEXT_CHANGE' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed">
                                <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-3 space-y-1.5 [html.light_&]:bg-rose-50/50 [html.light_&]:border-rose-200">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300 [html.light_&]:text-rose-700">
                                    Trước khi sửa ({item.oldBlock.tagLabel})
                                  </div>
                                  <div className="text-slate-300 [html.light_&]:text-slate-700 break-words">
                                    {item.wordDiff.oldTokens.map((tok, tIdx) =>
                                      tok.type === 'removed' ? (
                                        <span
                                          key={tIdx}
                                          className="bg-rose-500/25 text-rose-200 line-through px-1 py-0.5 rounded font-semibold [html.light_&]:bg-rose-200/80 [html.light_&]:text-rose-900"
                                        >
                                          {tok.text}
                                        </span>
                                      ) : (
                                        <span key={tIdx}>{tok.text}</span>
                                      )
                                    )}
                                  </div>
                                </div>

                                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3 space-y-1.5 [html.light_&]:bg-emerald-50/50 [html.light_&]:border-emerald-200">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 [html.light_&]:text-emerald-700">
                                    Sau khi sửa ({item.newBlock.tagLabel})
                                  </div>
                                  <div className="text-slate-200 [html.light_&]:text-[#0D1B2A] break-words">
                                    {item.wordDiff.newTokens.map((tok, tIdx) =>
                                      tok.type === 'added' ? (
                                        <span
                                          key={tIdx}
                                          className="bg-emerald-500/25 text-emerald-200 px-1 py-0.5 rounded font-bold border-b border-emerald-400/50 [html.light_&]:bg-emerald-200/80 [html.light_&]:text-emerald-950"
                                        >
                                          {tok.text}
                                        </span>
                                      ) : (
                                        <span key={tIdx}>{tok.text}</span>
                                      )
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {item.type === 'FORMAT_CHANGE' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed">
                                <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-1.5 [html.light_&]:bg-white [html.light_&]:border-slate-200">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-slate-600">
                                    Trước khi sửa — {item.oldBlock.tagLabel}
                                  </div>
                                  <div className="text-slate-300 [html.light_&]:text-slate-700">
                                    {item.oldBlock.tag === 'li' ? `• ${item.oldBlock.text}` : item.oldBlock.text}
                                  </div>
                                </div>

                                <div className="rounded-lg border border-indigo-500/25 bg-indigo-500/[0.05] p-3 space-y-1.5 [html.light_&]:bg-indigo-50/40 [html.light_&]:border-indigo-200">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 [html.light_&]:text-indigo-700">
                                    Sau khi sửa — {item.newBlock.tagLabel}
                                  </div>
                                  <div className="text-white font-medium [html.light_&]:text-[#0D1B2A] flex items-start gap-2">
                                    {item.newBlock.tag === 'li' && (
                                      <span className="text-emerald-400 font-black mt-0.5">•</span>
                                    )}
                                    <span>{item.newBlock.text}</span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {item.type === 'ADDED_BLOCK' && (
                              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] p-3 text-xs text-emerald-200 [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-900 [html.light_&]:border-emerald-200">
                                {item.newBlock.tag === 'li' ? `• ${item.newBlock.text}` : item.newBlock.text}
                              </div>
                            )}

                            {item.type === 'REMOVED_BLOCK' && (
                              <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.05] p-3 text-xs text-rose-200 line-through [html.light_&]:bg-rose-50 [html.light_&]:text-rose-900 [html.light_&]:border-rose-200">
                                {item.oldBlock.tag === 'li' ? `• ${item.oldBlock.text}` : item.oldBlock.text}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-slate-300 [html.light_&]:bg-slate-50 [html.light_&]:text-slate-700">
                        Nội dung văn bản chính giữ nguyên, chỉ chuẩn hóa khoảng trắng hoặc định dạng HTML. Nhấn <strong>"So sánh toàn bộ mô tả"</strong> để đối chiếu trực tiếp.
                      </div>
                    )}

                    {/* Expandable Full HTML Side-by-Side Comparison */}
                    {showFullDescDiff && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-white/10 [html.light_&]:border-slate-200">
                        <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-2 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                          <div className="text-xs font-bold uppercase tracking-wider text-rose-300 [html.light_&]:text-rose-700 border-b border-white/10 pb-2 [html.light_&]:border-slate-200">
                            Bản mô tả hiện tại (Trước khi sửa)
                          </div>
                          <div
                            className={`max-h-96 overflow-y-auto pr-2 prose prose-xs prose-invert max-w-none text-slate-300 break-words [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [html.light_&]:prose-neutral [html.light_&]:text-slate-700 ${customScrollbar}`}
                            dangerouslySetInnerHTML={{ __html: revisionDetails.descriptionChange.oldHtml || '<em>Trống</em>' }}
                          />
                        </div>

                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-4 space-y-2 [html.light_&]:bg-emerald-50/30 [html.light_&]:border-emerald-200">
                          <div className="text-xs font-bold uppercase tracking-wider text-emerald-300 [html.light_&]:text-emerald-700 border-b border-emerald-500/20 pb-2 [html.light_&]:border-emerald-200">
                            Bản mô tả đề xuất mới (Sau khi sửa)
                          </div>
                          <div
                            className={`max-h-96 overflow-y-auto pr-2 prose prose-xs prose-invert max-w-none text-slate-200 break-words [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [html.light_&]:prose-neutral [html.light_&]:text-[#0D1B2A] ${customScrollbar}`}
                            dangerouslySetInnerHTML={{ __html: revisionDetails.descriptionChange.newHtml || '<em>Trống</em>' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. MEDIA CHANGES (THUMBNAIL / BANNER) */}
                {revisionDetails?.mediaChanges && revisionDetails.mediaChanges.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-3.5 [html.light_&]:bg-white [html.light_&]:border-slate-200">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-2.5 [html.light_&]:border-slate-200">
                      <span className="grid size-7 place-items-center rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/25">
                        <ImageIcon className="size-3.5" />
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                        Thay đổi hình ảnh sự kiện ({revisionDetails.mediaChanges.length})
                      </h4>
                    </div>
                    <div className="grid gap-4">
                      {revisionDetails.mediaChanges.map((mc) => (
                        <div key={mc.field} className="space-y-2">
                          <p className="text-xs font-semibold text-slate-300 [html.light_&]:text-slate-700">{mc.label}:</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 space-y-2 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-slate-600 block">
                                Ảnh hiện tại
                              </span>
                              {mc.oldUrl ? (
                                <img src={mc.oldUrl} alt="Old media" className="h-36 w-full rounded-lg object-cover border border-white/10" />
                              ) : (
                                <div className="h-36 grid place-items-center text-xs text-slate-500 italic">Chưa có ảnh</div>
                              )}
                            </div>
                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-2.5 space-y-2 [html.light_&]:bg-emerald-50/40 [html.light_&]:border-emerald-200">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 [html.light_&]:text-emerald-700 block">
                                Ảnh đề xuất mới
                              </span>
                              {mc.newUrl ? (
                                <img src={mc.newUrl} alt="New media" className="h-36 w-full rounded-lg object-cover border border-emerald-500/30" />
                              ) : (
                                <div className="h-36 grid place-items-center text-xs text-rose-400 italic">Đã gỡ ảnh</div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. TICKET CHANGES */}
                {revisionDetails?.ticketChanges && revisionDetails.ticketChanges.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-3 [html.light_&]:bg-white [html.light_&]:border-slate-200">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2.5 [html.light_&]:border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/25">
                          <Ticket className="size-3.5" />
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                          Thay đổi cơ cấu hạng vé ({revisionDetails.ticketChanges.length})
                        </h4>
                      </div>
                    </div>
                    <div className="grid gap-2.5">
                      {revisionDetails.ticketChanges.map((tc, idx) => (
                        <div key={tc.id || idx} className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs space-y-2 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-white [html.light_&]:text-[#0D1B2A] text-sm">{tc.name}</span>
                              {tc.nameChanged && tc.oldName && (
                                <span className="text-[11px] text-rose-300 line-through [html.light_&]:text-rose-700">
                                  {tc.oldName}
                                </span>
                              )}
                              {tc.sessionsAffected && tc.sessionsAffected.length > 0 && (
                                <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300 border border-indigo-500/25 [html.light_&]:bg-indigo-50 [html.light_&]:text-indigo-700 [html.light_&]:border-indigo-200">
                                  {tc.sessionsAffected.length > 2
                                    ? `Áp dụng cho ${tc.sessionsAffected.length} phiên diễn`
                                    : tc.sessionsAffected.join(', ')}
                                </span>
                              )}
                            </div>
                            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/25 [html.light_&]:bg-amber-50 [html.light_&]:text-amber-800 [html.light_&]:border-amber-200">
                              {tc.typeLabel}
                            </span>
                          </div>
                          {tc.priceChanged && (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 [html.light_&]:text-slate-600">Đơn giá vé:</span>
                              <span className="text-rose-300 line-through [html.light_&]:text-rose-700">
                                {tc.oldPrice.toLocaleString('vi-VN')} đ
                              </span>
                              <span className="text-slate-400 font-bold">→</span>
                              <span className="text-emerald-400 font-bold text-sm [html.light_&]:text-emerald-700">
                                {tc.newPrice.toLocaleString('vi-VN')} đ
                              </span>
                            </div>
                          )}
                          {tc.qtyChanged && (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 [html.light_&]:text-slate-600">Số lượng vé mở bán:</span>
                              <span className="text-rose-300 line-through [html.light_&]:text-rose-700">
                                {tc.oldQuantity.toLocaleString('vi-VN')} vé
                              </span>
                              <span className="text-slate-400 font-bold">→</span>
                              <span className="text-emerald-300 [html.light_&]:text-emerald-700 font-bold">
                                {tc.newQuantity.toLocaleString('vi-VN')} vé
                              </span>
                            </div>
                          )}
                          {tc.descChanged && (
                            <div className="text-xs space-y-1 pt-1 border-t border-white/5 [html.light_&]:border-slate-200">
                              <span className="text-slate-400 [html.light_&]:text-slate-600 block">Mô tả hạng vé:</span>
                              <div className="flex flex-wrap items-center gap-2">
                                {tc.oldDescription && (
                                  <span className="text-rose-300 line-through [html.light_&]:text-rose-700">{tc.oldDescription}</span>
                                )}
                                <span className="text-slate-400 font-bold">→</span>
                                <span className="text-emerald-300 font-medium [html.light_&]:text-emerald-700">{tc.newDescription || 'Đã xóa mô tả'}</span>
                              </div>
                            </div>
                          )}
                          {tc.isAdded && (
                            <div className="text-xs text-slate-300 [html.light_&]:text-slate-700 flex items-center gap-2">
                              <span>Giá mở bán: <strong className="text-emerald-400 [html.light_&]:text-emerald-700">{tc.newPrice.toLocaleString('vi-VN')} đ</strong></span>
                              <span>•</span>
                              <span>Số lượng: <strong className="text-white [html.light_&]:text-[#0D1B2A]">{tc.newQuantity.toLocaleString('vi-VN')} vé</strong></span>
                            </div>
                          )}
                          {tc.isRemoved && (
                            <div className="text-xs text-rose-300 [html.light_&]:text-rose-700">
                              Đã xóa hạng vé này khỏi sự kiện (Giá cũ: {tc.oldPrice.toLocaleString('vi-VN')} đ • SL cũ: {tc.oldQuantity.toLocaleString('vi-VN')} vé)
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. SESSION CHANGES (ONLY IF SESSIONS ACTUALLY CHANGED) */}
                {revisionDetails?.sessionChanges && revisionDetails.sessionChanges.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-3 [html.light_&]:bg-white [html.light_&]:border-slate-200">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-2.5 [html.light_&]:border-slate-200">
                      <span className="grid size-7 place-items-center rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                        <Calendar className="size-3.5" />
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                        Điều chỉnh lịch trình suất diễn ({revisionDetails.sessionChanges.length})
                      </h4>
                    </div>
                    <div className="grid gap-2.5">
                      {revisionDetails.sessionChanges.map((sess, idx) => (
                        <div key={idx} className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs space-y-2 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white [html.light_&]:text-[#0D1B2A] text-sm">{sess.name}</span>
                              {sess.nameChanged && sess.oldName && (
                                <span className="text-[11px] text-rose-300 line-through [html.light_&]:text-rose-700">
                                  (Tên cũ: {sess.oldName})
                                </span>
                              )}
                            </div>
                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                              sess.isRemoved
                                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                : sess.isAdded
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                            }`}>
                              {sess.typeLabel}
                            </span>
                          </div>

                          {sess.timeChanged && sess.oldStartTime && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              <div className="rounded bg-rose-500/[0.06] border border-rose-500/20 p-2 text-slate-300 [html.light_&]:bg-rose-50 [html.light_&]:text-slate-700">
                                <span className="text-[10px] font-bold uppercase text-rose-300 [html.light_&]:text-rose-700 block">Thời gian cũ:</span>
                                <span className="line-through">{formatDate(sess.oldStartTime)} — {formatDate(sess.oldEndTime)}</span>
                              </div>
                              <div className="rounded bg-emerald-500/[0.06] border border-emerald-500/25 p-2 text-white [html.light_&]:bg-emerald-50 [html.light_&]:text-[#0D1B2A]">
                                <span className="text-[10px] font-bold uppercase text-emerald-300 [html.light_&]:text-emerald-700 block">Thời gian mới:</span>
                                <strong className="text-emerald-300 [html.light_&]:text-emerald-800">{formatDate(sess.startTime)} — {formatDate(sess.endTime)}</strong>
                              </div>
                            </div>
                          )}

                          {sess.isAdded && sess.startTime && (
                            <div className="text-slate-300 [html.light_&]:text-slate-600 flex flex-wrap items-center gap-3">
                              <span>Bắt đầu: <strong className="text-emerald-300 [html.light_&]:text-emerald-700">{formatDate(sess.startTime)}</strong></span>
                              <span>•</span>
                              <span>Kết thúc: <strong className="text-emerald-300 [html.light_&]:text-emerald-700">{formatDate(sess.endTime)}</strong></span>
                            </div>
                          )}

                          {sess.isRemoved && sess.oldStartTime && (
                            <div className="text-rose-300/80 line-through [html.light_&]:text-rose-700">
                              Lịch trình đã xóa: {formatDate(sess.oldStartTime)} — {formatDate(sess.oldEndTime)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6. GENERAL FIELDS & POLICIES CHANGES */}
                {revisionDetails?.generalChanges && revisionDetails.generalChanges.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-3 [html.light_&]:bg-white [html.light_&]:border-slate-200">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-2.5 [html.light_&]:border-slate-200">
                      <span className="grid size-7 place-items-center rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/25">
                        <Info className="size-3.5" />
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                        Thông tin chung & Chính sách ({revisionDetails.generalChanges.length})
                      </h4>
                    </div>

                    <div className="grid gap-3">
                      {revisionDetails.generalChanges.map((gc) => (
                        <div
                          key={gc.field}
                          className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs space-y-2 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200"
                        >
                          <div className="font-bold text-white [html.light_&]:text-[#0D1B2A] text-xs sm:text-sm">
                            {gc.label}
                          </div>

                          {gc.kind === 'text' && gc.wordDiff ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 leading-relaxed">
                              <div className="rounded border border-rose-500/20 bg-rose-500/[0.04] p-2.5 [html.light_&]:bg-rose-50/50 [html.light_&]:border-rose-200">
                                <span className="text-[10px] font-bold uppercase text-rose-300 [html.light_&]:text-rose-700 block mb-1">
                                  Trước khi sửa
                                </span>
                                <div className="text-slate-300 [html.light_&]:text-slate-700 break-words">
                                  {gc.wordDiff.oldTokens.map((tok, i) =>
                                    tok.type === 'removed' ? (
                                      <span key={i} className="bg-rose-500/25 text-rose-200 line-through px-1 rounded [html.light_&]:bg-rose-200 [html.light_&]:text-rose-900">
                                        {tok.text}
                                      </span>
                                    ) : (
                                      <span key={i}>{tok.text}</span>
                                    )
                                  )}
                                </div>
                              </div>
                              <div className="rounded border border-emerald-500/25 bg-emerald-500/[0.04] p-2.5 [html.light_&]:bg-emerald-50/50 [html.light_&]:border-emerald-200">
                                <span className="text-[10px] font-bold uppercase text-emerald-300 [html.light_&]:text-emerald-700 block mb-1">
                                  Sau khi sửa
                                </span>
                                <div className="text-white [html.light_&]:text-[#0D1B2A] break-words">
                                  {gc.wordDiff.newTokens.map((tok, i) =>
                                    tok.type === 'added' ? (
                                      <span key={i} className="bg-emerald-500/25 text-emerald-200 font-bold px-1 rounded [html.light_&]:bg-emerald-200 [html.light_&]:text-emerald-950">
                                        {tok.text}
                                      </span>
                                    ) : (
                                      <span key={i}>{tok.text}</span>
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              <div className="rounded border border-white/10 bg-black/20 p-2.5 [html.light_&]:bg-white [html.light_&]:border-slate-200">
                                <span className="text-[10px] font-bold uppercase text-slate-400 [html.light_&]:text-slate-500 block mb-0.5">
                                  Trước khi sửa:
                                </span>
                                <span className="text-slate-300 line-through [html.light_&]:text-slate-600">{String(gc.oldValue)}</span>
                              </div>
                              <div className="rounded border border-emerald-500/25 bg-emerald-500/[0.04] p-2.5 [html.light_&]:bg-emerald-50/50 [html.light_&]:border-emerald-200">
                                <span className="text-[10px] font-bold uppercase text-emerald-300 [html.light_&]:text-emerald-700 block mb-0.5">
                                  Sau khi sửa:
                                </span>
                                <strong className="text-emerald-300 [html.light_&]:text-emerald-800">{String(gc.newValue)}</strong>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Revision Note Input & Action Buttons */}
                <div className="pt-3 border-t border-white/10 [html.light_&]:border-slate-200 flex flex-col sm:flex-row items-center gap-2.5">
                  <input
                    type="text"
                    value={revisionNote}
                    onChange={(e) => setRevisionNote(e.target.value)}
                    placeholder="Ghi chú duyệt sửa đổi (tuỳ chọn)..."
                    className="flex-1 w-full h-9 rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-white placeholder:text-slate-500 outline-none focus:border-white/25 [html.light_&]:bg-white [html.light_&]:border-slate-300 [html.light_&]:text-[#0D1B2A] [html.light_&]:placeholder:text-slate-400"
                  />
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={reviewRevisionMutation.isPending}
                      onClick={() => handleReviewRevision('REJECT')}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/15 px-3.5 py-2 text-xs font-medium text-rose-300 transition disabled:opacity-50 cursor-pointer [html.light_&]:bg-rose-50 [html.light_&]:text-rose-700 [html.light_&]:border-rose-300"
                    >
                      <Ban className="size-3.5" />
                      <span>Từ chối sửa đổi</span>
                    </button>
                    <button
                      type="button"
                      disabled={reviewRevisionMutation.isPending}
                      onClick={() => handleReviewRevision('APPROVE')}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 className="size-3.5" />
                      <span>Phê duyệt sửa đổi</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isPendingReview && event.review_note && (
            <div className={`mb-6 p-4 rounded-xl border ${event.status === 'REJECTED' ? 'bg-error/10 border-error/20 text-error' : event.status === 'HIDDEN' ? 'bg-warning/10 border-warning/20 text-warning' : 'bg-panel-soft border-border-soft text-content'}`}>
              <h3 className="font-bold mb-1">Ghi chú từ quản trị viên:</h3>
              <p className="text-sm whitespace-pre-wrap">{typeof event.review_note === 'string' ? event.review_note : JSON.stringify(event.review_note)}</p>
            </div>
          )}

          <div className="mb-8 overflow-hidden rounded-[32px] border border-white/5 bg-white/[0.02] shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md">
            {event.banner_url ? (
              <div className="p-4 pb-0">
                <img
                  src={event.banner_url}
                  alt="Banner"
                  className="h-72 w-full rounded-[24px] object-cover shadow-inner"
                />
              </div>
            ) : (
              <div className="h-64">
                <ImagePlaceholder />
              </div>
            )}
            <div className="p-6">


              <h2 className="mb-2 font-display text-3xl font-black tracking-tight text-white drop-shadow-md [html.light_&]:text-[#0D1B2A]">
                {typeof event.title === 'string' ? (isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title) : (isEnglish ? 'Event Details' : 'Chi tiết sự kiện')}
              </h2>
              {event.short_description && (
                <p className="mb-4 text-base font-medium text-slate-400 [html.light_&]:text-slate-600">
                  {typeof event.short_description === 'string' ? (isEnglish ? (translatePhrase(event.short_description, 'en') || event.short_description) : event.short_description) : ''}
                </p>
              )}

              {/* Tags & Category */}
              {(event.category_name || (Array.isArray(event.tags) && event.tags.length > 0)) && (
                <div className="mb-6 flex flex-wrap items-center gap-2">
                  {event.category_name && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C99A47]/15 border border-[#C99A47]/30 px-3 py-1 text-xs font-bold text-[#E6C17A] [html.light_&]:bg-amber-50 [html.light_&]:text-amber-900 [html.light_&]:border-amber-300">
                      {event.category_name}
                    </span>
                  )}
                  {Array.isArray(event.tags) &&
                    event.tags.map((tag, idx) => (
                      <span
                        key={`${tag}-${idx}`}
                        className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 [html.light_&]:bg-slate-100 [html.light_&]:text-slate-700 [html.light_&]:border-slate-200"
                      >
                        <Tag className="size-3 text-[#C99A47]" />
                        <span>#{tag}</span>
                      </span>
                    ))}
                </div>
              )}

              <div className="mb-8 space-y-3.5">
                {/* Thời gian */}
                <div className="flex items-start gap-3">
                  <Calendar className="size-5 shrink-0 text-[#C99A47] mt-0.5" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                      {isEnglish ? 'Time' : 'Thời gian'}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-200 [html.light_&]:text-[#0D1B2A]">
                      {isEnglish ? 'Start:' : 'Bắt đầu:'} <span className="font-normal text-slate-300 [html.light_&]:text-slate-700">{formatDate(event.start_time)}</span>
                      <span className="mx-2 text-slate-500">•</span>
                      {isEnglish ? 'End:' : 'Kết thúc:'} <span className="font-normal text-slate-300 [html.light_&]:text-slate-700">{formatDate(event.end_time)}</span>
                    </p>
                  </div>
                </div>

                {/* Địa điểm */}
                <div className="flex items-start gap-3">
                  <MapPin className="size-5 shrink-0 text-[#C99A47] mt-0.5" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                      {isEnglish ? 'Location' : 'Địa điểm'}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-slate-300 [html.light_&]:text-slate-700 leading-relaxed">
                      {cleanAndFormatVenue(
                        event.venue ||
                        event.venue_name ||
                        (event.sessions?.find((s) => s?.venue)?.venue) ||
                        event.location_name ||
                        event.address,
                        isEnglish
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-10">
                <h3 className="mb-5 font-display text-lg font-black text-white drop-shadow-sm [html.light_&]:text-[#0D1B2A]">
                  {isEnglish ? 'Detailed Description' : 'Mô tả chi tiết'}
                </h3>
                {event.description ? (
                  <div
                    className="prose prose-sm prose-invert max-w-none text-slate-300 break-words [&_*]:max-w-full [&_table]:block [&_table]:overflow-x-auto [html.light_&]:prose-neutral [html.light_&]:text-[#0D1B2A]"
                    dangerouslySetInnerHTML={{ __html: translateEventHtmlDescription(typeof event.description === 'string' ? event.description : '', isEnglish) }}
                  />
                ) : (
                  <p className="text-sm italic text-slate-500">Không có mô tả.</p>
                )}
              </div>

              {/* Extra Details */}
              <div className="space-y-6">
                {/* Event Permits Section */}
                {(() => {
                  const permitsList = (Array.isArray(event.permits) && event.permits.length > 0)
                    ? event.permits
                    : (Array.isArray(event.refund_policy?.permit_files) && event.refund_policy.permit_files.length > 0)
                      ? event.refund_policy.permit_files
                      : []

                  return (
                    <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner space-y-4 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                      <div className="flex items-center justify-between border-b border-white/10 [html.light_&]:border-slate-200 pb-3">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="size-5 text-[#C99A47]" />
                          <h3 className="font-display text-base font-black text-white [html.light_&]:text-[#0D1B2A]">Giấy phép & Tài liệu đính kèm</h3>
                        </div>
                        {permitsList.length > 0 && (
                          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300 border border-amber-500/20 [html.light_&]:bg-amber-50 [html.light_&]:text-amber-800 [html.light_&]:border-amber-200">
                            {permitsList.length} tài liệu
                          </span>
                        )}
                      </div>

                      {permitsList.length > 0 ? (
                        <div className="flex flex-col gap-2.5">
                          {permitsList.map((rawPermit, idx) => {
                            const permit = resolvePermit(rawPermit, idx)
                            if (!permit) return null
                            return (
                              <div
                                key={permit.id || idx}
                                className="group flex items-center justify-between py-2.5 px-2 rounded-xl transition hover:bg-white/[0.04] [html.light_&]:hover:bg-slate-100"
                              >
                                <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
                                  <div className="min-w-0">
                                    <span className="truncate block text-sm font-bold text-white [html.light_&]:text-[#0D1B2A] group-hover:text-amber-200 transition" title={permit.name}>
                                      {permit.name}
                                    </span>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-400 [html.light_&]:text-slate-500 mt-0.5">
                                      <span>{permit.type.includes('pdf') ? 'PDF' : permit.type.includes('image') ? 'Ảnh' : 'Tài liệu'}</span>
                                      {permit.size && (
                                        <>
                                          <span>•</span>
                                          <span>{formatFileSize(permit.size)}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="ml-2 flex shrink-0 items-center gap-1.5">
                                  {permit.url ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const matchingDocAnalysis = aiData?.document_analysis?.find(
                                            (d) => (permit.url && d.url === permit.url) ||
                                              (permit.name && d.fileName === permit.name) ||
                                              (d.source && d.source.includes(String(idx + 1)))
                                          )
                                          const matchingVision = aiData?.vision_analysis?.find(
                                            (v) => (permit.url && v.url === permit.url) ||
                                              (permit.name && v.fileName === permit.name) ||
                                              (v.source && v.source.includes(String(idx + 1)))
                                          )
                                          setPreviewDoc({
                                            ...permit,
                                            extractedText: matchingDocAnalysis?.extractedText || matchingVision?.extractedText || null,
                                          })
                                        }}
                                        className="grid size-8 place-items-center rounded-lg border border-white/10 bg-[#1c2747] text-slate-300 hover:border-amber-400/50 hover:bg-[#25335c] hover:text-amber-400 transition shadow-sm cursor-pointer"
                                        title="Xem tài liệu trực tiếp & văn bản AI trích xuất"
                                      >
                                        <Eye className="size-4" />
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-xs text-slate-500 italic">Không có link</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-xs italic text-slate-500">Không có giấy phép đính kèm.</p>
                      )}
                    </div>
                  )
                })()}

                {/* Event Sessions */}
                <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner space-y-4 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                  <div className="flex items-center gap-2 border-b border-white/10 [html.light_&]:border-slate-200 pb-3">
                    <Calendar className="size-5 text-[#C99A47]" />
                    <h3 className="font-display text-base font-black text-white [html.light_&]:text-[#0D1B2A]">Lịch trình các phiên</h3>
                  </div>
                  {event.sessions && event.sessions.length > 0 ? (
                    <div className="space-y-3">
                      {event.sessions.map((session, idx) => {
                        const rawTitle = session?.session_name?.trim() || ''
                        const sessionTitle = rawTitle
                          ? (/^phiên\s*\d+/i.test(rawTitle) ? rawTitle : `Phiên ${idx + 1}: ${rawTitle}`)
                          : `Phiên ${idx + 1}`

                        return (
                          <div key={idx} className="rounded-xl border border-white/5 bg-white/[0.03] p-3.5 text-slate-300 [html.light_&]:bg-white [html.light_&]:border-slate-200">
                            <div className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">{sessionTitle}</div>
                            <div className="mt-1 text-xs sm:text-[13px] font-medium text-slate-300 [html.light_&]:text-slate-600">
                              {formatDate(session?.start_time)} - {formatDate(session?.end_time)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs italic text-slate-500">Chưa có lịch trình chi tiết.</p>
                  )}
                </div>

                {/* Ticket Types */}
                <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner space-y-4 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 [html.light_&]:border-slate-200 pb-3 flex-nowrap overflow-x-auto">
                    <div className="flex items-center gap-2 shrink-0">
                      <Tag className="size-5 text-[#C99A47] shrink-0" />
                      <h3 className="font-display text-base font-black text-white [html.light_&]:text-[#0D1B2A] whitespace-nowrap">
                        {isEnglish ? 'Ticket Structure' : 'Cơ cấu loại vé'}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2.5 sm:gap-3 flex-nowrap shrink-0">
                      {groupedTickets.length > 0 && (
                        <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-slate-400 [html.light_&]:text-slate-600 whitespace-nowrap">
                          <span className="font-semibold text-slate-300 [html.light_&]:text-slate-700">
                            {isEnglish
                              ? `${groupedTickets.length} tiers`
                              : `${groupedTickets.length} loại vé`}
                          </span>
                          <span>•</span>
                          <span>
                            {isEnglish ? 'Total: ' : 'Tổng: '}
                            <strong className="text-white [html.light_&]:text-[#0D1B2A]">
                              {totalTicketsCount.toLocaleString(isEnglish ? 'en-US' : 'vi-VN')}
                            </strong>{' '}
                            {isEnglish ? 'tickets' : 'vé'}
                          </span>
                          {totalTicketsRevenue > 0 && (
                            <>
                              <span>•</span>
                              <span>
                                {isEnglish ? 'Est. revenue: ' : 'Dự thu: '}
                                <strong className="text-emerald-400 [html.light_&]:text-emerald-700">
                                  {totalTicketsRevenue.toLocaleString(isEnglish ? 'en-US' : 'vi-VN')} {isEnglish ? '₫' : 'đ'}
                                </strong>
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {/* View mode toggle (Cards vs Matrix Table) */}
                      {event.sessions && event.sessions.length > 1 && (
                        <div className="flex items-center rounded-lg border border-white/10 bg-black/40 p-0.5 [html.light_&]:bg-slate-100 [html.light_&]:border-slate-300 shrink-0">
                          <button
                            type="button"
                            onClick={() => setTicketViewMode('grid')}
                            className={`flex items-center px-2.5 py-1 rounded-md text-xs font-bold transition whitespace-nowrap ${ticketViewMode === 'grid'
                              ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm'
                              : 'text-slate-400 hover:text-white [html.light_&]:text-slate-600 [html.light_&]:hover:text-[#0D1B2A]'
                              }`}
                            title={isEnglish ? 'View detailed card format' : 'Xem dạng thẻ chi tiết'}
                          >
                            <span>{isEnglish ? 'Card format' : 'Dạng thẻ'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setTicketViewMode('table')}
                            className={`flex items-center px-2.5 py-1 rounded-md text-xs font-bold transition whitespace-nowrap ${ticketViewMode === 'table'
                              ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm'
                              : 'text-slate-400 hover:text-white [html.light_&]:text-slate-600 [html.light_&]:hover:text-[#0D1B2A]'
                              }`}
                            title={isEnglish ? 'View matrix table by session' : 'Xem bảng ma trận tổng hợp theo phiên'}
                          >
                            <span>{isEnglish ? 'Matrix table' : 'Bảng ma trận'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Session filter buttons if multiple sessions */}
                  {event.sessions && event.sessions.length > 1 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedTicketSessionId('ALL')}
                        className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${selectedTicketSessionId === 'ALL'
                          ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm font-black'
                          : 'bg-white/5 text-slate-200 font-bold border border-white/10 hover:text-white hover:bg-white/10 hover:border-[#C99A47]/40 [html.light_&]:bg-white [html.light_&]:text-slate-800 [html.light_&]:border-slate-300 [html.light_&]:hover:bg-slate-100 [html.light_&]:hover:text-[#0D1B2A]'
                          }`}
                      >
                        {isEnglish ? `All sessions (${event.sessions.length})` : `Tất cả các phiên (${event.sessions.length})`}
                      </button>
                      {event.sessions.map((sess, sIdx) => {
                        const sId = String(sess.id)
                        const isSelected = selectedTicketSessionId === sId
                        const rawTitle = sess.session_name?.trim() || ''
                        const time = formatShortDate(sess.start_time)
                        const prefix = isEnglish ? 'Session' : 'Phiên'
                        const label = rawTitle
                          ? (/^phiên\s*\d+/i.test(rawTitle)
                            ? (isEnglish ? rawTitle.replace(/^phiên\s*/i, 'Session ') : rawTitle) + (time ? ` (${time})` : '')
                            : `${prefix} ${sIdx + 1}: ${rawTitle}${time ? ` (${time})` : ''}`)
                          : `${prefix} ${sIdx + 1}${time ? ` (${time})` : ''}`

                        return (
                          <button
                            key={sess.id || sIdx}
                            type="button"
                            onClick={() => setSelectedTicketSessionId(sId)}
                            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${isSelected
                              ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm font-black'
                              : 'bg-white/5 text-slate-200 font-bold border border-white/10 hover:text-white hover:bg-white/10 hover:border-[#C99A47]/40 [html.light_&]:bg-white [html.light_&]:text-slate-800 [html.light_&]:border-slate-300 [html.light_&]:hover:bg-slate-100 [html.light_&]:hover:text-[#0D1B2A]'
                              }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {groupedTickets.length === 0 ? (
                    <p className="text-xs italic text-slate-500">{isEnglish ? 'No ticket types created yet.' : 'Chưa tạo loại vé nào.'}</p>
                  ) : ticketViewMode === 'table' && event.sessions && event.sessions.length > 1 ? (
                    /* MATRIX TABLE VIEW */
                    <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/60 shadow-inner [html.light_&]:bg-white [html.light_&]:border-slate-200">
                      <table className="w-full text-left text-xs text-slate-300 border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/[0.04] text-[11px] font-bold uppercase tracking-wider text-slate-400 [html.light_&]:bg-slate-100 [html.light_&]:border-slate-200 [html.light_&]:text-slate-600">
                            <th className="py-3 px-3.5 whitespace-nowrap">{isEnglish ? 'Ticket Tier' : 'Hạng vé'}</th>
                            <th className="py-3 px-3.5 text-right whitespace-nowrap">{isEnglish ? 'Price' : 'Đơn giá'}</th>
                            <th className="py-3 px-3.5 text-center whitespace-nowrap min-w-[100px]">{isEnglish ? 'Type' : 'Hình thức'}</th>
                            {event.sessions.map((sess, sIdx) => {
                              const time = formatShortDate(sess.start_time)
                              const rawTitle = sess.session_name?.trim() || ''
                              const prefix = isEnglish ? 'Session' : 'Phiên'
                              const sessionTitle = rawTitle && !/^phiên\s*\d+/i.test(rawTitle)
                                ? `${prefix} ${sIdx + 1}: ${rawTitle}`
                                : `${prefix} ${sIdx + 1}`

                              return (
                                <th key={sess.id || sIdx} className="py-3 px-3.5 text-center min-w-[130px] whitespace-nowrap">
                                  <div className="font-bold text-white [html.light_&]:text-[#0D1B2A]">{sessionTitle}</div>
                                  {time && <div className="text-[10px] font-normal text-slate-400 [html.light_&]:text-slate-500 font-mono mt-0.5">{time}</div>}
                                </th>
                              )
                            })}
                            <th className="py-3 px-3.5 text-right font-black text-white [html.light_&]:text-[#0D1B2A] whitespace-nowrap">{isEnglish ? 'Total tickets' : 'Tổng vé'}</th>
                            <th className="py-3 px-3.5 text-right font-black text-emerald-400 whitespace-nowrap">{isEnglish ? 'Est. revenue' : 'Dự thu'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 [html.light_&]:divide-slate-200 font-medium">
                          {groupedTickets.map((t) => {
                            const sessionQtyMap = new Map(t.sessions.map((s) => [String(s.sessionId), s.quantity]))
                            const revenue = t.totalQuantity * t.price

                            return (
                              <tr key={t.key} className="hover:bg-white/[0.02] [html.light_&]:hover:bg-slate-50 transition">
                                <td className="py-3 px-3.5 font-bold text-white [html.light_&]:text-[#0D1B2A] whitespace-nowrap">
                                  {isEnglish ? (translatePhrase(t.name, 'en') || t.name) : t.name}
                                </td>
                                <td className="py-3 px-3.5 text-right text-emerald-400 font-semibold whitespace-nowrap">
                                  {Number(t.price) === 0 ? (isEnglish ? 'Free' : 'Miễn phí') : `${Number(t.price).toLocaleString(isEnglish ? 'en-US' : 'vi-VN')} ${isEnglish ? 'VND' : 'đ'}`}
                                </td>
                                <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                  <span className={`inline-flex items-center justify-center whitespace-nowrap text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${t.is_seated
                                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                    }`}>
                                    {t.is_seated ? (isEnglish ? 'Seat' : 'Ghế ngồi') : (isEnglish ? 'Standing' : 'Vé tự do')}
                                  </span>
                                </td>
                                {event.sessions.map((sess, sIdx) => {
                                  const qty = sessionQtyMap.get(String(sess.id)) || 0
                                  return (
                                    <td key={sess.id || sIdx} className="py-3 px-3.5 text-center whitespace-nowrap">
                                      <span className="font-bold text-slate-200 [html.light_&]:text-slate-800">{qty.toLocaleString(isEnglish ? 'en-US' : 'vi-VN')}</span>
                                      <span className="text-slate-500 text-[10px] ml-1">{isEnglish ? 'tickets' : 'vé'}</span>
                                    </td>
                                  )
                                })}
                                <td className="py-3 px-3 text-right font-bold text-white [html.light_&]:text-[#0D1B2A] whitespace-nowrap">
                                  {t.totalQuantity.toLocaleString(isEnglish ? 'en-US' : 'vi-VN')} {isEnglish ? 'tickets' : 'vé'}
                                </td>
                                <td className="py-3 px-3 text-right font-bold text-emerald-400 whitespace-nowrap">
                                  {revenue.toLocaleString(isEnglish ? 'en-US' : 'vi-VN')} {isEnglish ? 'VND' : 'đ'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-white/10 bg-white/[0.04] text-xs font-black text-white [html.light_&]:bg-slate-100 [html.light_&]:border-slate-200 [html.light_&]:text-[#0D1B2A]">
                            <td className="py-3 px-3.5 whitespace-nowrap" colSpan={3}>
                              {isEnglish ? 'TOTAL' : 'TỔNG CỘNG'}
                            </td>
                            {event.sessions.map((sess, sIdx) => {
                              const sessTotal = (event.ticket_types || [])
                                .filter((tt) => String(tt.event_session_id) === String(sess.id))
                                .reduce((sum, tt) => sum + Number(tt.quantity || 0), 0)
                              return (
                                <td key={sess.id || sIdx} className="py-3 px-3.5 text-center text-indigo-300 [html.light_&]:text-indigo-700 whitespace-nowrap font-bold">
                                  {sessTotal.toLocaleString(isEnglish ? 'en-US' : 'vi-VN')} {isEnglish ? 'tickets' : 'vé'}
                                </td>
                              )
                            })}
                            <td className="py-3 px-3.5 text-right text-white [html.light_&]:text-[#0D1B2A] whitespace-nowrap">
                              {totalTicketsCount.toLocaleString(isEnglish ? 'en-US' : 'vi-VN')} {isEnglish ? 'tickets' : 'vé'}
                            </td>
                            <td className="py-3 px-3.5 text-right text-emerald-400 whitespace-nowrap">
                              {totalTicketsRevenue.toLocaleString(isEnglish ? 'en-US' : 'vi-VN')} {isEnglish ? 'VND' : 'đ'}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    /* CARD GRID VIEW (ĐỒNG BỘ CẤU TRÚC VÀ RÕ RÀNG THEO TỪNG PHIÊN) */
                    <div className="grid gap-4 sm:grid-cols-2">
                      {groupedTickets.map((ticket) => {
                        const isMultiSession = ticket.sessions.length > 1
                        const isUniform = isMultiSession && ticket.uniqueQuantities.size === 1
                        const sampleQty = ticket.sessions[0]?.quantity
                        const estRevenue = ticket.totalQuantity * ticket.price

                        return (
                          <div
                            key={ticket.key}
                            className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3 transition hover:border-white/20 hover:bg-white/[0.03] shadow-sm [html.light_&]:bg-white [html.light_&]:border-slate-200"
                          >
                            {/* Header: Name, Seating Badge & Price */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A] tracking-wide">
                                    {isEnglish ? (translatePhrase(ticket.name, 'en') || ticket.name) : ticket.name}
                                  </h4>
                                  <span
                                    className={`inline-flex items-center whitespace-nowrap text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${ticket.is_seated
                                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                      }`}
                                  >
                                    {ticket.is_seated ? (isEnglish ? 'Seat' : 'Ghế ngồi') : (isEnglish ? 'Standing' : 'Vé tự do')}
                                  </span>
                                </div>
                                {ticket.description && (
                                  <p className="text-[11px] text-slate-400 [html.light_&]:text-slate-500 italic mt-1 line-clamp-2">
                                    {ticket.description}
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-sm font-black text-emerald-400">
                                  {Number(ticket.price) === 0 ? (isEnglish ? 'Free' : 'Miễn phí') : `${Number(ticket.price).toLocaleString(isEnglish ? 'en-US' : 'vi-VN')} ${isEnglish ? 'VND' : 'đ'}`}
                                </span>
                              </div>
                            </div>

                            {/* Stat Metrics Bar (Đồng bộ số liệu) */}
                            <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/40 border border-white/5 p-2.5 text-xs [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-white [html.light_&]:text-slate-700 tracking-wider block">
                                  {isEnglish ? 'Total number of tickets' : 'Tổng số lượng vé'}
                                </span>
                                <div className="font-extrabold text-white [html.light_&]:text-[#0D1B2A] text-sm mt-0.5">
                                  {ticket.totalQuantity.toLocaleString(isEnglish ? 'en-US' : 'vi-VN')}{' '}
                                  <span className="text-xs font-normal text-slate-400 [html.light_&]:text-slate-500">{isEnglish ? 'tickets' : 'vé'}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] uppercase font-bold text-white [html.light_&]:text-slate-700 tracking-wider block">
                                  {isEnglish
                                    ? (isMultiSession ? 'Norms / Session' : 'Sales quantity')
                                    : (isMultiSession ? 'Định mức / Phiên' : 'Số lượng bán')}
                                </span>
                                <div className="font-extrabold text-slate-200 [html.light_&]:text-slate-800 text-sm mt-0.5">
                                  {isMultiSession
                                    ? (isUniform
                                      ? `${sampleQty} ${isEnglish ? 'tickets / session' : 'vé / phiên'}`
                                      : `${ticket.sessions.length} ${isEnglish ? (ticket.sessions.length > 1 ? 'sessions' : 'session') : 'phiên'}`)
                                    : `${ticket.totalQuantity.toLocaleString(isEnglish ? 'en-US' : 'vi-VN')} ${isEnglish ? 'tickets' : 'vé'}`}
                                </div>
                              </div>
                            </div>

                            {/* Multi-session Breakdown List */}
                            {isMultiSession && selectedTicketSessionId === 'ALL' && (
                              <div className="space-y-1.5 pt-1 border-t border-white/5 [html.light_&]:border-slate-200">
                                <div className="flex items-center justify-between text-[10px] font-bold text-white [html.light_&]:text-slate-700 uppercase tracking-wider px-1">
                                  <span>
                                    {isEnglish
                                      ? `Allocation by session (${ticket.sessions.length} ${ticket.sessions.length > 1 ? 'sessions' : 'session'})`
                                      : `Phân bổ theo phiên (${ticket.sessions.length} phiên)`}
                                  </span>
                                  <span>{isEnglish ? 'Ticket quantity' : 'Số lượng vé'}</span>
                                </div>
                                <div className="space-y-1.5">
                                  {ticket.sessions.map((s, sIdx) => (
                                    <div
                                      key={sIdx}
                                      className="flex items-center justify-between gap-2.5 rounded-lg bg-white/[0.02] border border-white/5 px-2.5 py-1.5 text-xs transition hover:bg-white/[0.05] [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200"
                                    >
                                      <div className="flex items-baseline gap-1.5 min-w-0 flex-1 flex-wrap">
                                        <span className="font-bold text-indigo-300 [html.light_&]:text-indigo-700 shrink-0">
                                          {isEnglish ? 'Session' : 'Phiên'} {s.sessionIndex}
                                        </span>
                                        {s.rawSessionName && (
                                          <span className="text-slate-200 [html.light_&]:text-slate-800 font-medium break-words">
                                            • {s.rawSessionName}
                                          </span>
                                        )}
                                        {s.timeStr && (
                                          <span className="text-slate-400 [html.light_&]:text-slate-500 text-[11px] font-mono shrink-0">
                                            ({s.timeStr})
                                          </span>
                                        )}
                                      </div>
                                      <div className="shrink-0 font-bold text-emerald-400 whitespace-nowrap pl-2">
                                        {s.quantity.toLocaleString(isEnglish ? 'en-US' : 'vi-VN')} {isEnglish ? 'tickets' : 'vé'}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Single session filtered info if viewing a specific session */}
                            {selectedTicketSessionId !== 'ALL' && (
                              <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1.5 text-xs text-indigo-300 [html.light_&]:bg-indigo-50 [html.light_&]:border-indigo-200 [html.light_&]:text-indigo-800 flex items-center justify-between">
                                <span>{isEnglish ? 'Applied to session:' : 'Áp dụng cho phiên:'}</span>
                                <strong className="text-white [html.light_&]:text-[#0D1B2A]">
                                  {ticket.sessions[0]?.sessionName || (isEnglish ? 'Selected session' : 'Phiên đã chọn')}
                                </strong>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Refund Policy */}
                <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner space-y-4 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                  <div className="flex items-center gap-2 border-b border-white/10 [html.light_&]:border-slate-200 pb-3">
                    <FileText className="size-5 text-[#C99A47]" />
                    <h3 className="font-display text-base font-black text-white [html.light_&]:text-[#0D1B2A]">Chính sách hoàn tiền sự kiện</h3>
                  </div>
                  <div className="text-sm font-medium leading-relaxed text-slate-200 [html.light_&]:text-slate-800">
                    <div className="flex items-start gap-2.5">
                      <span className="text-[#C99A47] font-black shrink-0 text-base leading-none mt-0.5">•</span>
                      <span>
                        {typeof event.refund_policy === 'string'
                          ? event.refund_policy
                          : event.refund_policy?.description ||
                          (event.refund_policy && typeof event.refund_policy === 'object' && Object.keys(event.refund_policy).length > 0
                            ? (event.refund_policy.allow_refund
                              ? `Cho phép hoàn vé trước ${event.refund_policy.refund_before_days || 0} ngày (Tỷ lệ: ${event.refund_policy.refund_rate || 100}%)`
                              : 'Sự kiện không hỗ trợ hoàn tiền.')
                            : 'Áp dụng chính sách hoàn vé tiêu chuẩn của EventHub.')}
                      </span>
                    </div>
                  </div>

                  {event.refund_policy?.policy_file_url && (
                    <div className="mt-2 flex items-center justify-between py-2.5 px-2 rounded-xl transition hover:bg-white/[0.04] [html.light_&]:hover:bg-slate-100">
                      <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                            {event.refund_policy.policy_file_name || 'Tài liệu chính sách hoàn tiền đính kèm.pdf'}
                          </p>
                          {event.refund_policy.policy_file_size && (
                            <p className="text-xs text-slate-400 [html.light_&]:text-slate-500 mt-0.5">
                              {formatFileSize(event.refund_policy.policy_file_size)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc({
                            name: event.refund_policy.policy_file_name || 'Tài liệu chính sách hoàn tiền đính kèm',
                            url: event.refund_policy.policy_file_url,
                            type: 'application/pdf',
                            size: event.refund_policy.policy_file_size,
                          })}
                          className="grid size-8 place-items-center rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 hover:text-white transition cursor-pointer"
                          title="Xem tài liệu"
                        >
                          <Eye className="size-4" />
                        </button>
                        <a
                          href={event.refund_policy.policy_file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="grid size-8 place-items-center rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 transition"
                          title="Mở trong tab mới"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Right Column: AI Assistant & Actions - ONLY FOR PENDING_REVIEW */}
        {isPendingReview && (
          isAiExpanded ? (
            <div className="relative flex w-full lg:w-[440px] xl:w-[480px] 2xl:w-[500px] shrink-0 flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-110px)] min-h-0 transition-all duration-300">
              {/* Nút mũi tên thu gọn ở viền ngoài cùng của khung (thu vô chiều ngang) */}
              <button
                type="button"
                onClick={() => setIsAiExpanded(false)}
                className="absolute right-4 top-3.5 lg:-left-3.5 lg:top-5 lg:right-auto z-30 flex size-7 items-center justify-center rounded-full border border-white/20 bg-slate-900 text-[#C99A47] shadow-[0_2px_12px_rgba(0,0,0,0.6)] backdrop-blur transition-all duration-200 hover:scale-110 hover:bg-[#C99A47] hover:text-slate-950 hover:border-[#E6C17A] [html.light_&]:bg-white [html.light_&]:border-[#C99A47] [html.light_&]:text-[#C99A47] [html.light_&]:hover:bg-[#C99A47] [html.light_&]:hover:text-white cursor-pointer"
                title={isEnglish ? 'Collapse panel horizontally' : 'Thu gọn bảng AI (thu vô lề phải)'}
              >
                <ChevronRight className="size-4" />
              </button>

              {/* Top Card: AI Review Panel */}
              <div className="flex flex-1 flex-col overflow-hidden bg-[#081126] rounded-[24px] border border-[#263751] shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl min-h-0 [html.light_&]:bg-white [html.light_&]:border-slate-200 [html.light_&]:shadow-lg">
                {/* AI Assistant Header (Fixed on top of AI card) */}
                <div className="shrink-0 px-4 py-3 border-b border-[#263751] bg-[#101D32]/95 backdrop-blur-md flex items-center justify-between gap-2 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="grid size-8 place-items-center rounded-xl bg-[#A78BFA]/15 border border-[#A78BFA]/30 text-[#A78BFA] shrink-0 [html.light_&]:bg-purple-50 [html.light_&]:text-purple-700">
                      <Bot className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-display text-xs sm:text-sm font-black text-slate-100 drop-shadow-sm tracking-tight uppercase whitespace-nowrap [html.light_&]:text-[#0D1B2A]">
                        AI Review Assistant
                      </h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsCriteriaOpen(true)}
                      className="inline-flex items-center gap-1.5 h-8 rounded-xl border border-[#263751] bg-[#1A2940] px-2.5 text-xs font-bold text-slate-300 shadow-sm transition hover:bg-[#101D32] hover:text-[#E8B85D] hover:border-[#E8B85D]/50 active:scale-95 cursor-pointer whitespace-nowrap [html.light_&]:bg-slate-100 [html.light_&]:border-slate-300 [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:bg-slate-200"
                      title="Cấu hình bộ tiêu chí & điều khoản AI"
                    >
                      <ShieldCheck className="size-3.5 text-[#E8B85D] shrink-0" />
                      <span className="hidden sm:inline">{isEnglish ? 'Criteria' : 'Điều khoản'}</span>
                    </button>

                    {isScanningThisEvent ? (
                      <button
                        type="button"
                        onClick={handleCancelAi}
                        disabled={cancelAiMutation.isPending}
                        className="inline-flex items-center gap-1.5 h-8 rounded-xl border border-[#FF4569]/60 bg-gradient-to-r from-[#FF4569] to-red-600 px-2.5 text-xs font-black tracking-wide text-white shadow-lg shadow-rose-950/50 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:from-rose-500 hover:to-red-500 active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        title="Dừng và hủy ngay tiến trình quét AI đang chạy"
                      >
                        <Square className="size-3.5 fill-white text-white animate-pulse shrink-0" />
                        <span>{cancelAiMutation.isPending ? 'Đang dừng...' : 'Hủy quét'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartAi}
                        disabled={runAiMutation.isPending || aiReviewQuery.isLoading}
                        className="btn-led-gold-sm active:scale-95 cursor-pointer h-8"
                        title="Chạy lại kiểm duyệt tự động bằng AI"
                      >
                        <span className="btn-led-gold-sm-inner !py-1 !px-2.5 !text-xs whitespace-nowrap">
                          <RefreshCw className={`size-3.5 ${runAiMutation.isPending ? 'animate-spin' : ''} shrink-0`} />
                          <span>{rawAiReview ? (isEnglish ? 'Re-run AI' : 'Chạy lại AI') : (isEnglish ? 'Run AI' : 'Chạy AI')}</span>
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* AI Info Scrollable Area */}
                <div className={`flex-1 overflow-y-auto p-4 space-y-3.5 ${customScrollbar}`}>
                {/* Active AI Scanning Progress State */}
                {isScanningThisEvent && (
                  <div className="rounded-2xl border border-[#A78BFA]/30 bg-[#101D32] p-4 shadow-sm backdrop-blur-md [html.light_&]:bg-purple-50/50 [html.light_&]:border-purple-200">
                    <div className="flex items-start gap-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#A78BFA]/15 text-[#A78BFA] mt-0.5">
                        <RefreshCw className="size-4 animate-spin" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-[#A78BFA]">
                            AI đang phân tích & kiểm duyệt sự kiện...
                          </h4>
                          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#FF4569] bg-[#FF4569]/10 border border-[#FF4569]/30 px-2.5 py-0.5 rounded-lg">
                            <span className="size-1.5 rounded-full bg-[#FF4569] animate-ping" />
                            Có thể bấm &quot;Hủy quét&quot; ở trên để dừng
                          </span>
                        </div>
                        <div className="mt-2 space-y-1.5 text-xs text-slate-300">
                          <p className="flex items-center gap-2">
                            <span className="inline-block size-1.5 rounded-full bg-[#A78BFA] animate-ping" />
                            <span><strong>Giai đoạn 1:</strong> Vision Model quét và kiểm tra an toàn từng hình ảnh...</span>
                          </p>
                          <p className="flex items-center gap-2">
                            <span className="inline-block size-1.5 rounded-full bg-[#E8B85D] animate-ping" />
                            <span><strong>Giai đoạn 2:</strong> Qwen3 8B rà soát chính tả & đối chiếu bộ điều khoản...</span>
                          </p>
                        </div>
                        <p className="mt-2 text-[10px] text-slate-400 italic">
                          Quá trình quét và đối chiếu toàn diện mất khoảng 30 - 60 giây. Bấm nút &quot;Hủy quét&quot; ở trên nếu bạn muốn dừng ngay lập tức.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Empty State: AI Review Not Run Yet */}
                {!aiData && !isScanningThisEvent && (
                  <div className="my-6 py-6 px-4 text-center">
                    <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-[#A78BFA]/15 text-[#A78BFA] border border-[#A78BFA]/30">
                      <Bot className="size-6" />
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-100 [html.light_&]:text-[#0D1B2A]">Chưa chạy AI Đánh giá</h3>
                    <p className="mt-1 text-xs text-slate-400 [html.light_&]:text-slate-600 max-w-xs mx-auto leading-relaxed">
                      Sự kiện này chưa được AI kiểm duyệt. Bấm nút bên dưới để AI quét hình ảnh bằng Vision, soát lỗi chính tả và đối chiếu chính sách nền tảng.
                    </p>
                    <button
                      type="button"
                      onClick={handleStartAi}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#E8B85D]/40 bg-gradient-to-r from-[#E8B85D] to-[#F3D698] px-5 py-2.5 text-xs font-bold text-[#081126] shadow-md transition hover:brightness-110 active:scale-95 cursor-pointer"
                    >
                      <Sparkles className="size-4" />
                      Bắt đầu Phân tích AI ngay
                    </button>
                  </div>
                )}

                  {/* Full AI Review Results */}
                  {aiData && (
                    <>
                      {/* B. Unified AI Executive Summary Card */}
                      <AiExecutiveSummaryCard aiData={aiData} />

                      {/* Quick action header */}
                      <div className="mb-3 flex items-center justify-between border-b border-[#263751] pb-2 [html.light_&]:border-slate-200">
                        <span className="text-xs font-black uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                          {isEnglish ? 'Detailed policy analysis' : 'Chi tiết phát hiện & Phân tích chính sách'}
                        </span>
                        {totalIssuesCount > 0 && (
                          <button
                            type="button"
                            onClick={handleCopyAllIssues}
                            className="grid size-7 place-items-center rounded-lg border border-[#263751] bg-[#1A2940] text-[#E8B85D] hover:bg-[#101D32] hover:text-[#F3F4F6] hover:border-[#E8B85D]/50 transition cursor-pointer active:scale-95 shadow-sm [html.light_&]:bg-slate-100 [html.light_&]:border-slate-300 [html.light_&]:text-amber-700 [html.light_&]:hover:bg-slate-200"
                            title={isEnglish ? 'Copy all violations and warnings into review notes' : 'Sao chép toàn bộ lỗi vi phạm và cảnh báo vào ô ghi chú kiểm duyệt'}
                          >
                            <Copy className="size-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-4">
                        {/* 🔴 CRITICAL VIOLATIONS */}
                        {aiData.critical_violations && aiData.critical_violations.length > 0 ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#FF4569]">
                                <ShieldAlert className="size-3.5 text-[#FF4569]" />
                                {isEnglish ? 'Critical violations' : 'Vi phạm nghiêm trọng'} ({aiData.critical_violations.length})
                              </span>
                            </div>
                            <div className="space-y-2">
                              {aiData.critical_violations.map((v, idx) => (
                                <PolicyViolationCard key={idx} item={v} onClick={handleWarningClick} />
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5 rounded-xl border border-[#10B981]/30 bg-[#10B981]/10 px-3.5 py-3 text-sm text-[#10B981] font-semibold">
                            <ShieldCheck className="size-5 text-[#10B981] shrink-0" />
                            <span>{isEnglish ? 'No critical policy violations detected' : 'Không phát hiện vi phạm chính sách nghiêm trọng'}</span>
                          </div>
                        )}

                        {/* 🟡 WARNINGS / CAUTIONS */}
                        {aiData.warnings && aiData.warnings.length > 0 && (
                          <div className="space-y-2 border-t border-white/10 pt-4 [html.light_&]:border-slate-200">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#F59E0B]">
                                <AlertTriangle className="size-3.5 text-[#F59E0B]" />
                                {isEnglish ? 'Warnings & Notices' : 'Cảnh báo & Cần lưu ý'} ({aiData.warnings.length})
                              </span>
                            </div>
                            <div className="space-y-2">
                              {aiData.warnings.map((w, idx) => (
                                <PolicyWarningCard key={idx} item={w} onClick={handleWarningClick} />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 📝 SOÁT LỖI TIÊU ĐỀ, MÔ TẢ & CHÍNH TẢ */}
                        {aiData.content_review && (
                          <div className="border-t border-white/10 pt-4 [html.light_&]:border-slate-200">
                            <ContentSpellingAuditCard
                              contentReview={aiData.content_review}
                              event={event}
                              onClick={handleWarningClick}
                            />
                          </div>
                        )}

                        {/* 📄 KIỂM DUYỆT TÀI LIỆU GIẤY PHÉP */}
                        {(aiData.document_review || aiData.document_analysis) && (
                          <div className="border-t border-white/10 pt-4 [html.light_&]:border-slate-200">
                            <DocumentModerationAuditCard
                              documentReview={aiData.document_review}
                              documentAnalysis={aiData.document_analysis}
                              onPreviewDoc={setPreviewDoc}
                              onClick={handleWarningClick}
                            />
                          </div>
                        )}

                        {/* 🖼️ KIỂM DUYỆT HÌNH ẢNH & OCR */}
                        {(aiData.image_review || aiData.vision_analysis) && (
                          <div className="border-t border-white/10 pt-4 [html.light_&]:border-slate-200">
                            <ImageModerationAuditCard
                              imageReview={aiData.image_review}
                              visionAnalysis={aiData.vision_analysis}
                              event={event}
                              onClick={handleWarningClick}
                            />
                          </div>
                        )}

                        {/* 🟢 COMPLIANT CHECKS */}
                        {aiData.compliant_checks && aiData.compliant_checks.length > 0 && (
                          <div className="space-y-2 border-t border-white/10 pt-4 [html.light_&]:border-slate-200">
                            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#10B981]">
                              <CheckCircle2 className="size-3.5 text-[#10B981]" />
                              {isEnglish ? 'Compliant criteria' : 'Tiêu chí đạt chuẩn'} ({aiData.compliant_checks.length})
                            </span>
                            <div className="space-y-1 pl-1">
                              {aiData.compliant_checks.map((c, idx) => (
                                <CompliantCheckItem key={idx} check={c} />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 💡 SUGGESTIONS */}
                        {aiData.suggestions && aiData.suggestions.length > 0 && (
                          <div className="space-y-2.5 pt-4 border-t border-white/10 [html.light_&]:border-slate-200">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#E8B85D]">
                                <Sparkles className="size-3.5 text-[#E8B85D]" />
                                {isEnglish ? 'Adjustment suggestions for Organizer' : 'Gợi ý điều chỉnh cho BTC'} ({aiData.suggestions.length})
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const allSuggestions = aiData.suggestions
                                    .map(s => {
                                      const raw = typeof s === 'string' ? s : s.text || JSON.stringify(s)
                                      return `• ${raw}`
                                    })
                                    .join('\n')
                                  handleWarningClick(`[${isEnglish ? 'Suggestions for Organizer' : 'Gợi ý cho BTC'}]\n${allSuggestions}`)
                                }}
                                className="inline-flex items-center gap-1 text-[8px] font-medium text-[#E8B85D] hover:text-[#F3F4F6] transition cursor-pointer shrink-0"
                                title={isEnglish ? 'Click to copy all suggestions into notes' : 'Bấm để thêm toàn bộ gợi ý vào ghi chú'}
                              >
                                <span>+</span>
                                <span>{isEnglish ? 'Add to notes' : 'Thêm vào ghi chú'}</span>
                              </button>
                            </div>
                            <ul className="space-y-2 pl-1">
                              {aiData.suggestions.map((s, idx) => (
                                <SuggestionCard key={idx} suggestion={s} onClick={handleWarningClick} />
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <p className="mt-4 text-center text-[10px] text-slate-500 italic">
                        {isEnglish ? 'Click each item to automatically insert into review notes below.' : 'Bấm vào từng mục để tự động chèn vào ghi chú kiểm duyệt bên dưới.'}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Bottom Card: Admin Action Form Area (Tách thành 1 khối riêng bên dưới) */}
              <div className="shrink-0 bg-slate-950/95 rounded-[22px] border border-white/10 p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300 [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-lg">
                {/* Header: Note toggle & AI suggestion */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <button
                    type="button"
                    onClick={() => setIsNoteExpanded(!isNoteExpanded)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white transition group cursor-pointer [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:text-amber-800"
                    title={isNoteExpanded ? (isEnglish ? 'Click to collapse notes' : 'Bấm để thu gọn ô ghi chú') : (isEnglish ? 'Click to expand notes' : 'Bấm để mở rộng ô ghi chú')}
                  >
                    <span>
                      {isEnglish
                        ? (hasNote ? 'Review notes' : 'Review notes (Optional)')
                        : (hasNote ? 'Ghi chú kiểm duyệt' : 'Ghi chú kiểm duyệt (Tùy chọn)')}
                    </span>
                    {hasNote && (
                      <span className="rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black px-2 py-0.5 border border-amber-500/30 animate-pulse">
                        {noteLinesCount} {isEnglish ? (noteLinesCount > 1 ? 'items' : 'item') : 'mục'}
                      </span>
                    )}
                    {isNoteExpanded ? (
                      <ChevronUp className="size-3.5 text-slate-400 group-hover:text-white transition-transform [html.light_&]:text-slate-600" />
                    ) : (
                      <ChevronDown className="size-3.5 text-slate-400 group-hover:text-white transition-transform [html.light_&]:text-slate-600" />
                    )}
                  </button>

                  {aiData?.recommendation && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${aiData.recommendation === 'APPROVE'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-700 [html.light_&]:border-emerald-200'
                      : aiData.recommendation === 'REJECT'
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-400 [html.light_&]:bg-rose-50 [html.light_&]:text-rose-700 [html.light_&]:border-rose-200'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-400 [html.light_&]:bg-amber-50 [html.light_&]:text-amber-700 [html.light_&]:border-amber-200'
                      }`}>
                      {isEnglish
                        ? `AI Suggestion: ${aiData.recommendation === 'APPROVE' ? 'Approve' : aiData.recommendation === 'REJECT' ? 'Reject' : 'Needs revision'}`
                        : `Gợi ý AI: ${aiData.recommendation === 'APPROVE' ? 'Phê duyệt' : aiData.recommendation === 'REJECT' ? 'Từ chối' : 'Cần sửa đổi'}`}
                    </span>
                  )}
                </div>

                {/* Expandable Note Textarea */}
                {isNoteExpanded && (
                  <div className="mb-2.5">
                    <div className="mb-1 text-[10px] text-slate-400 [html.light_&]:text-slate-600">
                      <span>{isEnglish ? 'Enter or click AI suggestions above to insert into notes' : 'Nhập hoặc bấm gợi ý AI ở trên để tự chèn vào ghi chú'}</span>
                    </div>
                    <textarea
                      {...register('review_note')}
                      placeholder={isEnglish ? 'Enter review notes to send to organizer...' : 'Nhập ghi chú gửi cho Ban tổ chức...'}
                      className={`h-20 w-full resize-y rounded-xl border border-white/10 bg-black/50 p-2.5 text-xs font-medium text-white shadow-inner outline-none transition-all placeholder:text-slate-500 focus:border-amber-400/50 focus:bg-black/70 focus:ring-1 focus:ring-amber-400/50 [html.light_&]:bg-[#FAF5EC] [html.light_&]:border-[#C99A47]/30 [html.light_&]:text-[#0D1B2A] [html.light_&]:placeholder:text-slate-400 ${customScrollbar}`}
                    />
                  </div>
                )}

                {/* Decision Action Buttons */}
                <div className="grid gap-2.5 grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onSubmitReview('REJECTED')}
                    disabled={isPending}
                    className="w-full disabled:cursor-not-allowed disabled:opacity-50 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/25 text-slate-300 hover:text-white px-0 py-2.5 text-xs font-black shadow-sm transition cursor-pointer active:scale-95 [html.light_&]:bg-slate-100 [html.light_&]:border-slate-300 [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:bg-slate-200"
                  >
                    {event?.cancel_request?.status === 'PENDING'
                      ? (isEnglish ? 'Reject cancellation' : 'Từ chối hủy')
                      : event?.pending_revision
                        ? (isEnglish ? 'Reject revision' : 'Từ chối sửa đổi')
                        : (isEnglish ? 'Reject' : 'Từ chối')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSubmitReview('APPROVED')}
                    disabled={isPending}
                    className="admin-primary w-full disabled:cursor-not-allowed disabled:opacity-50 !px-0 !py-2.5 rounded-full font-black text-xs shadow-lg cursor-pointer"
                  >
                    {event?.cancel_request?.status === 'PENDING'
                      ? (isEnglish ? 'Approve cancellation' : 'Phê duyệt hủy')
                      : event?.pending_revision
                        ? (isEnglish ? 'Approve revision' : 'Phê duyệt sửa đổi')
                        : (isEnglish ? 'Approve' : 'Phê duyệt')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Collapsed Dock Bar (Mở ra / Expand horizontally) */
            <div className="shrink-0 lg:sticky lg:top-4 z-20 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => setIsAiExpanded(true)}
                className="group flex flex-col items-center gap-2.5 rounded-2xl border border-white/10 bg-slate-950/90 py-4 px-2.5 shadow-xl hover:border-amber-400/60 hover:bg-slate-900 transition-all duration-200 cursor-pointer [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/40 [html.light_&]:shadow-md"
                title={isEnglish ? 'Expand AI Review Assistant' : 'Mở rộng bảng AI (mở ra)'}
              >
                <div className="grid size-8 place-items-center rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30 group-hover:scale-110 transition-transform">
                  <ChevronLeft className="size-4" />
                </div>
                <Bot className="size-4 text-indigo-400" />
                <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-black uppercase tracking-wider text-slate-300 group-hover:text-amber-400 py-1 select-none [html.light_&]:text-[#0D1B2A]">
                  AI Review Assistant
                </span>
                {aiData?.recommendation && (
                  <span className={`size-2.5 rounded-full ${aiData.recommendation === 'APPROVE'
                    ? 'bg-emerald-400'
                    : aiData.recommendation === 'REJECT'
                      ? 'bg-rose-400'
                      : 'bg-amber-400'
                    } animate-pulse`} />
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsAiExpanded(true)}
                className="group flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-slate-950/90 py-3 px-2 shadow-lg hover:border-emerald-500/40 transition cursor-pointer [html.light_&]:bg-white [html.light_&]:border-slate-300"
                title={isEnglish ? 'Open Decision Actions' : 'Mở bảng duyệt'}
              >
                <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-bold uppercase tracking-wider text-emerald-400 select-none">
                  {isEnglish ? 'Actions' : 'Phê duyệt'}
                </span>
              </button>
            </div>
          )
        )}
      </div>

      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        subtitle={confirmState?.subtitle}
        eventTitle={confirmState?.eventTitle}
        description={confirmState?.description}
        tone={confirmState?.tone}
        confirmText={confirmState?.confirmText}
        cancelText={confirmState?.cancelText}
        confirmColor={confirmState?.confirmColor}
        onConfirm={confirmState?.onConfirm}
        onCancel={() => setConfirmState(null)}
      />

      <DocumentPreviewModal
        doc={previewDoc}
        onClose={() => setPreviewDoc(null)}
      />

      <AdminReviewCriteriaModal
        isOpen={isCriteriaOpen}
        onClose={() => setIsCriteriaOpen(false)}
      />

      {isSuspendModalOpen && (
        <AdminSuspendModal
          event={event}
          loading={suspendLoading}
          onClose={() => setIsSuspendModalOpen(false)}
          onConfirm={handleConfirmSuspend}
        />
      )}
    </div>
  )
}

function DocumentPreviewModal({ doc, onClose }) {
  if (!doc) return null

  const isImage = doc.type?.includes('image') || /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(doc.url) || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(doc.name)
  const isPdf = !isImage && (doc.type?.includes('pdf') || /\.pdf($|\?)/i.test(doc.url) || /\.pdf$/i.test(doc.name))
  const isDocx = !isImage && !isPdf && (doc.type?.includes('word') || doc.type?.includes('officedocument') || /\.(docx?)($|\?)/i.test(doc.url) || /\.(docx?)$/i.test(doc.name))

  const [activeTab, setActiveTab] = useState('preview') // 'preview' | 'ai_text'
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null)
  const [isLoadingPdf, setIsLoadingPdf] = useState(false)
  const [pdfLoadError, setPdfLoadError] = useState(null)

  const [extractedText, setExtractedText] = useState(doc.extractedText || null)
  const [isLoadingText, setIsLoadingText] = useState(false)
  const [textExtractError, setTextExtractError] = useState(null)
  const [copied, setCopied] = useState(false)

  // Reset tab and text when doc changes
  useEffect(() => {
    setActiveTab('preview')
    setExtractedText(doc.extractedText || null)
    setPdfBlobUrl(null)
    setPdfLoadError(null)
    setTextExtractError(null)
  }, [doc.url, doc.name, doc.extractedText])

  // 1. Fetch inline PDF blob for direct preview without forcing browser download
  useEffect(() => {
    let active = true
    let blobUrl = null

    if (isPdf && doc?.url) {
      setIsLoadingPdf(true)
      setPdfLoadError(null)

      fetchDocumentPreviewBlob(doc.url)
        .then((blob) => {
          if (!active) return
          blobUrl = URL.createObjectURL(blob)
          setPdfBlobUrl(blobUrl)
          setIsLoadingPdf(false)
        })
        .catch((err) => {
          if (!active) return
          console.warn('[DocumentPreview] Blob preview failed, falling back to direct URL:', err.message)
          setPdfLoadError('Không thể tạo luồng xem trực tiếp từ blob. Hệ thống tự động chuyển sang chế độ xem qua Google Docs Viewer.')
          setIsLoadingPdf(false)
        })
    }

    return () => {
      active = false
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [doc?.url, isPdf])

  // 2. Fetch or initialize extracted text for PDF and DOCX
  useEffect(() => {
    if (doc?.extractedText) {
      setExtractedText(doc.extractedText)
      return
    }

    if ((isPdf || isDocx) && doc?.url && !extractedText) {
      setIsLoadingText(true)
      setTextExtractError(null)

      extractDocumentText(doc.url)
        .then((data) => {
          if (data?.text) {
            setExtractedText(data.text)
          } else if (data?.hasText === false) {
            setTextExtractError('Tệp quét dạng hình ảnh (scan) hoặc không chứa lớp văn bản (text layer) trích xuất được.')
          } else {
            setTextExtractError('Không trích xuất được nội dung văn bản từ tệp này.')
          }
        })
        .catch((err) => {
          console.error('[DocumentPreview] Extract text error:', err)
          setTextExtractError('Lỗi trong quá trình trích xuất văn bản từ máy chủ.')
        })
        .finally(() => {
          setIsLoadingText(false)
        })
    }
  }, [doc?.url, doc?.extractedText, isPdf, isDocx])

  const handleCopyText = () => {
    if (!extractedText) return
    navigator.clipboard.writeText(extractedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const wordCount = extractedText ? extractedText.trim().split(/\s+/).filter(Boolean).length : 0
  const charCount = extractedText ? extractedText.length : 0

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-5xl h-[90vh] rounded-3xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5 bg-slate-900/95 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#C99A47]/20 text-[#E6C17A] ring-1 ring-[#C99A47]/40">
              {isPdf ? (
                <FileText className="size-5" />
              ) : isDocx ? (
                <FileCheck className="size-5" />
              ) : isImage ? (
                <ImageIcon className="size-5" />
              ) : (
                <FileCheck className="size-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-display text-sm sm:text-base font-bold text-white" title={doc.name}>
                {doc.name}
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="uppercase font-semibold text-[#E6C17A]">
                  {isPdf ? 'Tài liệu PDF' : isDocx ? 'Tài liệu Word (DOCX)' : isImage ? 'Hình ảnh / Scan' : 'Tài liệu đính kèm'}
                </span>
                {doc.size && (
                  <>
                    <span>•</span>
                    <span>{formatFileSize(doc.size)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Modal Header Tabs & Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {(isPdf || isDocx) && (
              <div className="flex items-center gap-1 mr-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`grid size-9 place-items-center rounded-xl transition cursor-pointer ${
                    activeTab === 'preview'
                      ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-black shadow-md shadow-[#C99A47]/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                  title="Xem trực tiếp"
                  aria-label="Xem trực tiếp"
                >
                  <Eye className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ai_text')}
                  className={`relative grid size-9 place-items-center rounded-xl transition cursor-pointer ${
                    activeTab === 'ai_text'
                      ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-black shadow-md shadow-[#C99A47]/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                  title="Văn bản AI trích xuất"
                  aria-label="Văn bản AI trích xuất"
                >
                  <Sparkles className="size-4" />
                  {extractedText && (
                    <span
                      className={`absolute top-1.5 right-1.5 size-1.5 rounded-full ${
                        activeTab === 'ai_text' ? 'bg-[#0D1B2A]' : 'bg-emerald-400'
                      }`}
                    />
                  )}
                </button>
              </div>
            )}

            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="grid size-9 place-items-center rounded-xl text-slate-400 hover:text-[#E6C17A] hover:bg-white/5 transition"
                title="Mở trong tab mới"
                aria-label="Mở trong tab mới"
              >
                <ExternalLink className="size-4" />
              </a>
            )}
            {doc.url && (
              <a
                href={doc.url}
                download={doc.name}
                target="_blank"
                rel="noopener noreferrer"
                className="grid size-9 place-items-center rounded-xl text-slate-400 hover:text-[#E6C17A] hover:bg-white/5 transition"
                title="Tải về máy"
                aria-label="Tải về máy"
              >
                <Download className="size-4" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="grid size-9 place-items-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              title="Đóng (Esc)"
              aria-label="Đóng"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Modal Content Preview */}
        <div className="flex-1 bg-black/40 overflow-hidden flex flex-col p-2 sm:p-4">
          {doc.url ? (
            isImage ? (
              <div className="h-full w-full flex items-center justify-center overflow-auto p-2">
                <img
                  src={doc.url}
                  alt={doc.name}
                  className="max-h-full max-w-full rounded-xl object-contain shadow-2xl border border-white/5"
                />
              </div>
            ) : isPdf ? (
              activeTab === 'preview' ? (
                <div className="w-full h-full flex flex-col relative rounded-2xl overflow-hidden border border-white/10 bg-slate-950">
                  {isLoadingPdf && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm gap-3">
                      <Loader2 className="size-8 text-indigo-400 animate-spin" />
                      <p className="text-xs text-slate-300 font-medium">
                        Đang kết nối luồng hiển thị PDF trực tuyến (không cần tải về)...
                      </p>
                    </div>
                  )}

                  {pdfBlobUrl ? (
                    <iframe
                      src={`${pdfBlobUrl}#toolbar=1`}
                      className="w-full flex-1 border-0 bg-slate-950"
                      title={doc.name}
                    />
                  ) : pdfLoadError ? (
                    <div className="w-full flex-1 flex flex-col">
                      <iframe
                        src={`https://docs.google.com/viewer?url=${encodeURIComponent(doc.url)}&embedded=true`}
                        className="w-full flex-1 border-0 bg-slate-950"
                        title={doc.name}
                      />
                      <div className="flex items-center px-4 py-2 bg-slate-900 border-t border-white/10 text-xs text-slate-400">
                        <span>Đang hiển thị qua Google Docs Viewer.</span>
                      </div>
                    </div>
                  ) : (
                    <iframe
                      src={`${doc.url}#toolbar=1`}
                      className="w-full flex-1 border-0 bg-slate-950"
                      title={doc.name}
                    />
                  )}
                </div>
              ) : (
                /* TAB 2: AI EXTRACTED TEXT (PDF) */
                <div className="w-full h-full flex flex-col rounded-2xl overflow-hidden border border-white/10 bg-slate-950/90 p-4 sm:p-5">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Nội dung văn bản được AI trích xuất từ PDF
                      </span>
                      {wordCount > 0 && (
                        <span className="text-[11px] text-slate-400">
                          ({wordCount.toLocaleString()} từ • {charCount.toLocaleString()} ký tự)
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyText}
                      disabled={!extractedText}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
                    >
                      {copied ? (
                        <>
                          <Check className="size-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">Đã sao chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isLoadingText ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="size-8 text-indigo-400 animate-spin" />
                      <p className="text-xs text-slate-400">Đang trích xuất văn bản từ tệp PDF...</p>
                    </div>
                  ) : textExtractError ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
                      <AlertCircle className="size-8 text-amber-400 mb-2" />
                      <p className="text-xs text-slate-300">{textExtractError}</p>
                    </div>
                  ) : extractedText ? (
                    <div className="flex-1 overflow-y-auto rounded-xl border border-white/5 bg-black/40 p-4 font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap select-text">
                      {extractedText}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs text-slate-500 italic">
                      Không có nội dung văn bản nào được trích xuất.
                    </div>
                  )}
                </div>
              )
            ) : isDocx ? (
              activeTab === 'preview' ? (
                /* TAB 1: DOCX PREVIEW VIA GOOGLE DOCS VIEWER */
                <div className="w-full h-full flex flex-col relative rounded-2xl overflow-hidden border border-white/10 bg-slate-950">
                  <iframe
                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(doc.url)}&embedded=true`}
                    className="w-full flex-1 border-0 bg-slate-950"
                    title={doc.name}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900 border-t border-white/10 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-indigo-400" />
                      <span>Xem trước văn bản Word trực tuyến. Nếu cần đọc trích đoạn đối chiếu, chọn tab <strong>"Văn bản AI trích xuất"</strong>.</span>
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <a
                        href={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(doc.url)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 font-semibold"
                      >
                        Mở bằng Office Online
                      </a>
                      <span>•</span>
                      <a
                        href={doc.url}
                        download={doc.name}
                        className="text-slate-300 hover:text-white"
                      >
                        Tải tệp gốc
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                /* TAB 2: AI EXTRACTED TEXT (DOCX) */
                <div className="w-full h-full flex flex-col rounded-2xl overflow-hidden border border-white/10 bg-slate-950/90 p-4 sm:p-5">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="flex size-2 rounded-full bg-blue-400 animate-pulse" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Nội dung văn bản được AI trích xuất từ tài liệu Word (.docx)
                      </span>
                      {wordCount > 0 && (
                        <span className="text-[11px] text-slate-400">
                          ({wordCount.toLocaleString()} từ • {charCount.toLocaleString()} ký tự)
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyText}
                      disabled={!extractedText}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
                    >
                      {copied ? (
                        <>
                          <Check className="size-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">Đã sao chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isLoadingText ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="size-8 text-indigo-400 animate-spin" />
                      <p className="text-xs text-slate-400">Đang trích xuất nội dung văn bản từ tệp Word...</p>
                    </div>
                  ) : textExtractError ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
                      <AlertCircle className="size-8 text-amber-400 mb-2" />
                      <p className="text-xs text-slate-300">{textExtractError}</p>
                    </div>
                  ) : extractedText ? (
                    <div className="flex-1 overflow-y-auto rounded-xl border border-white/5 bg-black/40 p-4 font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap select-text">
                      {extractedText}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs text-slate-500 italic">
                      Không có nội dung văn bản nào được trích xuất từ tệp này.
                    </div>
                  )}
                </div>
              )
            ) : (
              // For other unknown doc formats
              <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto my-auto">
                <div className="grid size-16 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-400 mb-4 ring-1 ring-indigo-500/20">
                  <FileText className="size-8" />
                </div>
                <h4 className="font-bold text-white text-base mb-1">{doc.name}</h4>
                <p className="text-xs text-slate-400 mb-6">
                  Định dạng tài liệu này được hỗ trợ xem trực tiếp qua trình xem trực tuyến hoặc tải về.
                </p>
                <div className="flex items-center gap-3">
                  <a
                    href={`https://docs.google.com/viewer?url=${encodeURIComponent(doc.url)}&embedded=true`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition"
                  >
                    <ExternalLink className="size-4" />
                    Xem trực tiếp trực tuyến
                  </a>
                  <a
                    href={doc.url}
                    download={doc.name}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/10 transition"
                  >
                    <Download className="size-4" />
                    Tải về máy
                  </a>
                </div>
              </div>
            )
          ) : (
            <div className="text-center p-8 text-slate-500 text-sm">
              Không tìm thấy đường dẫn tài liệu.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SparklesIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  )
}

function ConfirmModal({
  open,
  title,
  subtitle,
  eventTitle,
  description,
  tone = 'primary',
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  confirmColor,
  isPending = false,
}) {
  const { isEnglish } = useLanguage()
  const resolvedConfirmText = confirmText || (isEnglish ? 'Confirm' : 'Xác nhận')
  const resolvedCancelText = cancelText || (isEnglish ? 'Cancel' : 'Hủy bỏ')
  if (!open) return null

  const getToneConfig = () => {
    switch (tone) {
      case 'gold':
      case 'success':
        return {
          icon: CheckCircle2,
          iconWrap: 'bg-[#C99A47]/20 text-[#E6C17A] border border-[#C99A47]/40 shadow-[0_0_15px_rgba(201,154,71,0.2)]',
          btnClass: confirmColor || 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-black shadow-lg shadow-[#C99A47]/30 hover:brightness-110 active:scale-95 border border-[#E6C17A]/40',
        }
      case 'danger':
        return {
          icon: AlertTriangle,
          iconWrap: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
          btnClass: confirmColor || 'bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-lg shadow-rose-900/40',
        }
      case 'warning':
        return {
          icon: AlertTriangle,
          iconWrap: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
          btnClass: confirmColor || 'bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-lg shadow-amber-900/40',
        }
      default:
        return {
          icon: CheckCircle2,
          iconWrap: 'bg-primary/20 text-primary border border-primary/30',
          btnClass: confirmColor || 'bg-primary hover:brightness-110 text-slate-950 font-bold shadow-lg shadow-primary/20',
        }
    }
  }

  const { icon: ToneIcon, iconWrap, btnClass } = getToneConfig()

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0b1329] p-7 shadow-2xl shadow-black/95 text-white [html.light_&]:bg-white [html.light_&]:border-slate-200 [html.light_&]:text-[#0D1B2A] [html.light_&]:shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className={`grid size-13 shrink-0 place-items-center rounded-2xl ${iconWrap}`}>
              <ToneIcon className="size-7" />
            </span>
            <div>
              <h3 className="text-2xl font-black text-white [html.light_&]:text-[#0D1B2A] tracking-tight">{title}</h3>
              {subtitle ? (
                <p className="mt-1.5 text-sm font-medium text-slate-300 [html.light_&]:text-slate-600">{subtitle}</p>
              ) : (
                <p className="mt-1.5 text-sm font-medium text-slate-400 [html.light_&]:text-slate-500">
                  {isEnglish ? 'Please check information carefully before confirming.' : 'Vui lòng kiểm tra kỹ thông tin trước khi xác nhận.'}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition [html.light_&]:text-slate-500 [html.light_&]:hover:bg-slate-100 [html.light_&]:hover:text-slate-900"
          >
            <X className="size-5 sm:size-6" />
          </button>
        </div>

        {/* Event highlight box */}
        {eventTitle && (
          <div className="mt-5 rounded-xl border border-white/15 bg-[#121c38]/90 p-4 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-slate-600">
              {isEnglish ? 'Target Event:' : 'Sự kiện xử lý:'}
            </p>
            <p className="font-extrabold text-white [html.light_&]:text-[#0D1B2A] text-base mt-1 truncate">{eventTitle}</p>
          </div>
        )}

        {/* Description */}
        {description && (
          <p className="mt-4 text-base sm:text-lg font-semibold text-slate-200 [html.light_&]:text-slate-700 leading-relaxed">
            {description}
          </p>
        )}

        {/* Footer buttons */}
        <div className="mt-7 flex gap-3.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 rounded-xl border border-white/15 bg-slate-800/80 px-5 py-3 text-sm sm:text-base font-bold text-slate-300 transition hover:bg-slate-700/80 hover:text-white disabled:opacity-50 active:scale-95 [html.light_&]:bg-slate-100 [html.light_&]:border-slate-300 [html.light_&]:text-slate-700 [html.light_&]:hover:bg-slate-200"
          >
            {resolvedCancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`flex-1 rounded-xl px-5 py-3 text-sm sm:text-base font-black transition disabled:opacity-50 active:scale-95 ${btnClass}`}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span>{isEnglish ? 'Processing...' : 'Đang xử lý...'}</span>
              </span>
            ) : (
              resolvedConfirmText
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
