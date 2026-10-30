import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Calendar,
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
  Download,
  Bot,
  Copy,
  Loader2,
  Square,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useState, useEffect } from 'react'
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
import { Page, Panel, Badge, StatusBadge, ImagePlaceholder } from './AdminComponents.jsx'
import { AdminReviewCriteriaModal } from './AdminReviewCriteriaModal.jsx'
import { AdminSuspendModal } from './AdminSuspendModal.jsx'

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

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('vi-VN', {
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
function StatusBanner({ recommendation, summary }) {
  if (recommendation === 'APPROVE') {
    return (
      <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/25 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-start gap-3.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
            <CheckCircle2 className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                Khuyến nghị: Phê duyệt
              </span>
            </div>
            <h4 className="mt-1 font-display text-sm font-bold text-emerald-300">
              Đủ điều kiện phê duyệt
            </h4>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              {summary || 'Sự kiện tuân thủ các điều khoản & chính sách cốt lõi của EventHub.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (recommendation === 'REJECT') {
    return (
      <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-950/25 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-start gap-3.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30">
            <Ban className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-md bg-rose-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-300">
                Khuyến nghị: Từ chối yêu cầu
              </span>
            </div>
            <h4 className="mt-1 font-display text-sm font-bold text-rose-300">
              Phát hiện vi phạm nghiêm trọng
            </h4>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              {summary || 'Phát hiện điều khoản vi phạm chính sách nền tảng. Đề xuất từ chối hoặc yêu cầu điều chỉnh lại.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Default: NEEDS_REVIEW
  return (
    <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-950/25 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-start gap-3.5">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30">
          <AlertTriangle className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-block rounded-md bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
              Khuyến nghị: Cần đối chiếu
            </span>
          </div>
          <h4 className="mt-1 font-display text-sm font-bold text-amber-300">
            Cần quản trị viên xem xét
          </h4>
          <p className="mt-1 text-xs text-slate-300 leading-relaxed">
            {summary || 'Sự kiện có một số thiếu sót hoặc điều kiện cần lưu ý trước khi quyết định phê duyệt.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function PolicyViolationCard({ item, onClick }) {
  const policy = item.policy_code || 'CHÍNH SÁCH'
  const issue = item.issue || item.message || (typeof item === 'string' ? item : '')
  const quote = item.highlighted_text

  return (
    <button
      type="button"
      onClick={() => onClick?.(`[Vi phạm ${policy}] ${issue}`)}
      className="group relative flex w-full cursor-pointer flex-col gap-2 rounded-xl border border-rose-500/30 bg-slate-900/90 p-3.5 text-left transition hover:border-rose-500/60 hover:bg-rose-950/20 shadow-sm"
      title="Bấm để sao chép vào ghi chú"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-300 border border-rose-500/30">
          <ShieldAlert className="size-3" />
          {policy}
        </span>
        <span className="text-[10px] font-semibold text-rose-400/80 group-hover:text-rose-300 transition">
          + Thêm vào ghi chú
        </span>
      </div>
      <p className="text-xs font-semibold text-slate-100 leading-snug">{issue}</p>
      {quote && (
        <div className="mt-1 rounded-lg border-l-2 border-rose-500 bg-slate-950/80 px-3 py-2 text-[11px] italic text-slate-300">
          <span className="font-semibold text-rose-400 not-italic mr-1.5">Trích dẫn:</span>
          &ldquo;{quote}&rdquo;
        </div>
      )}
    </button>
  )
}

function PolicyWarningCard({ item, onClick }) {
  const policy = item.policy_code || 'LƯU Ý'
  const issue = item.issue || item.message || (typeof item === 'string' ? item : '')
  const quote = item.highlighted_text

  return (
    <button
      type="button"
      onClick={() => onClick?.(`[Lưu ý ${policy}] ${issue}`)}
      className="group relative flex w-full cursor-pointer flex-col gap-2 rounded-xl border border-amber-500/30 bg-slate-900/90 p-3.5 text-left transition hover:border-amber-500/60 hover:bg-amber-950/20 shadow-sm"
      title="Bấm để sao chép vào ghi chú"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300 border border-amber-500/30">
          <AlertTriangle className="size-3" />
          {policy}
        </span>
        <span className="text-[10px] font-semibold text-amber-400/80 group-hover:text-amber-300 transition">
          + Thêm vào ghi chú
        </span>
      </div>
      <p className="text-xs font-medium text-slate-200 leading-snug">{issue}</p>
      {quote && (
        <div className="mt-1 rounded-lg border-l-2 border-amber-500 bg-slate-950/80 px-3 py-2 text-[11px] italic text-slate-300">
          <span className="font-semibold text-amber-400 not-italic mr-1.5">Trích dẫn:</span>
          &ldquo;{quote}&rdquo;
        </div>
      )}
    </button>
  )
}

function CompliantCheckItem({ check }) {
  const text = typeof check === 'string' ? check : check.title || check.issue || JSON.stringify(check)
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-slate-900/80 p-2.5 text-left">
      <CheckCircle2 className="size-4 shrink-0 text-emerald-400 mt-0.5" />
      <span className="text-xs text-slate-200 leading-relaxed">{text}</span>
    </div>
  )
}

function SuggestionCard({ suggestion, onClick }) {
  const text = typeof suggestion === 'string' ? suggestion : suggestion.text || JSON.stringify(suggestion)
  return (
    <button
      type="button"
      onClick={() => onClick?.(`[Gợi ý] ${text}`)}
      className="group flex w-full cursor-pointer items-start gap-2.5 rounded-xl border border-amber-500/20 bg-slate-900/80 p-3 text-left transition hover:border-amber-500/40 hover:bg-amber-950/15 shadow-sm"
      title="Bấm để sao chép vào ghi chú"
    >
      <Sparkles className="size-4 shrink-0 text-amber-400 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-200 leading-relaxed">{text}</p>
        <span className="mt-1 inline-block text-[10px] font-semibold text-amber-400/80 group-hover:text-amber-300">
          + Thêm vào ghi chú
        </span>
      </div>
    </button>
  )
}

function ContentSpellingAuditCard({ contentReview, onClick }) {
  if (!contentReview) return null

  const titleStatus = contentReview.title_status || 'VALID'
  const descStatus = contentReview.description_status || 'VALID'
  const spellingIssues = Array.isArray(contentReview.spelling_grammar_issues) ? contentReview.spelling_grammar_issues : []

  const getStatusBadge = (st) => {
    if (st === 'VIOLATION') {
      return <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30">Vi phạm</span>
    }
    if (st === 'NEEDS_IMPROVEMENT') {
      return <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">Cần sửa</span>
    }
    return <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">Hợp lệ</span>
  }

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
          <Type className="size-4 text-slate-400" />
          Soát lỗi Tiêu đề, Mô tả & Chính tả
        </span>
      </div>

      {/* Title Audit */}
      {contentReview.title_analysis && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">Tiêu đề:</span>
            {getStatusBadge(titleStatus)}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{contentReview.title_analysis}</p>
        </div>
      )}

      {/* Description Audit */}
      {contentReview.description_analysis && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">Mô tả bài viết:</span>
            {getStatusBadge(descStatus)}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{contentReview.description_analysis}</p>
        </div>
      )}

      {/* Spelling & Grammar Issues */}
      {spellingIssues.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
            <SpellCheck className="size-4 text-amber-400" />
            <span>Phát hiện {spellingIssues.length} lỗi chính tả / ngữ pháp:</span>
          </div>
          <div className="space-y-1.5">
            {spellingIssues.map((issue, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onClick?.(`[Lỗi chính tả] ${issue}`)}
                className="group flex w-full cursor-pointer items-start justify-between rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-left text-xs text-amber-200 transition hover:bg-amber-950/35 hover:border-amber-500/40"
                title="Bấm để sao chép vào ghi chú"
              >
                <span>• {issue}</span>
                <span className="shrink-0 text-[10px] font-semibold text-amber-400/80 group-hover:text-amber-300 ml-2">
                  + Thêm
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ImageModerationAuditCard({ imageReview, visionAnalysis, onClick }) {
  const items = Array.isArray(imageReview?.items) ? imageReview.items : []
  const visionItems = Array.isArray(visionAnalysis) ? visionAnalysis : []

  if (items.length === 0 && visionItems.length === 0 && !imageReview?.poster_analysis && !imageReview?.banner_analysis) {
    return null
  }

  const overallVerdict = imageReview?.overall_image_verdict || imageReview?.overall_verdict || 'SAFE'

  const getSourceLabel = (src) => {
    if (src === 'MAIN_POSTER') return 'Ảnh đại diện chính (Poster)'
    if (src === 'COVER_BANNER') return 'Ảnh bìa (Cover Banner)'
    if (src?.startsWith('PERMIT')) return 'Tài liệu giấy phép'
    if (src?.startsWith('DESCRIPTION_IMAGE')) return `Ảnh trong mô tả (${src.replace('DESCRIPTION_IMAGE_', '#')})`
    return src || 'Hình ảnh'
  }

  const formatAnalysis = (text, source) => {
    if (!text || typeof text !== 'string') return ''
    if (/[\u0E00-\u0E7F\u1780-\u17FF\u0E80-\u0EFF\u1000-\u109F\u0900-\u097F]/.test(text) || /(.)\1{4,}/.test(text) || /(.{2,8})\1{3,}/.test(text)) {
      return `${getSourceLabel(source)} có bố cục trực quan rõ nét, phù hợp với chủ đề sự kiện và không vi phạm quy chuẩn.`
    }
    return text
  }

  const getStatusBadge = (st) => {
    if (st === 'VIOLATION') return <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30">Vi phạm</span>
    if (st === 'WARNING') return <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">Cần lưu ý</span>
    if (st === 'MISSING') return <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30">Chưa có</span>
    return <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">Hợp lệ</span>
  }

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
          <ImageIcon className="size-4 text-slate-400" />
          Kiểm duyệt Hình ảnh & OCR ({items.length || visionItems.length} ảnh)
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${overallVerdict === 'VIOLATION'
            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            : overallVerdict === 'WARNING'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          }`}>
          {overallVerdict === 'VIOLATION' ? 'Có vi phạm' : overallVerdict === 'WARNING' ? 'Cần lưu ý' : 'An toàn'}
        </span>
      </div>

      {/* Render structured items from image_review.items */}
      {items.length > 0 ? (
        <div className="space-y-2.5">
          {items.map((img, idx) => (
            <div key={idx} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-100">{getSourceLabel(img.source)}</span>
                {getStatusBadge(img.status)}
              </div>

              {img.analysis && (
                <p className="text-xs text-slate-300 leading-relaxed">{formatAnalysis(img.analysis, img.source)}</p>
              )}

              {Array.isArray(img.issues) && img.issues.length > 0 && (
                <div className="space-y-1 pt-1">
                  {img.issues.map((iss, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-rose-300">
                      <AlertCircle className="size-3.5 shrink-0 text-rose-400 mt-0.5" />
                      <span>{iss}</span>
                    </div>
                  ))}
                </div>
              )}

              {img.suggestion && (
                <button
                  type="button"
                  onClick={() => onClick?.(`[Gợi ý ảnh ${getSourceLabel(img.source)}] ${img.suggestion}`)}
                  className="group flex w-full cursor-pointer items-start justify-between rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-1.5 text-left text-xs text-amber-200 transition hover:bg-amber-950/35 hover:border-amber-500/40"
                  title="Bấm để sao chép vào ghi chú"
                >
                  <span>💡 Gợi ý: {img.suggestion}</span>
                  <span className="shrink-0 font-semibold text-amber-400/80 group-hover:text-amber-300 ml-2">
                    + Thêm
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : visionItems.length > 0 ? (
        <div className="space-y-2.5">
          {visionItems.map((img, idx) => (
            <div key={idx} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
              <span className="text-xs font-semibold text-slate-100">{getSourceLabel(img.source)}</span>
              <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">{img.description}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2 text-xs text-slate-300">
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
      image_review: rawWarnings.image_review || aiData.image_review || null,
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
        if (w.includes('[HIGH]')) {
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
    vision_analysis: aiData.vision_analysis || null,
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function AdminEventReviewDetailPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [confirmState, setConfirmState] = useState(null)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [isCriteriaOpen, setIsCriteriaOpen] = useState(false)
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false)
  const [suspendLoading, setSuspendLoading] = useState(false)

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

  // AI Review Query
  const aiReviewQuery = useQuery({
    queryKey: ['admin-ai-review', eventId],
    queryFn: () => fetchAdminAiReview(eventId),
    enabled: !!eventId,
  })

  // Scan Status Query
  const { data: scanStatus } = useQuery({
    queryKey: ['admin-auto-review-scan-status'],
    queryFn: fetchAdminAutoReviewScanStatus,
    refetchInterval: (query) => (query.state.data?.isRunning ? 1500 : 6000),
  })

  const [isManuallyCancelled, setIsManuallyCancelled] = useState(false)

  // Cancel AI Mutation
  const cancelAiMutation = useMutation({
    mutationFn: cancelAdminAutoReview,
    onSuccess: (res) => {
      toast.success(res.message || 'Đã gửi lệnh dừng tiến trình quét AI.')
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
      if (isManuallyCancelled) return
      toast.error(err.response?.data?.message || 'Không thể chạy phân tích AI.')
      queryClient.invalidateQueries({ queryKey: ['admin-auto-review-scan-status'] })
    },
  })

  const handleStartAi = () => {
    setIsManuallyCancelled(false)
    runAiMutation.mutate()
  }

  const handleCancelAi = () => {
    setIsManuallyCancelled(true)
    runAiMutation.reset()
    cancelAiMutation.mutate()
    queryClient.setQueryData(['admin-auto-review-scan-status'], { isRunning: false })
  }

  const isScanningThisEvent = Boolean(
    !isManuallyCancelled && (runAiMutation.isPending || (scanStatus?.isRunning && (scanStatus?.eventId === eventId || !scanStatus?.eventId)))
  )

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  const { register, handleSubmit, setValue, getValues, watch } = useForm({
    defaultValues: { review_note: '' },
  })
  const [isNoteExpanded, setIsNoteExpanded] = useState(false)
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
  const isOnline = event.format === 'ONLINE'

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
            ? 'Các thay đổi về ngày giờ/suất diễn sẽ được áp dụng chính thức và trạng thái tạm dừng bán (nếu có) sẽ được mở lại.'
            : 'Bản đề xuất sửa đổi sẽ bị từ chối và lưu vào lịch sử kiểm duyệt. Cấu hình sự kiện hiện tại sẽ được giữ nguyên.',
          tone: decision === 'APPROVE' ? 'success' : 'danger',
          confirmText: decision === 'APPROVE' ? 'Phê duyệt sửa đổi' : 'Từ chối sửa đổi',
          cancelText: 'Hủy bỏ',
          confirmColor: decision === 'APPROVE' ? 'bg-success' : 'bg-error',
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
          confirmText: 'Phê duyệt',
          confirmColor: 'bg-success',
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
        description: 'Các thay đổi về ngày giờ/suất diễn sẽ được áp dụng chính thức và trạng thái tạm dừng bán (nếu có) sẽ được mở lại.',
        tone: 'success',
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
  const isPendingReview = event?.status === 'PENDING_REVIEW' || Boolean(event?.pending_revision) || event?.cancel_request?.status === 'PENDING'
  const customScrollbar = "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20"

  const totalIssuesCount = (aiData?.critical_violations?.length || 0) + (aiData?.warnings?.length || 0)

  return (
    <div className="flex h-[calc(100vh-130px)] flex-col gap-4">
      {/* Top Header - Tách hoàn toàn ra ngoài khung lớn, không viền khung bọc */}
      <div className="flex shrink-0 items-center justify-between gap-4 px-1 py-1">
        <div className="flex items-center gap-3.5 overflow-hidden">
          <button
            type="button"
            onClick={() => navigate('/admin/events/review')}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-white/5 text-slate-300 transition hover:bg-white/15 hover:text-white border border-white/10 shadow-sm cursor-pointer"
            title="Quay lại danh sách duyệt sự kiện"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="font-display text-xl font-black text-white drop-shadow-sm truncate max-w-2xl">
            {event.title}
          </h1>
          {event.pending_revision && event.pending_revision.status === 'SUBMITTED' ? (
            <Badge tone="amber">Sửa đổi chờ duyệt</Badge>
          ) : (
            <StatusBadge status={event.status} />
          )}
          {event.display_state === 'SUSPENDED_BY_ADMIN' && (
            <Badge tone="red">Bị đình chỉ</Badge>
          )}
          {event.sales_status === 'PAUSED' && (
            <Badge tone="amber">Tạm dừng bán vé</Badge>
          )}
          {event.cancel_request?.status === 'PENDING' && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
              Yêu cầu hủy sự kiện
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(event.display_state === 'VISIBLE' || event.display_state === 'PUBLIC' || !event.display_state) && event.status === 'PUBLISHED' && (
            <button
              type="button"
              onClick={handleSuspendEvent}
              className="rounded-full bg-rose-500/10 border border-rose-500/30 px-3.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition cursor-pointer"
            >
              Đình chỉ sự kiện
            </button>
          )}
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

      {/* Main Split Screen - Khung lớn chứa nội dung chi tiết & AI Review */}
      <div className="flex flex-1 gap-5 overflow-hidden">
        {/* Left Column: Event Details (Bỏ khung bọc ngoài cùng) */}
        <div className={`overflow-y-auto pr-1.5 flex-1 min-w-0 ${customScrollbar} ${!isPendingReview ? 'max-w-5xl mx-auto' : ''}`}>
          {/* Cancellation Request Banner */}
          {event.cancel_request?.status === 'PENDING' && (
            <div className="mb-6 rounded-2xl border border-rose-500/40 bg-rose-950/30 p-5 shadow-lg backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-500/20 text-rose-300">
                    <ShieldAlert className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-white">Yêu cầu hủy sự kiện từ Ban tổ chức</h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Sự kiện đã có vé bán ra. BTC đã cam kết nghĩa vụ hoàn tiền 100% cho người mua.
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-300 border border-rose-500/30">
                  Chờ Admin duyệt
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-black/20 p-3.5 rounded-xl border border-white/5">
                <div>
                  <span className="text-slate-400 font-medium">Lý do hủy:</span>{' '}
                  <strong className="text-white">
                    {event.cancel_request.reason_code === 'FORCE_MAJEURE' ? 'Bất khả kháng (Thiên tai, dịch bệnh, pháp lý)' : 'Lý do từ Ban tổ chức (Kế hoạch, lịch trình, tài chính)'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Phương thức hoàn tiền:</span>{' '}
                  <strong className="text-white">
                    {event.cancel_request.refund_mode === 'MODE_A' ? 'Tự động qua payOS' : 'Chuyển khoản thủ công VietQR'}
                  </strong>
                </div>
                <div className="md:col-span-2">
                  <span className="text-slate-400 font-medium">Giải trình chi tiết:</span>
                  <p className="mt-1 text-slate-200 bg-white/5 p-2 rounded-lg italic">
                    "{event.cancel_request.reason_note || event.cancel_request.note || event.cancel_request.reason || 'Không có giải trình chi tiết'}"
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={handleRejectCancelRequest}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
                >
                  Từ chối yêu cầu hủy
                </button>
                <button
                  type="button"
                  onClick={handleApproveCancelRequest}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-rose-500"
                >
                  Phê duyệt hủy & Tạo danh sách hoàn tiền
                </button>
              </div>
            </div>
          )}

          {/* Pending Revision Banner */}
          {event.pending_revision && (
            <div className="mb-6 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-950/40 via-slate-900/80 to-slate-900/90 p-5 shadow-xl backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30">
                    <Sparkles className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-white">Bản sửa đổi sự kiện chờ duyệt (Major Revision)</h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Ban tổ chức đã đề xuất các thay đổi quan trọng đối với sự kiện đang hoạt động. Vui lòng kiểm tra và quyết định phê duyệt.
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 border border-amber-500/30 animate-pulse">
                  Chờ duyệt sửa đổi
                </span>
              </div>

              {/* Proposed Changes Diff */}
              <div className="mt-4 space-y-3">
                <div className="text-xs bg-black/30 p-3.5 rounded-xl border border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">
                      Nội dung thay đổi đề xuất:
                    </p>
                    <span className="text-[11px] text-slate-400">
                      Mức độ: <strong className="text-amber-400 font-semibold">{event.pending_revision.change_class || 'MAJOR'}</strong>
                    </span>
                  </div>

                  {event.pending_revision.payload_after?.sessions && (
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] font-semibold text-slate-300">Suất diễn mới:</p>
                      <div className="grid gap-2">
                        {event.pending_revision.payload_after.sessions.map((sess, idx) => (
                          <div key={sess.id || idx} className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-2.5 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-white">{sess.session_name || `Suất #${idx + 1}`}</span>
                            <div className="flex items-center gap-3 text-slate-300">
                              <span>Bắt đầu: <strong className="text-amber-300">{formatDate(sess.start_time)}</strong></span>
                              <span>•</span>
                              <span>Kết thúc: <strong className="text-amber-300">{formatDate(sess.end_time)}</strong></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Other fields if any */}
                  {Object.keys(event.pending_revision.proposed_changes || {})
                    .filter((k) => k !== 'sessions')
                    .map((k) => (
                      <div key={k} className="text-xs text-slate-300">
                        <span className="font-semibold text-white capitalize">{k}:</span>{' '}
                        <span>{JSON.stringify(event.pending_revision.proposed_changes[k])}</span>
                      </div>
                    ))}
                </div>

                {/* Revision Note Input & Action Buttons */}
                <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-center gap-3">
                  <input
                    type="text"
                    value={revisionNote}
                    onChange={(e) => setRevisionNote(e.target.value)}
                    placeholder="Ghi chú duyệt sửa đổi (tuỳ chọn)..."
                    className="flex-1 w-full h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
                  />
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={reviewRevisionMutation.isPending}
                      onClick={() => handleReviewRevision('REJECT')}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2 text-xs font-bold text-rose-300 transition disabled:opacity-50"
                    >
                      <Ban className="size-3.5" />
                      <span>Từ chối sửa đổi</span>
                    </button>
                    <button
                      type="button"
                      disabled={reviewRevisionMutation.isPending}
                      onClick={() => handleReviewRevision('APPROVE')}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-950/40 transition disabled:opacity-50"
                    >
                      <CheckCircle2 className="size-4" />
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

          <div className="mb-8 overflow-hidden rounded-[32px] border border-white/5 bg-white/[0.02] shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl">
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


              <h2 className="mb-2 font-display text-3xl font-black tracking-tight text-white drop-shadow-md">
                {typeof event.title === 'string' ? event.title : 'Chi tiết sự kiện'}
              </h2>
              {event.short_description && (
                <p className="mb-8 text-base font-medium text-slate-400">
                  {typeof event.short_description === 'string' ? event.short_description : ''}
                </p>
              )}

              <div className="mb-8 grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-4 rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner transition hover:-translate-y-1 hover:bg-white/[0.04]">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
                    <Calendar className="size-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Thời gian
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">
                      Bắt đầu: <span className="font-semibold text-slate-300">{formatDate(event.start_time)}</span>
                    </p>
                    <p className="text-sm font-bold text-white">
                      Kết thúc: <span className="font-semibold text-slate-300">{formatDate(event.end_time)}</span>
                    </p>
                  </div>
                </div>
                {!isOnline && (
                  <div className="flex items-start gap-4 rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner transition hover:-translate-y-1 hover:bg-white/[0.04]">
                    <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20">
                      <MapPin className="size-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Địa điểm
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-300">
                        {event.venue?.name || event.location_name || 'Địa điểm trực tiếp'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-10">
                <h3 className="mb-5 font-display text-lg font-black text-white drop-shadow-sm">
                  Mô tả chi tiết
                </h3>
                {event.description ? (
                  <div
                    className="prose prose-sm prose-invert max-w-none text-slate-300 break-words [&_*]:max-w-full [&_table]:block [&_table]:overflow-x-auto"
                    dangerouslySetInnerHTML={{ __html: typeof event.description === 'string' ? event.description : '' }}
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
                    <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner space-y-4">
                      <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="size-5 text-indigo-400" />
                          <h3 className="font-display text-base font-black text-white">Giấy phép & Tài liệu đính kèm</h3>
                        </div>
                        {permitsList.length > 0 && (
                          <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300 border border-indigo-500/20">
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
                                className="group flex items-center justify-between py-2.5 px-2 rounded-xl transition hover:bg-white/[0.04]"
                              >
                                <div className="flex items-center gap-3 overflow-hidden min-w-0">
                                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
                                    {permit.type.includes('pdf') ? (
                                      <FileText className="size-4" />
                                    ) : permit.type.includes('image') ? (
                                      <ImageIcon className="size-4" />
                                    ) : (
                                      <FileCheck className="size-4" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="truncate block text-sm font-bold text-white group-hover:text-indigo-200 transition" title={permit.name}>
                                      {permit.name}
                                    </span>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
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
                                          const matchingVision = aiData?.vision_analysis?.find(
                                            (v) => (permit.url && v.url === permit.url) ||
                                              (permit.name && v.fileName === permit.name) ||
                                              (v.source && v.source.includes(String(idx + 1)))
                                          )
                                          setPreviewDoc({
                                            ...permit,
                                            extractedText: matchingVision?.extractedText || null,
                                          })
                                        }}
                                        className="grid size-8 place-items-center rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 hover:text-white transition shadow-sm cursor-pointer"
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
                <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner space-y-4">
                  <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                    <Calendar className="size-5 text-indigo-400" />
                    <h3 className="font-display text-base font-black text-white">Lịch trình các phiên</h3>
                  </div>
                  {event.sessions && event.sessions.length > 0 ? (
                    <div className="space-y-3">
                      {event.sessions.map((session, idx) => (
                        <div key={idx} className="rounded-xl border border-white/5 bg-white/[0.03] p-3.5 text-slate-300">
                          <div className="text-sm font-bold text-white">{session?.session_name || `Phiên ${idx + 1}`}</div>
                          <div className="mt-1 text-xs sm:text-[13px] font-medium text-slate-300">
                            {formatDate(session?.start_time)} - {formatDate(session?.end_time)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-slate-500">Chưa có lịch trình chi tiết.</p>
                  )}
                </div>

                {/* Ticket Types */}
                <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner space-y-4">
                  <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                    <Tag className="size-5 text-indigo-400" />
                    <h3 className="font-display text-base font-black text-white">Cơ cấu loại vé (Tickets)</h3>
                  </div>
                  {event.ticket_types && event.ticket_types.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {event.ticket_types.map((ticket, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] p-3">
                          <div>
                            <div className="text-xs font-bold text-white">{ticket?.name}</div>
                            <div className="text-[11px] text-slate-400">Số lượng: {ticket?.quantity} vé</div>
                          </div>
                          <div className="text-xs font-black text-emerald-400">
                            {Number(ticket?.price) === 0 ? 'Miễn phí' : `${Number(ticket?.price || 0).toLocaleString('vi-VN')} đ`}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-slate-500">Chưa tạo loại vé nào.</p>
                  )}
                </div>

                {/* Refund Policy */}
                <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner space-y-4">
                  <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                    <FileText className="size-5 text-indigo-400" />
                    <h3 className="font-display text-base font-black text-white">Chính sách hoàn tiền sự kiện</h3>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
                    {typeof event.refund_policy === 'string'
                      ? event.refund_policy
                      : event.refund_policy?.description ||
                      (event.refund_policy && typeof event.refund_policy === 'object' && Object.keys(event.refund_policy).length > 0
                        ? (event.refund_policy.allow_refund
                          ? `Cho phép hoàn vé trước ${event.refund_policy.refund_before_days || 0} ngày (Tỷ lệ: ${event.refund_policy.refund_rate || 100}%)`
                          : 'Sự kiện không hỗ trợ hoàn tiền.')
                        : 'Áp dụng chính sách hoàn vé tiêu chuẩn của EventHub.')}
                  </p>

                  {event.refund_policy?.policy_file_url && (
                    <div className="mt-2 flex items-center justify-between py-2.5 px-2 rounded-xl transition hover:bg-white/[0.04]">
                      <div className="flex items-center gap-3 overflow-hidden min-w-0">
                        <FileText className="size-5 shrink-0 text-indigo-400" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">
                            {event.refund_policy.policy_file_name || 'Tài liệu chính sách hoàn tiền đính kèm.pdf'}
                          </p>
                          {event.refund_policy.policy_file_size && (
                            <p className="text-xs text-slate-400 mt-0.5">
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
          <div className="flex w-[440px] xl:w-[480px] 2xl:w-[500px] shrink-0 flex-col gap-4 min-h-0">
            {/* Top Card: AI Review Panel */}
            <div className="flex flex-1 flex-col overflow-hidden bg-slate-950/80 rounded-[28px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl min-h-0">
              {/* AI Assistant Header (Fixed on top of AI card) */}
              <div className="shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="grid size-8 place-items-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20 text-indigo-400 shrink-0">
                    <Bot className="size-4" />
                  </div>
                  <h2 className="font-display text-xs sm:text-sm font-black text-white drop-shadow-sm tracking-tight uppercase truncate">
                    AI Review Assistant
                  </h2>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsCriteriaOpen(true)}
                    className="inline-flex items-center gap-1.5 h-8 rounded-xl border border-white/10 bg-white/5 px-2.5 text-xs font-semibold text-slate-200 shadow-sm transition hover:bg-white/10 hover:text-white hover:border-white/20 active:scale-95 cursor-pointer whitespace-nowrap"
                    title="Cấu hình bộ tiêu chí & điều khoản AI"
                  >
                    <ShieldCheck className="size-3.5 text-indigo-400 shrink-0" />
                    <span>Điều khoản AI</span>
                  </button>

                  {isScanningThisEvent ? (
                    <button
                      type="button"
                      onClick={handleCancelAi}
                      disabled={cancelAiMutation.isPending}
                      className="inline-flex items-center gap-1.5 h-8 rounded-xl border border-rose-500/60 bg-gradient-to-r from-rose-600 via-rose-500 to-red-600 px-3 text-xs font-black tracking-wide text-white shadow-lg shadow-rose-950/50 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:from-rose-500 hover:to-red-500 active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
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
                        <span>{rawAiReview ? 'Chạy lại AI' : 'Chạy AI'}</span>
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* AI Info Scrollable Area */}
              <div className={`flex-1 overflow-y-auto p-5 ${customScrollbar}`}>
                {/* Active AI Scanning Progress State */}
                {isScanningThisEvent && (
                  <div className="mb-4 rounded-2xl border border-indigo-500/30 bg-slate-900/90 p-4 shadow-sm backdrop-blur-md">
                    <div className="flex items-start gap-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-500/20 text-indigo-400 mt-0.5">
                        <RefreshCw className="size-4 animate-spin" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-indigo-300">
                            AI đang phân tích & kiểm duyệt sự kiện...
                          </h4>
                          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300 bg-rose-950/40 border border-rose-500/30 px-2.5 py-0.5 rounded-lg">
                            <span className="size-1.5 rounded-full bg-rose-400 animate-ping" />
                            Có thể bấm "Hủy quét" ở trên để dừng
                          </span>
                        </div>
                        <div className="mt-2 space-y-1.5 text-xs text-slate-300">
                          <p className="flex items-center gap-2">
                            <span className="inline-block size-1.5 rounded-full bg-indigo-400 animate-ping" />
                            <span><strong>Giai đoạn 1:</strong> Vision Model quét và kiểm tra an toàn từng hình ảnh...</span>
                          </p>
                          <p className="flex items-center gap-2">
                            <span className="inline-block size-1.5 rounded-full bg-amber-400 animate-ping" />
                            <span><strong>Giai đoạn 2:</strong> Qwen3 8B rà soát chính tả & đối chiếu bộ điều khoản...</span>
                          </p>
                        </div>
                        <p className="mt-2 text-[10px] text-slate-400 italic">
                          Quá trình quét và đối chiếu toàn diện mất khoảng 30 - 60 giây. Bấm nút "Hủy quét" ở trên nếu bạn muốn dừng ngay lập tức.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Empty State: AI Review Not Run Yet */}
                {!aiData && !isScanningThisEvent && (
                  <div className="my-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center backdrop-blur-sm">
                    <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
                      <Bot className="size-6" />
                    </div>
                    <h3 className="font-display text-base font-bold text-white">Chưa chạy AI Đánh giá</h3>
                    <p className="mt-1 text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                      Sự kiện này chưa được AI kiểm duyệt. Bấm nút bên dưới để AI quét hình ảnh bằng Vision, soát lỗi chính tả và đối chiếu chính sách nền tảng.
                    </p>
                    <button
                      type="button"
                      onClick={handleStartAi}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-indigo-500 cursor-pointer"
                    >
                      <Sparkles className="size-4" />
                      Bắt đầu Phân tích AI ngay
                    </button>
                  </div>
                )}

                {/* Full AI Review Results */}
                {aiData && (
                  <>
                    {/* Recommendation Banner */}
                    <StatusBanner recommendation={aiData.recommendation} summary={aiData.summary} />

                    {/* Quality & Risk Meters */}
                    <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5">
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400 font-medium">Chất lượng thông tin</span>
                          <span className="font-bold text-emerald-400">{aiData.quality_score}/100</span>
                        </div>
                        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, aiData.quality_score))}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400 font-medium">Chỉ số rủi ro</span>
                          <span className={`font-bold ${aiData.risk_score > 50 ? 'text-rose-400' : aiData.risk_score > 20 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {aiData.risk_score}/100
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${aiData.risk_score > 50 ? 'bg-rose-500' : aiData.risk_score > 20 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, Math.max(0, aiData.risk_score))}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Quick action header */}
                    <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Chi tiết phân tích chính sách
                      </span>
                      {totalIssuesCount > 0 && (
                        <button
                          type="button"
                          onClick={handleCopyAllIssues}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
                          title="Sao chép toàn bộ lỗi vi phạm và cảnh báo vào ô ghi chú kiểm duyệt"
                        >
                          <FileCheck className="size-3" />
                          <span>Sao chép tất cả lỗi</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-4">
                      {/* 🔴 CRITICAL VIOLATIONS (MÀU ĐỎ) */}
                      {aiData.critical_violations && aiData.critical_violations.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-400">
                              <ShieldAlert className="size-3.5" />
                              Vi phạm nghiêm trọng ({aiData.critical_violations.length})
                            </span>
                          </div>
                          <div className="space-y-2">
                            {aiData.critical_violations.map((v, idx) => (
                              <PolicyViolationCard key={idx} item={v} onClick={handleWarningClick} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-slate-900/80 px-3 py-2.5 text-xs text-emerald-300 font-medium">
                          <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
                          <span>Không phát hiện vi phạm chính sách nghiêm trọng (0 lỗi đỏ)</span>
                        </div>
                      )}

                      {/* 🟡 WARNINGS / CAUTIONS (MÀU VÀNG) */}
                      {aiData.warnings && aiData.warnings.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                              <AlertTriangle className="size-3.5" />
                              Cảnh báo & Cần lưu ý ({aiData.warnings.length})
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
                        <ContentSpellingAuditCard
                          contentReview={aiData.content_review}
                          onClick={handleWarningClick}
                        />
                      )}

                      {/* 🖼️ KIỂM DUYỆT HÌNH ẢNH & OCR */}
                      {(aiData.image_review || aiData.vision_analysis) && (
                        <ImageModerationAuditCard
                          imageReview={aiData.image_review}
                          visionAnalysis={aiData.vision_analysis}
                          onClick={handleWarningClick}
                        />
                      )}

                      {/* 🟢 COMPLIANT CHECKS (MÀU XANH LÁ) */}
                      {aiData.compliant_checks && aiData.compliant_checks.length > 0 && (
                        <div className="space-y-2">
                          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                            <CheckCircle2 className="size-3.5" />
                            Tiêu chí đạt chuẩn ({aiData.compliant_checks.length})
                          </span>
                          <div className="space-y-1.5">
                            {aiData.compliant_checks.map((c, idx) => (
                              <CompliantCheckItem key={idx} check={c} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 💡 SUGGESTIONS (MÀU VÀNG HỔ PHÁCH) */}
                      {aiData.suggestions && aiData.suggestions.length > 0 && (
                        <div className="space-y-2">
                          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                            <Sparkles className="size-3.5" />
                            Gợi ý điều chỉnh cho BTC ({aiData.suggestions.length})
                          </span>
                          <div className="space-y-1.5">
                            {aiData.suggestions.map((s, idx) => (
                              <SuggestionCard key={idx} suggestion={s} onClick={handleWarningClick} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <p className="mt-4 text-center text-[10px] text-slate-500 italic">
                      Bấm vào từng mục để tự động chèn vào ghi chú kiểm duyệt bên dưới.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Bottom Card: Admin Action Form Area (Tách thành 1 khối riêng bên dưới) */}
            <div className="shrink-0 bg-slate-950/95 rounded-[22px] border border-white/10 p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300">
              {/* Header: Note toggle & AI suggestion */}
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <button
                  type="button"
                  onClick={() => setIsNoteExpanded(!isNoteExpanded)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white transition group cursor-pointer"
                  title={isNoteExpanded ? 'Bấm để thu gọn ô ghi chú' : 'Bấm để mở rộng ô ghi chú'}
                >
                  <FileText className="size-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span>Ghi chú kiểm duyệt</span>
                  {hasNote ? (
                    <span className="rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black px-2 py-0.5 border border-amber-500/30 animate-pulse">
                      {noteLinesCount} mục
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-normal group-hover:text-slate-400">
                      (Tùy chọn)
                    </span>
                  )}
                  {isNoteExpanded ? (
                    <ChevronUp className="size-3.5 text-slate-400 group-hover:text-white transition-transform" />
                  ) : (
                    <ChevronDown className="size-3.5 text-slate-400 group-hover:text-white transition-transform" />
                  )}
                </button>

                {aiData?.recommendation && (
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${aiData.recommendation === 'APPROVE'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : aiData.recommendation === 'REJECT'
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    }`}>
                    Gợi ý AI: {aiData.recommendation === 'APPROVE' ? 'Phê duyệt' : aiData.recommendation === 'REJECT' ? 'Từ chối' : 'Cần sửa đổi'}
                  </span>
                )}
              </div>

              {/* Expandable Note Textarea */}
              {isNoteExpanded && (
                <div className="mb-2.5">
                  <div className="mb-1 text-[10px] text-slate-400">
                    <span>Nhập hoặc bấm gợi ý AI ở trên để tự chèn vào ghi chú</span>
                  </div>
                  <textarea
                    {...register('review_note')}
                    placeholder="Nhập ghi chú gửi cho Ban tổ chức..."
                    className={`h-20 w-full resize-y rounded-xl border border-white/10 bg-black/50 p-2.5 text-xs font-medium text-white shadow-inner outline-none transition-all placeholder:text-slate-500 focus:border-amber-400/50 focus:bg-black/70 focus:ring-1 focus:ring-amber-400/50 ${customScrollbar}`}
                  />
                </div>
              )}

              {/* Decision Action Buttons */}
              <div className="grid gap-2.5 grid-cols-2">
                <button
                  type="button"
                  onClick={() => onSubmitReview('REJECTED')}
                  disabled={isPending}
                  className="admin-danger w-full disabled:cursor-not-allowed disabled:opacity-50 !bg-rose-500/10 hover:!bg-rose-500/20 !border-rose-500/30 !text-rose-400 !px-0 !py-2.5 rounded-xl text-xs font-black shadow-sm transition cursor-pointer"
                >
                  {event?.cancel_request?.status === 'PENDING'
                    ? 'Từ chối hủy'
                    : event?.pending_revision
                      ? 'Từ chối sửa đổi'
                      : 'Từ chối'}
                </button>
                <button
                  type="button"
                  onClick={() => onSubmitReview('APPROVED')}
                  disabled={isPending}
                  className="admin-primary w-full disabled:cursor-not-allowed disabled:opacity-50 !px-0 !py-2.5 rounded-xl font-black text-xs shadow-lg cursor-pointer"
                >
                  {event?.cancel_request?.status === 'PENDING'
                    ? 'Phê duyệt hủy'
                    : event?.pending_revision
                      ? 'Phê duyệt sửa đổi'
                      : 'Phê duyệt'}
                </button>
              </div>
            </div>
          </div>
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
    </div>
  )
}

function DocumentPreviewModal({ doc, onClose }) {
  if (!doc) return null

  const isImage = doc.type?.includes('image') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(doc.url) || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(doc.name)
  const isPdf = doc.type?.includes('pdf') || doc.url?.toLowerCase().includes('.pdf') || doc.name?.toLowerCase().endsWith('.pdf')

  const [activeTab, setActiveTab] = useState('preview') // 'preview' | 'ai_text'
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null)
  const [isLoadingPdf, setIsLoadingPdf] = useState(false)
  const [pdfLoadError, setPdfLoadError] = useState(null)

  const [extractedText, setExtractedText] = useState(doc.extractedText || null)
  const [isLoadingText, setIsLoadingText] = useState(false)
  const [textExtractError, setTextExtractError] = useState(null)
  const [copied, setCopied] = useState(false)

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
          setPdfLoadError('Không thể tạo luồng xem trực tiếp. Bạn có thể mở qua tab mới hoặc tải về.')
          setIsLoadingPdf(false)
        })
    }

    return () => {
      active = false
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [doc?.url, isPdf])

  // 2. Fetch or initialize extracted text
  useEffect(() => {
    if (doc?.extractedText) {
      setExtractedText(doc.extractedText)
      return
    }

    if (isPdf && doc?.url && !extractedText) {
      setIsLoadingText(true)
      setTextExtractError(null)

      extractDocumentText(doc.url)
        .then((data) => {
          if (data?.text) {
            setExtractedText(data.text)
          } else if (data?.hasText === false) {
            setTextExtractError('Tệp PDF dạng quét ảnh (scan) hoặc không chứa lớp văn bản (text layer).')
          } else {
            setTextExtractError('Không trích xuất được văn bản từ tệp này.')
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
  }, [doc?.url, doc?.extractedText, isPdf])

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
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30">
              {isPdf ? (
                <FileText className="size-5" />
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
                <span className="uppercase font-semibold text-indigo-300">
                  {isPdf ? 'Tài liệu PDF' : isImage ? 'Hình ảnh' : 'Tài liệu đính kèm'}
                </span>
                {doc.size && (
                  <>
                    <span>•</span>
                    <span>{formatFileSize(doc.size)}</span>
                  </>
                )}
                {isPdf && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <Sparkles className="size-3" />
                      AI Đọc & Duyệt được
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Modal Header Tabs & Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {isPdf && (
              <div className="flex rounded-xl bg-slate-800/80 p-0.5 border border-white/5 mr-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${activeTab === 'preview'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  <Eye className="size-3.5" />
                  <span>Xem trực tiếp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ai_text')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${activeTab === 'ai_text'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  <Sparkles className="size-3.5" />
                  <span>Văn bản AI trích xuất</span>
                  {extractedText && (
                    <span className="ml-0.5 size-1.5 rounded-full bg-emerald-400" />
                  )}
                </button>
              </div>
            )}

            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 hover:text-white transition"
                title="Mở trong tab mới"
              >
                <span>Mở tab mới</span>
                <ExternalLink className="size-3.5" />
              </a>
            )}
            {doc.url && (
              <a
                href={doc.url}
                download={doc.name}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 hover:text-white transition"
                title="Tải về máy"
              >
                <Download className="size-3.5" />
                <span>Tải về</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="grid size-9 place-items-center rounded-xl bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition"
              title="Đóng (Esc)"
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
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
                      <div className="grid size-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-400 mb-3 ring-1 ring-amber-500/20">
                        <AlertTriangle className="size-6" />
                      </div>
                      <p className="text-xs text-slate-300 mb-4">{pdfLoadError}</p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setActiveTab('ai_text')}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-indigo-500"
                        >
                          <Sparkles className="size-3.5" />
                          Đọc văn bản AI đã trích xuất
                        </button>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white"
                        >
                          <ExternalLink className="size-3.5" />
                          Mở link gốc
                        </a>
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
                /* TAB 2: AI EXTRACTED TEXT */
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
            ) : (
              // For DOCX or other docs
              <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto my-auto">
                <div className="grid size-16 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-400 mb-4 ring-1 ring-indigo-500/20">
                  <FileText className="size-8" />
                </div>
                <h4 className="font-bold text-white text-base mb-1">{doc.name}</h4>
                <p className="text-xs text-slate-400 mb-6">
                  Định dạng tài liệu này phù hợp nhất khi mở hoặc xem trong ứng dụng chuyên dụng hoặc tải về.
                </p>
                <div className="flex items-center gap-3">
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition"
                  >
                    <ExternalLink className="size-4" />
                    Mở trực tiếp
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
  confirmText = 'Xác nhận',
  cancelText = 'Hủy bỏ',
  confirmColor,
  isPending = false,
}) {
  if (!open) return null

  const getToneConfig = () => {
    switch (tone) {
      case 'success':
        return {
          icon: CheckCircle2,
          iconWrap: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
          btnClass: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40',
        }
      case 'danger':
        return {
          icon: AlertTriangle,
          iconWrap: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
          btnClass: 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40',
        }
      case 'warning':
        return {
          icon: AlertTriangle,
          iconWrap: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
          btnClass: 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/40',
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
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${iconWrap}`}>
              <ToneIcon className="size-6" />
            </span>
            <div>
              <h3 className="text-xl font-black text-white">{title}</h3>
              {subtitle ? (
                <p className="mt-1 text-xs text-slate-300">{subtitle}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Vui lòng kiểm tra kỹ thông tin trước khi xác nhận.</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Event highlight box */}
        {eventTitle && (
          <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-3 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sự kiện xử lý:</p>
            <p className="font-bold text-white text-sm mt-0.5 truncate">{eventTitle}</p>
          </div>
        )}

        {/* Description */}
        {description && (
          <p className="mt-3.5 text-xs text-slate-300 leading-relaxed">
            {description}
          </p>
        )}

        {/* Footer buttons */}
        <div className="mt-6 flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 rounded-xl border border-border-soft/40 bg-panel-soft px-4 py-2.5 text-xs font-semibold text-subtle transition hover:border-border-soft hover:text-content disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-semibold transition disabled:opacity-50 ${btnClass}`}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Đang xử lý...</span>
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
