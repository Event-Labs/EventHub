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
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'

import { fetchAdminEventDetail, reviewAdminEvent } from '@/services/adminEvents.js'
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
function StatusBanner({ recommendation }) {
  if (recommendation === 'APPROVE') {
    return (
      <div className="mb-5 flex items-start gap-4 rounded-[24px] border border-success/20 bg-success/5 p-5 shadow-[inset_0_0_20px_rgba(34,197,94,0.05)] backdrop-blur-sm transition-all hover:bg-success/10">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-success/20 text-success ring-1 ring-success/30">
          <CheckCircle2 className="size-5" />
        </div>
        <div>
          <h4 className="font-display text-sm font-black text-success drop-shadow-sm">Đủ điều kiện phê duyệt</h4>
          <p className="mt-1 text-xs font-medium text-success/80">
            Sự kiện không vi phạm chính sách và đầy đủ thông tin cần thiết.
          </p>
        </div>
      </div>
    )
  }

  if (recommendation === 'REJECT') {
    return (
      <div className="mb-5 flex items-start gap-4 rounded-[24px] border border-error/20 bg-error/5 p-5 shadow-[inset_0_0_20px_rgba(239,68,68,0.05)] backdrop-blur-sm transition-all hover:bg-error/10">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-error/20 text-error ring-1 ring-error/30">
          <Ban className="size-5" />
        </div>
        <div>
          <h4 className="font-display text-sm font-black text-error drop-shadow-sm">Nguy cơ vi phạm cao</h4>
          <p className="mt-1 text-xs font-medium text-error/80">
            AI phát hiện các vấn đề nghiêm trọng. Đề xuất từ chối hoặc kiểm tra kỹ lưỡng.
          </p>
        </div>
      </div>
    )
  }

  // Default: NEEDS_REVIEW
  return (
    <div className="mb-5 flex items-start gap-4 rounded-[24px] border border-warning/20 bg-warning/5 p-5 shadow-[inset_0_0_20px_rgba(245,158,11,0.05)] backdrop-blur-sm transition-all hover:bg-warning/10">
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-warning/20 text-warning ring-1 ring-warning/30">
        <AlertTriangle className="size-5" />
      </div>
      <div>
        <h4 className="font-display text-sm font-black text-warning drop-shadow-sm">Cần xem xét thủ công</h4>
        <p className="mt-1 text-xs font-medium text-warning/80">
          Sự kiện thiếu một số thông tin hoặc có mâu thuẫn nhỏ.
        </p>
      </div>
    </div>
  )
}

