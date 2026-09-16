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
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-success/30 bg-success/10 p-4">
        <CheckCircle2 className="mt-0.5 size-5 text-success" />
        <div>
          <h4 className="font-display font-extrabold text-success">Đủ điều kiện phê duyệt</h4>
          <p className="mt-1 text-sm text-success/80">
            Sự kiện không vi phạm chính sách và đầy đủ thông tin cần thiết.
          </p>
        </div>
      </div>
    )
  }

  if (recommendation === 'REJECT') {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-error/30 bg-error/10 p-4">
        <Ban className="mt-0.5 size-5 text-error" />
        <div>
          <h4 className="font-display font-extrabold text-error">Nguy cơ vi phạm cao</h4>
          <p className="mt-1 text-sm text-error/80">
            AI phát hiện các vấn đề nghiêm trọng. Đề xuất từ chối hoặc kiểm tra kỹ lưỡng.
          </p>
        </div>
      </div>
    )
  }

  // Default: NEEDS_REVIEW
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
      <AlertTriangle className="mt-0.5 size-5 text-warning" />
      <div>
        <h4 className="font-display font-extrabold text-warning">Cần xem xét thủ công</h4>
        <p className="mt-1 text-sm text-warning/80">
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
      className={`flex w-full cursor-pointer items-start gap-3 rounded-xl border p-4 text-left transition hover:bg-panel-soft ${
        isHigh ? 'border-error/30 bg-error/[0.02]' : 'border-warning/30 bg-warning/[0.02]'
      }`}
    >
      <div className="mt-0.5 grid shrink-0 place-items-center">
        {isHigh ? (
          <ShieldAlert className="size-5 text-error" />
        ) : (
          <AlertTriangle className="size-5 text-warning" />
        )}
      </div>
      <div>
        <h5 className={`text-sm font-bold ${isHigh ? 'text-error' : 'text-warning'}`}>
          {warning.type || 'Cảnh báo'}
        </h5>
        <p className="mt-1 text-[13px] leading-relaxed text-subtle">{warning.message}</p>
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
      reviewMutation.mutate({
        status,
        review_note: data.review_note?.trim() || null,
      })
    })()
  }

  const isPending = reviewMutation.isPending

  // -------------------------------------------------------------------------
  // Main Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      {/* Top Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border-soft px-6 bg-panel">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/events/review')}
            className="grid size-9 place-items-center rounded-xl transition hover:bg-panel-soft"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="font-display text-xl font-extrabold truncate max-w-xl">
            {event.title}
          </h1>
          <Badge tone="blue">{event.status}</Badge>
        </div>
      </header>

      {/* Main Split Screen */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Event Details (60%) */}
        <div className="w-[60%] overflow-y-auto p-6 scrollbar-thin">
          <Panel className="mb-6 p-0 overflow-hidden">
            {event.banner_url ? (
              <img
                src={event.banner_url}
                alt="Banner"
                className="h-64 w-full object-cover"
              />
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

              <h2 className="mb-2 font-display text-2xl font-extrabold text-content">
                {event.title}
              </h2>
              {event.short_description && (
                <p className="mb-6 text-base text-subtle">{event.short_description}</p>
              )}

              <div className="mb-8 grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-xl border border-border-soft/60 p-4">
                  <Calendar className="mt-0.5 size-5 text-tertiary" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-subtle">
                      Thời gian
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      Bắt đầu: {formatDate(event.start_time)}
                    </p>
                    <p className="text-sm font-medium">
                      Kết thúc: {formatDate(event.end_time)}
                    </p>
                  </div>
                </div>
                {!isOnline && (
                  <div className="flex items-start gap-3 rounded-xl border border-border-soft/60 p-4">
                    <MapPin className="mt-0.5 size-5 text-tertiary" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-subtle">
                        Địa điểm
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        (Cần join bảng venue để hiển thị tên và địa chỉ)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-8">
                <h3 className="mb-4 font-display text-lg font-extrabold text-content">
                  Mô tả chi tiết
                </h3>
                {event.description ? (
                  <div
                    className="prose prose-sm max-w-none text-subtle"
                    dangerouslySetInnerHTML={{ __html: event.description }}
                  />
                ) : (
                  <p className="text-sm italic text-subtle">Không có mô tả.</p>
                )}
              </div>

              {/* Extra Details */}
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <h4 className="mb-3 font-display text-sm font-extrabold text-content">
                    Quy định ghế ngồi
                  </h4>
                  <pre className="rounded-xl border border-border-soft bg-panel-soft p-3 text-xs text-subtle overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(event.seating_rules, null, 2)}
                  </pre>
                </div>
                <div>
                  <h4 className="mb-3 font-display text-sm font-extrabold text-content">
                    Chính sách hoàn tiền
                  </h4>
                  <pre className="rounded-xl border border-border-soft bg-panel-soft p-3 text-xs text-subtle overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(event.refund_policy, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* Right Column: AI Assistant & Actions (40%) */}
        <div className="flex w-[40%] flex-col border-l border-border-soft bg-panel-soft">
          {/* AI Info Area */}
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            <div className="mb-6 flex items-center gap-2">
              <SparklesIcon className="size-5 text-purple-500" />
              <h2 className="font-display text-lg font-extrabold text-content">
                AI Assistant Review
              </h2>
            </div>

            <StatusBanner recommendation={aiReview.recommendation} />

            <div className="mt-8">
              <h3 className="mb-4 font-display text-sm font-extrabold text-content flex items-center gap-2">
                <Info className="size-4 text-subtle" />
                Kết quả kiểm tra ({aiReview.warnings?.length || 0} vấn đề)
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
                <div className="rounded-xl border border-success/20 bg-success/5 p-8 text-center text-success/80">
                  <CheckCircle2 className="mx-auto mb-3 size-8 opacity-50" />
                  <p className="text-sm font-bold">Không phát hiện rủi ro nào.</p>
                </div>
              )}
            </div>
          </div>

          {/* Admin Action Form Area */}
          <div className="shrink-0 border-t border-border-soft bg-panel p-6 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
            <h3 className="mb-3 font-display text-sm font-extrabold text-content">
              Quyết định kiểm duyệt
            </h3>
            
            <textarea
              {...register('review_note')}
              placeholder="Nhập ghi chú hoặc lý do từ chối/yêu cầu sửa (AI có thể điền giúp bạn khi click vào cảnh báo)..."
              className="mb-4 min-h-[100px] w-full resize-y rounded-xl border border-border-soft bg-bg p-3 text-sm text-content outline-none transition focus:border-tertiary focus:ring-1 focus:ring-tertiary"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onSubmitReview('APPROVED')}
                disabled={isPending}
                className="flex items-center justify-center rounded-xl bg-success px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-success/90 disabled:opacity-50"
              >
                Phê duyệt
              </button>
              <button
                type="button"
                onClick={() => onSubmitReview('REJECTED')}
                disabled={isPending}
                className="flex items-center justify-center rounded-xl bg-error px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-error/90 disabled:opacity-50"
              >
                Từ chối
              </button>
            </div>
          </div>
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
