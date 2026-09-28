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
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'

import {
  fetchAdminEventDetail,
  reviewAdminEvent,
  fetchAdminAiReview,
  runAdminAiReview,
} from '@/services/adminEvents.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { Page, Panel, Badge, ImagePlaceholder } from './AdminComponents.jsx'

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------
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
function StatusBanner({ recommendation, summary }) {
  if (recommendation === 'APPROVE') {
    return (
      <div className="mb-4 rounded-[20px] border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-[inset_0_0_20px_rgba(16,185,129,0.08)] backdrop-blur-sm">
        <div className="flex items-start gap-3.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
            <CheckCircle2 className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                Đề xuất: Duyệt
              </span>
            </div>
            <h4 className="mt-1 font-display text-sm font-black text-emerald-300 drop-shadow-sm">
              Đủ điều kiện phê duyệt
            </h4>
            <p className="mt-1 text-xs font-medium text-emerald-200/80 leading-relaxed">
              {summary || 'Sự kiện tuân thủ các điều khoản & chính sách cốt lõi của EventHub.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (recommendation === 'REJECT') {
    return (
      <div className="mb-4 rounded-[20px] border border-rose-500/30 bg-rose-500/10 p-4 shadow-[inset_0_0_20px_rgba(244,63,94,0.08)] backdrop-blur-sm">
        <div className="flex items-start gap-3.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30">
            <Ban className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-300">
                Đề xuất: Từ chối / Yêu cầu sửa
              </span>
            </div>
            <h4 className="mt-1 font-display text-sm font-black text-rose-300 drop-shadow-sm">
              Nguy cơ vi phạm nghiêm trọng
            </h4>
            <p className="mt-1 text-xs font-medium text-rose-200/80 leading-relaxed">
              {summary || 'Phát hiện điều khoản vi phạm chính sách nền tảng. Đề xuất từ chối hoặc kiểm tra kỹ lưỡng.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Default: NEEDS_REVIEW
  return (
    <div className="mb-4 rounded-[20px] border border-amber-500/30 bg-amber-500/10 p-4 shadow-[inset_0_0_20px_rgba(245,158,11,0.08)] backdrop-blur-sm">
      <div className="flex items-start gap-3.5">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30">
          <AlertTriangle className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-block rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
              Đề xuất: Cần xem xét
            </span>
          </div>
          <h4 className="mt-1 font-display text-sm font-black text-amber-300 drop-shadow-sm">
            Cần quản trị viên đối chiếu
          </h4>
          <p className="mt-1 text-xs font-medium text-amber-200/80 leading-relaxed">
            {summary || 'Sự kiện có một số thiếu sót hoặc điều kiện chưa rõ ràng cần cân nhắc trước khi phê duyệt.'}
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
      className="group relative flex w-full cursor-pointer flex-col gap-1.5 rounded-[16px] border border-rose-500/30 bg-rose-500/[0.07] p-3.5 text-left shadow-inner transition-all hover:-translate-y-0.5 hover:border-rose-500/60 hover:bg-rose-500/[0.14]"
      title="Bấm để sao chép vào ghi chú"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-5 place-items-center rounded bg-rose-500/20 text-rose-400 text-[10px] font-black">
            !
          </span>
          <span className="text-[11px] font-black uppercase tracking-wider text-rose-400">
            {policy}
          </span>
        </div>
        <span className="text-[10px] font-bold text-rose-400/70 group-hover:text-rose-300">
          + Thêm vào ghi chú
        </span>
      </div>
      <p className="text-xs font-bold text-white leading-snug">{issue}</p>
      {quote && (
        <div className="mt-1 rounded-lg border border-rose-500/20 bg-black/40 px-2.5 py-1.5 text-[11px] italic text-rose-200/90 font-mono">
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
      className="group relative flex w-full cursor-pointer flex-col gap-1.5 rounded-[16px] border border-amber-500/30 bg-amber-500/[0.07] p-3.5 text-left shadow-inner transition-all hover:-translate-y-0.5 hover:border-amber-500/60 hover:bg-amber-500/[0.14]"
      title="Bấm để sao chép vào ghi chú"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-3.5 text-amber-400" />
          <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
            {policy}
          </span>
        </div>
        <span className="text-[10px] font-bold text-amber-400/70 group-hover:text-amber-300">
          + Thêm vào ghi chú
        </span>
      </div>
      <p className="text-xs font-medium text-amber-100 leading-snug">{issue}</p>
      {quote && (
        <div className="mt-1 rounded-lg border border-amber-500/20 bg-black/40 px-2.5 py-1.5 text-[11px] italic text-amber-200/80 font-mono">
          &ldquo;{quote}&rdquo;
        </div>
      )}
    </button>
  )
}

function CompliantCheckItem({ check }) {
  const text = typeof check === 'string' ? check : check.title || check.issue || JSON.stringify(check)
  return (
    <div className="flex items-start gap-2.5 rounded-[14px] border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5 text-left">
      <CheckCircle2 className="size-4 shrink-0 text-emerald-400 mt-0.5" />
      <span className="text-xs font-medium text-emerald-100 leading-relaxed">{text}</span>
    </div>
  )
}

function SuggestionCard({ suggestion, onClick }) {
  const text = typeof suggestion === 'string' ? suggestion : suggestion.text || JSON.stringify(suggestion)
  return (
    <button
      type="button"
      onClick={() => onClick?.(`[Gợi ý] ${text}`)}
      className="group flex w-full cursor-pointer items-start gap-2.5 rounded-[14px] border border-purple-500/25 bg-purple-500/[0.05] p-2.5 text-left shadow-inner transition-all hover:-translate-y-0.5 hover:border-purple-500/50 hover:bg-purple-500/[0.12]"
      title="Bấm để sao chép vào ghi chú"
    >
      <Sparkles className="size-4 shrink-0 text-purple-400 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-purple-100 leading-relaxed">{text}</p>
        <span className="mt-1 inline-block text-[10px] font-bold text-purple-400/70 group-hover:text-purple-300">
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
    if (st === 'VIOLATION') return <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-400 border border-rose-500/30">Vi phạm</span>
    if (st === 'NEEDS_IMPROVEMENT') return <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 border border-amber-500/30">Cần sửa</span>
    return <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/30">Hợp lệ</span>
  }

  return (
    <div className="rounded-[18px] border border-indigo-500/20 bg-indigo-950/20 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-black uppercase text-indigo-300">
          <Type className="size-3.5 text-indigo-400" />
          Soát lỗi Tiêu đề, Mô tả & Chính tả
        </span>
      </div>

      {/* Title Audit */}
      {contentReview.title_analysis && (
        <div className="rounded-xl border border-white/5 bg-black/30 p-2.5 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-300">Tiêu đề:</span>
            {getStatusBadge(titleStatus)}
          </div>
          <p className="text-[11px] text-slate-300">{contentReview.title_analysis}</p>
        </div>
      )}

      {/* Description Audit */}
      {contentReview.description_analysis && (
        <div className="rounded-xl border border-white/5 bg-black/30 p-2.5 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-300">Mô tả bài viết:</span>
            {getStatusBadge(descStatus)}
          </div>
          <p className="text-[11px] text-slate-300">{contentReview.description_analysis}</p>
        </div>
      )}

      {/* Spelling & Grammar Issues */}
      {spellingIssues.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-1 text-[11px] font-bold text-amber-300">
            <SpellCheck className="size-3.5 text-amber-400" />
            <span>Phát hiện {spellingIssues.length} lỗi chính tả / ngữ pháp:</span>
          </div>
          <div className="space-y-1">
            {spellingIssues.map((issue, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onClick?.(`[Lỗi chính tả] ${issue}`)}
                className="group flex w-full cursor-pointer items-start justify-between rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-left text-[11px] text-amber-200 transition hover:bg-amber-500/20"
                title="Bấm để sao chép vào ghi chú"
              >
                <span>• {issue}</span>
                <span className="shrink-0 text-[10px] text-amber-400/70 group-hover:text-amber-300 ml-1">
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

  const getStatusBadge = (st) => {
    if (st === 'VIOLATION') return <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-400 border border-rose-500/30">Vi phạm</span>
    if (st === 'WARNING') return <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 border border-amber-500/30">Cần lưu ý</span>
    if (st === 'MISSING') return <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-400 border border-rose-500/30">Chưa có</span>
    return <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/30">Hợp lệ</span>
  }

  return (
    <div className="rounded-[18px] border border-cyan-500/20 bg-cyan-950/20 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-black uppercase text-cyan-300">
          <ImageIcon className="size-3.5 text-cyan-400" />
          Kiểm duyệt Hình ảnh & OCR ({items.length || visionItems.length} ảnh)
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${overallVerdict === 'VIOLATION' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : overallVerdict === 'WARNING' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
          {overallVerdict === 'VIOLATION' ? 'Có vi phạm' : overallVerdict === 'WARNING' ? 'Cần lưu ý' : 'An toàn'}
        </span>
      </div>

      {/* Render structured items from image_review.items */}
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((img, idx) => (
            <div key={idx} className="rounded-xl border border-white/5 bg-black/30 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-white">{getSourceLabel(img.source)}</span>
                {getStatusBadge(img.status)}
              </div>
              
              {img.analysis && (
                <p className="text-[11px] text-slate-300 leading-relaxed">{img.analysis}</p>
              )}

              {Array.isArray(img.issues) && img.issues.length > 0 && (
                <div className="space-y-1 pt-1">
                  {img.issues.map((iss, i) => (
                    <div key={i} className="flex items-start gap-1 text-[11px] text-rose-300">
                      <AlertCircle className="size-3 shrink-0 text-rose-400 mt-0.5" />
                      <span>{iss}</span>
                    </div>
                  ))}
                </div>
              )}

              {img.suggestion && (
                <button
                  type="button"
                  onClick={() => onClick?.(`[Gợi ý ảnh ${getSourceLabel(img.source)}] ${img.suggestion}`)}
                  className="group flex w-full cursor-pointer items-start justify-between rounded-lg border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-left text-[10px] text-purple-200 transition hover:bg-purple-500/20"
                  title="Bấm để sao chép vào ghi chú"
                >
                  <span className="italic">💡 Gợi ý: {img.suggestion}</span>
                  <span className="shrink-0 font-bold text-purple-400/70 group-hover:text-purple-300 ml-1">
                    + Thêm
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : visionItems.length > 0 ? (
        <div className="space-y-2">
          {visionItems.map((img, idx) => (
            <div key={idx} className="rounded-xl border border-white/5 bg-black/30 p-2.5 space-y-1">
              <span className="text-[11px] font-bold text-white">{getSourceLabel(img.source)}</span>
              <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-3">{img.description}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2 text-[11px] text-slate-300">
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

  // Run AI Review Mutation
  const runAiMutation = useMutation({
    mutationFn: () => runAdminAiReview(event),
    onSuccess: (data) => {
      toast.success('Đã hoàn thành phân tích sự kiện bằng AI!')
      queryClient.setQueryData(['admin-ai-review', eventId], data)
      queryClient.invalidateQueries({ queryKey: ['admin-event-detail', eventId] })
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Không thể chạy phân tích AI.')
    },
  })

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  const { register, handleSubmit, setValue, getValues } = useForm({
    defaultValues: { review_note: '' },
  })

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
    toast.success('Đã sao chép toàn bộ đánh giá AI vào Ghi chú!')
  }

  const onSubmitReview = (status) => {
    return handleSubmit((data) => {
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

  const isPending = reviewMutation.isPending
  const isPendingReview = event?.status === 'PENDING_REVIEW'
  const customScrollbar = "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20"

  const totalIssuesCount = (aiData.critical_violations?.length || 0) + (aiData.warnings?.length || 0)

  return (
    <div className="flex h-[calc(100vh-130px)] flex-col overflow-hidden bg-slate-950 rounded-[32px] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.3)]">
      {/* Top Header */}
      <div className="shrink-0 p-6 pb-2 relative z-20">
        <header className="flex h-16 items-center justify-between rounded-full border border-white/10 bg-slate-900/60 px-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/events/review')}
              className="grid size-10 place-items-center rounded-full bg-white/5 text-slate-300 transition hover:bg-white/15 hover:text-white shadow-inner"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h1 className="font-display text-xl font-black text-white drop-shadow-sm truncate max-w-xl">
              {event.title}
            </h1>
            <Badge tone="blue">{event.status}</Badge>
          </div>
        </header>
      </div>

      {/* Main Split Screen */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Event Details */}
        <div className={`overflow-y-auto p-6 ${customScrollbar} ${isPendingReview ? 'w-[58%] lg:w-[62%] rounded-bl-[32px]' : 'w-full max-w-5xl mx-auto rounded-b-[32px]'}`}>
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
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge tone="gray">
                  <Tag className="mr-1.5 size-3" />
                  {typeof event.category_id === 'object' ? event.category_id?.name || 'Danh mục' : event.category_id || 'Danh mục trống'}
                </Badge>
                <Badge tone="indigo">
                  {isOnline ? <Video className="mr-1.5 size-3" /> : <MapPin className="mr-1.5 size-3" />}
                  {isOnline ? 'Sự kiện Online' : 'Sự kiện Offline'}
                </Badge>
              </div>

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
                    className="prose prose-sm prose-invert max-w-none text-slate-300"
                    dangerouslySetInnerHTML={{ __html: typeof event.description === 'string' ? event.description : '' }}
                  />
                ) : (
                  <p className="text-sm italic text-slate-500">Không có mô tả.</p>
                )}
              </div>

              {/* Extra Details */}
              <div className="space-y-6">
                {/* Event Permits Section */}
                <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner space-y-4">
                  <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                    <ShieldCheck className="size-5 text-indigo-400" />
                    <h3 className="font-display text-base font-black text-white">Giấy phép & Tài liệu đính kèm</h3>
                  </div>

                  {event.permits && event.permits.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {event.permits.map((permit, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] p-3">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <FileText className="size-5 shrink-0 text-slate-400" />
                            <span className="truncate text-xs font-medium text-slate-200">{permit?.file_name || `Giấy phép #${idx + 1}`}</span>
                          </div>
                          <a
                            href={permit?.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-2 flex shrink-0 items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-[11px] font-bold text-indigo-400 hover:bg-white/10"
                          >
                            <span>Xem</span>
                            <ExternalLink className="size-3" />
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-slate-500">Không có giấy phép đính kèm.</p>
                  )}
                </div>

                {/* Event Sessions */}
                <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner space-y-4">
                  <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                    <Calendar className="size-5 text-indigo-400" />
                    <h3 className="font-display text-base font-black text-white">Lịch trình các phiên (Sessions)</h3>
                  </div>
                  {event.sessions && event.sessions.length > 0 ? (
                    <div className="space-y-3">
                      {event.sessions.map((session, idx) => (
                        <div key={idx} className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs text-slate-300">
                          <div className="font-bold text-white">{session?.session_name || `Phiên ${idx + 1}`}</div>
                          <div className="mt-1 text-slate-400">
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
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: AI Assistant & Actions - ONLY FOR PENDING_REVIEW */}
        {isPendingReview && (
          <div className="flex w-[42%] lg:w-[38%] shrink-0 flex-col border-l border-white/5 bg-slate-900/40 backdrop-blur-md relative z-10 shadow-[-10px_0_30px_rgba(0,0,0,0.1)] rounded-br-[32px]">
          {/* AI Info Area */}
          <div className={`flex-1 overflow-y-auto p-5 ${customScrollbar}`}>
            {/* AI Assistant Header */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-xl bg-purple-500/10 ring-1 ring-purple-500/20 text-purple-400">
                  <Sparkles className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-sm font-black text-white drop-shadow-sm tracking-tight uppercase">
                      AI Review Assistant
                    </h2>
                    <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300">
                      eventhub-qwen3
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">Đối chiếu 4 bộ chính sách EventHub</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => runAiMutation.mutate()}
                disabled={runAiMutation.isPending || aiReviewQuery.isLoading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-md transition hover:bg-indigo-500 disabled:opacity-50"
              >
                <RefreshCw className={`size-3.5 ${runAiMutation.isPending ? 'animate-spin' : ''}`} />
                {runAiMutation.isPending
                  ? 'Đang phân tích...'
                  : rawAiReview
                    ? 'Chạy lại AI'
                    : 'Chạy AI Đánh giá'}
              </button>
            </div>

            {/* Active AI Scanning Progress State */}
            {runAiMutation.isPending && (
              <div className="mb-4 rounded-[22px] border border-indigo-500/40 bg-indigo-500/10 p-5 shadow-[0_0_30px_rgba(99,102,241,0.18)] backdrop-blur-md animate-pulse">
                <div className="flex items-start gap-3.5">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-500/20 text-indigo-400">
                    <RefreshCw className="size-5 animate-spin" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-display text-sm font-black text-indigo-300">
                      AI đang phân tích & kiểm duyệt sự kiện...
                    </h4>
                    <div className="mt-2 space-y-1 text-xs text-indigo-200/90">
                      <p className="flex items-center gap-1.5">
                        <span className="inline-block size-1.5 rounded-full bg-cyan-400 animate-ping" />
                        <span><strong>Giai đoạn 1:</strong> Vision Model quét và kiểm tra an toàn từng hình ảnh (Poster, Banner, mô tả)...</span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <span className="inline-block size-1.5 rounded-full bg-purple-400 animate-ping" />
                        <span><strong>Giai đoạn 2:</strong> Qwen3 8B đối chiếu nội dung, chính tả tiếng Việt & 4 bộ chính sách EventHub...</span>
                      </p>
                    </div>
                    <p className="mt-2 text-[10px] text-indigo-300/70 italic">
                      Quá trình quét và đối chiếu toàn diện mất khoảng 30 - 60 giây. Vui lòng giữ nguyên màn hình...
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State: AI Review Not Run Yet */}
            {!aiData && !runAiMutation.isPending && (
              <div className="my-6 rounded-[24px] border border-white/10 bg-white/[0.02] p-8 text-center backdrop-blur-sm">
                <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20">
                  <Sparkles className="size-6" />
                </div>
                <h3 className="font-display text-base font-black text-white">Chưa chạy AI Đánh giá</h3>
                <p className="mt-1 text-xs text-slate-400 max-w-xs mx-auto">
                  Sự kiện này chưa được AI kiểm duyệt. Bấm nút bên dưới để AI quét hình ảnh bằng Vision, soát lỗi chính tả và đối chiếu chính sách nền tảng.
                </p>
                <button
                  type="button"
                  onClick={() => runAiMutation.mutate()}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] transition hover:bg-indigo-500"
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
                <div className="mb-5 grid grid-cols-2 gap-2.5 rounded-[18px] border border-white/5 bg-white/[0.02] p-3">
                  <div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-medium">Chất lượng thông tin</span>
                      <span className="font-bold text-emerald-400">{aiData.quality_score}/100</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, aiData.quality_score))}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-medium">Chỉ số rủi ro</span>
                      <span className={`font-bold ${aiData.risk_score > 50 ? 'text-rose-400' : aiData.risk_score > 20 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {aiData.risk_score}/100
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${aiData.risk_score > 50 ? 'bg-gradient-to-r from-amber-500 to-rose-500' : aiData.risk_score > 20 ? 'bg-gradient-to-r from-emerald-500 to-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, Math.max(0, aiData.risk_score))}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Quick action header */}
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    Chi tiết phân tích chính sách
                  </span>
                  {totalIssuesCount > 0 && (
                    <button
                      type="button"
                      onClick={handleCopyAllIssues}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 hover:underline"
                    >
                      <FileCheck className="size-3" />
                      Sao chép tất cả lỗi
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  {/* 🔴 CRITICAL VIOLATIONS (MÀU ĐỎ) */}
                  {aiData.critical_violations && aiData.critical_violations.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-black uppercase text-rose-400">
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
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300 font-medium">
                      <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
                      <span>Không phát hiện vi phạm chính sách nghiêm trọng (0 lỗi đỏ)</span>
                    </div>
                  )}

                  {/* 🟡 WARNINGS / CAUTIONS (MÀU VÀNG) */}
                  {aiData.warnings && aiData.warnings.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-black uppercase text-amber-400">
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
                      <span className="flex items-center gap-1.5 text-xs font-black uppercase text-emerald-400">
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

                  {/* 🟣 SUGGESTIONS (MÀU TÍM) */}
                  {aiData.suggestions && aiData.suggestions.length > 0 && (
                    <div className="space-y-2">
                      <span className="flex items-center gap-1.5 text-xs font-black uppercase text-purple-400">
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

          {/* Admin Action Form Area */}
          <div className="shrink-0 border-t border-white/5 bg-slate-900/80 p-5 shadow-[0_-10px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl rounded-br-[32px]">
            <h3 className="mb-2 font-display text-xs font-black tracking-widest uppercase text-slate-300">
              Ghi chú & Quyết định kiểm duyệt
            </h3>
            
            <textarea
              {...register('review_note')}
              placeholder="Nhập ghi chú hoặc bấm vào các cảnh báo/gợi ý AI ở trên để tự động điền..."
              className={`mb-3.5 min-h-[75px] w-full resize-y rounded-[16px] border border-white/10 bg-black/20 p-3 text-xs font-medium text-white shadow-inner outline-none transition-all placeholder:text-slate-500 focus:border-tertiary focus:bg-black/40 focus:ring-1 focus:ring-tertiary ${customScrollbar}`}
            />

            <div className="grid gap-3 grid-cols-2">
              <button
                type="button"
                onClick={() => onSubmitReview('APPROVED')}
                disabled={isPending}
                className="admin-primary w-full disabled:cursor-not-allowed disabled:opacity-50 !shadow-[0_0_20px_rgba(59,130,246,0.3)] !px-0 !py-2.5 text-xs font-bold"
              >
                Phê duyệt
              </button>
              <button
                type="button"
                onClick={() => onSubmitReview('REJECTED')}
                disabled={isPending}
                className="admin-danger w-full disabled:cursor-not-allowed disabled:opacity-50 !bg-error/10 hover:!bg-error/20 !border-error/30 !text-error !px-0 !py-2.5 text-xs font-bold"
              >
                Từ chối
              </button>
            </div>
          </div>
        </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        description={confirmState?.description}
        confirmText={confirmState?.confirmText}
        confirmColor={confirmState?.confirmColor}
        onConfirm={confirmState?.onConfirm}
        onCancel={() => setConfirmState(null)}
      />
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

function ConfirmModal({ open, title, description, onConfirm, onCancel, confirmText = 'Xác nhận', cancelText = 'Hủy', confirmColor = 'bg-primary' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
      <Panel className="w-full max-w-sm border-border-soft/60">
        <h3 className="text-lg font-bold text-content">{title}</h3>
        <p className="mt-2 text-sm text-subtle">{description}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="admin-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button type="button" className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white shadow transition hover:-translate-y-0.5 ${confirmColor}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </Panel>
    </div>
  )
}