function WarningCard({ warning, onClick }) {
  const isHigh = warning.severity === 'high'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full cursor-pointer items-start gap-4 rounded-[20px] border p-4 text-left shadow-inner transition-all hover:-translate-y-0.5 ${
        isHigh 
          ? 'border-error/20 bg-error/[0.03] hover:bg-error/10 hover:border-error/40' 
          : 'border-warning/20 bg-warning/[0.03] hover:bg-warning/10 hover:border-warning/40'
      }`}
    >
      <div className={`grid size-10 shrink-0 place-items-center rounded-xl transition-colors ${isHigh ? 'bg-error/10 text-error group-hover:bg-error/20' : 'bg-warning/10 text-warning group-hover:bg-warning/20'}`}>
        {isHigh ? (
          <ShieldAlert className="size-5" />
        ) : (
          <AlertTriangle className="size-5" />
        )}
      </div>
      <div>
        <h5 className={`text-[13px] font-black tracking-tight drop-shadow-sm ${isHigh ? 'text-error' : 'text-warning'}`}>
          {warning.type || 'Cảnh báo'}
        </h5>
        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-300">{warning.message}</p>
      </div>
    </button>
  )
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

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  const { register, handleSubmit, setValue } = useForm({
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
  // Derived State / Mock AI Data fallback
  // -------------------------------------------------------------------------
  const isOnline = event.format === 'ONLINE'

  // If backend does not provide aiReview yet, use mock logic based on event completeness
  let aiReview = event.aiReview
  if (!aiReview) {
    const mockWarnings = []
    if (!event.description || event.description.length < 50) {
      mockWarnings.push({
        type: 'Tính đầy đủ',
        message: 'Mô tả sự kiện quá ngắn, có thể không cung cấp đủ thông tin cho người tham gia.',
        severity: 'medium',
      })
    }
    if (!event.banner_url) {
      mockWarnings.push({
        type: 'Hình ảnh',
        message: 'Chưa cung cấp ảnh Banner.',
        severity: 'medium',
      })
    }
    if (new Date(event.end_time) <= new Date(event.start_time)) {
      mockWarnings.push({
        type: 'Tính nhất quán',
        message: 'Thời gian kết thúc sự kiện đang được đặt nhỏ hơn hoặc bằng thời gian bắt đầu.',
        severity: 'high',
      })
    }

    aiReview = {
      recommendation: mockWarnings.some((w) => w.severity === 'high')
        ? 'REJECT'
        : mockWarnings.length > 0
          ? 'NEEDS_REVIEW'
          : 'APPROVE',
      warnings: mockWarnings,
    }
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleWarningClick = (warning) => {
    setValue('review_note', warning.message)
    // In a real app, this might scroll the left side to the relevant section
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

  // -------------------------------------------------------------------------
  // Main Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex h-[calc(100vh-130px)] flex-col overflow-hidden bg-slate-950 rounded-[32px] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.3)]">
      {/* Top Header */}
      <div className="shrink-0 p-6 pb-2 relative z-20">
        <header className="flex h-16 items-center justify-between rounded-full border border-white/10 bg-slate-900/60 px-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/events/review')}
              className="grid size-10 place-items-center rounded-full bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white shadow-inner"
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
        <div className={`overflow-y-auto p-6 scrollbar-thin ${isPendingReview ? 'w-[60%]' : 'w-full max-w-5xl mx-auto'}`}>
          {!isPendingReview && event.review_note && (
            <div className={`mb-6 p-4 rounded-xl border ${event.status === 'REJECTED' ? 'bg-error/10 border-error/20 text-error' : event.status === 'HIDDEN' ? 'bg-warning/10 border-warning/20 text-warning' : 'bg-panel-soft border-border-soft text-content'}`}>
              <h3 className="font-bold mb-1">Ghi chú từ quản trị viên:</h3>
              <p className="text-sm whitespace-pre-wrap">{event.review_note}</p>
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
                  {event.category_id || 'Danh mục trống'}
                </Badge>
                <Badge tone="indigo">
                  {isOnline ? <Video className="mr-1.5 size-3" /> : <MapPin className="mr-1.5 size-3" />}
                  {isOnline ? 'Sự kiện Online' : 'Sự kiện Offline'}
                </Badge>
              </div>

                <h2 className="mb-2 font-display text-3xl font-black tracking-tight text-white drop-shadow-md">
                  {event.title}
                </h2>
                {event.short_description && (
                  <p className="mb-8 text-base font-medium text-slate-400">{event.short_description}</p>
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
                        (Cần join bảng venue để hiển thị tên và địa chỉ)
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
                    dangerouslySetInnerHTML={{ __html: event.description }}
                  />
                ) : (
                  <p className="text-sm italic text-slate-500">Không có mô tả.</p>
                )}
              </div>

              {/* Extra Details */}
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner">
                  <h4 className="mb-3 font-display text-sm font-black text-white">
                    Quy định ghế ngồi
                  </h4>
                  <pre className="rounded-xl bg-black/20 p-4 text-xs font-medium text-slate-400 overflow-x-auto whitespace-pre-wrap break-all shadow-inner border border-white/5">
                    {JSON.stringify(event.seating_rules, null, 2)}
                  </pre>
                </div>
                <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner">
                  <h4 className="mb-3 font-display text-sm font-black text-white">
                    Chính sách hoàn tiền
                  </h4>
                  <pre className="rounded-xl bg-black/20 p-4 text-xs font-medium text-slate-400 overflow-x-auto whitespace-pre-wrap break-all shadow-inner border border-white/5">
                    {JSON.stringify(event.refund_policy, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: AI Assistant & Actions (40%) - ONLY FOR PENDING_REVIEW */}
        {isPendingReview && (
          <div className="flex w-[40%] flex-col border-l border-white/5 bg-slate-900/40 backdrop-blur-md relative z-10 shadow-[-10px_0_30px_rgba(0,0,0,0.1)]">
          {/* AI Info Area */}
          <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
            <div className="mb-8 flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-purple-500/10 ring-1 ring-purple-500/20">
                <SparklesIcon className="size-5 text-purple-400" />
              </div>
              <h2 className="font-display text-lg font-black text-white drop-shadow-sm tracking-tight">
                AI Assistant
              </h2>
            </div>

            <StatusBanner recommendation={aiReview.recommendation} />

            <div className="mt-10">
              <h3 className="mb-5 font-display text-[13px] font-black text-white flex items-center gap-2 tracking-wide uppercase">
                <Info className="size-4 text-slate-400" />
                Kết quả kiểm tra ({aiReview.warnings?.length || 0})
              </h3>
              
              {aiReview.warnings?.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {aiReview.warnings.map((w, idx) => (
                    <WarningCard
                      key={idx}
                      warning={w}
                      onClick={() => handleWarningClick(w)}
                    />
                  ))}
                  <p className="mt-2 text-center text-xs text-subtle italic">
                    Bấm vào một cảnh báo để tự động sao chép vào ghi chú.
                  </p>
                </div>
              ) : (
                <div className="rounded-[24px] border border-success/20 bg-success/5 p-8 text-center text-success/80 shadow-inner">
                  <CheckCircle2 className="mx-auto mb-3 size-10 opacity-50 drop-shadow-sm" />
                  <p className="text-[13px] font-black tracking-tight drop-shadow-sm">Không phát hiện rủi ro nào.</p>
                </div>
              )}
            </div>
          </div>

          {/* Admin Action Form Area */}
          <div className="shrink-0 border-t border-white/5 bg-slate-900/60 p-8 shadow-[0_-10px_30px_rgba(0,0,0,0.2)] backdrop-blur-md">
            <h3 className="mb-4 font-display text-[13px] font-black tracking-wide uppercase text-white">
              Quyết định kiểm duyệt
            </h3>
            
            <textarea
              {...register('review_note')}
              placeholder="Nhập ghi chú hoặc lý do từ chối/yêu cầu sửa (AI có thể điền giúp bạn)..."
              className="mb-5 min-h-[100px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 text-xs font-medium text-white shadow-inner outline-none transition-all placeholder:text-slate-500 focus:border-tertiary focus:bg-black/40 focus:ring-1 focus:ring-tertiary"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onSubmitReview('APPROVED')}
                disabled={isPending}
                className="admin-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                Phê duyệt
              </button>
              <button
                type="button"
                onClick={() => onSubmitReview('REJECTED')}
                disabled={isPending}
                className="admin-danger w-full disabled:cursor-not-allowed disabled:opacity-50"
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
