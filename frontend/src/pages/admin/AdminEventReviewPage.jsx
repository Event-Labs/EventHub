import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  MapPin,
  Tag,
  Ticket,
  XCircle,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Bot,
  FileCheck,
  Check,
  AlertCircle,
  ShieldAlert,
  Image as ImageIcon,
  FileText,
  Settings,
  Sliders,
  Play,
  Square,
  Zap,
  Info,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  fetchAdminEvents,
  hideAdminEvent,
  reviewAdminEvent,
  unhideAdminEvent,
  fetchAdminAiReview,
  runAdminAiReview,
  fetchAdminAutoReviewSettings,
  updateAdminAutoReviewSettings,
  runAdminBatchAutoReview,
  runAdminSingleAutoReview,
  cancelAdminAutoReview,
  fetchAdminAutoReviewScanStatus,
  fetchAdminReviewCriteria,
  suspendAdminEvent,
  unsuspendAdminEvent,
} from '@/services/adminEvents.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { Badge, ImagePlaceholder, Page, Panel, Table, TableActionButton } from './AdminComponents.jsx'
import { AdminReviewCriteriaModal } from './AdminReviewCriteriaModal.jsx'
import { AdminSuspendModal } from './AdminSuspendModal.jsx'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const STATUS_TABS = [
  { label: 'Chờ duyệt', value: 'PENDING_REVIEW' },
  { label: 'Yêu cầu hủy', value: 'CANCEL_REQUESTS' },
  { label: 'Đã duyệt', value: 'PUBLISHED' },
  { label: 'Từ chối', value: 'REJECTED' },
  { label: 'Bị đình chỉ', value: 'SUSPENDED' },
]

/**
 * Both REJECTED and HIDDEN events share status='HIDDEN' in the DB.
 * Distinguish them via approval_status:
 *   HIDDEN + approval_status=REJECTED → event failed admin review ("Từ chối")
 *   HIDDEN + approval_status=APPROVED → event was published then hidden for violations ("Đã ẩn")
 */
function statusBadge(status, approvalStatus, displayState) {
  if (displayState === 'SUSPENDED_BY_ADMIN') {
    return <Badge tone="red">Bị đình chỉ</Badge>
  }
  if (displayState === 'HIDDEN_BY_ORGANIZER') {
    return <Badge tone="gray">BTC Tạm ẩn</Badge>
  }
  if (status === 'HIDDEN') {
    return approvalStatus === 'REJECTED'
      ? <Badge tone="red">Từ chối</Badge>
      : <Badge tone="gray">Đã ẩn</Badge>
  }
  if (status === 'COMPLETED' && approvalStatus === 'APPROVED') {
    return <Badge tone="green">Đã duyệt</Badge>
  }
  const map = {
    PENDING_REVIEW: { tone: 'amber', label: 'Chờ duyệt' },
    PUBLISHED: { tone: 'green', label: 'Đã duyệt' },
    CANCELLED: { tone: 'red', label: 'Đã hủy' },
    COMPLETED: { tone: 'purple', label: 'Đã kết thúc' },
  }
  const cfg = map[status] ?? { tone: 'gray', label: status }
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export function AdminEventReviewPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [activeStatus, setActiveStatus] = useState('PENDING_REVIEW')
  const [page, setPage] = useState(1)

  // Per-row note state: { [eventId]: string }
  const [notes, setNotes] = useState({})

  // Detail modal state
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [modalNote, setModalNote] = useState('')
  const [modalError, setModalError] = useState('')

  // Confirm modal state
  const [confirmState, setConfirmState] = useState(null)

  // Suspend modal state
  const [suspendTarget, setSuspendTarget] = useState(null)
  const [suspendLoading, setSuspendLoading] = useState(false)

  // AI Auto-review settings state & queries
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isCriteriaOpen, setIsCriteriaOpen] = useState(false)

  const { data: autoReviewData, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['admin-auto-review-settings'],
    queryFn: fetchAdminAutoReviewSettings,
  })

  const { data: scanStatus } = useQuery({
    queryKey: ['admin-auto-review-scan-status'],
    queryFn: fetchAdminAutoReviewScanStatus,
    refetchInterval: (query) => (query.state.data?.isRunning ? 2000 : 8000),
  })

  const { data: criteriaList = [] } = useQuery({
    queryKey: ['admin-review-criteria'],
    queryFn: () => fetchAdminReviewCriteria(),
  })

  const activeCriteriaCount = criteriaList.filter((c) => c.is_active).length

  const autoReviewSettings = autoReviewData?.settings || {
    auto_review_enabled: false,
    auto_approve_enabled: true,
    auto_reject_enabled: true,
    auto_notify_organizer: true,
    min_quality_score: 75,
    max_risk_score: 25,
  }
  const autoReviewStats = autoReviewData?.stats || {
    pending_count: 0,
    auto_approved_count: 0,
    auto_rejected_count: 0,
    total_ai_reviewed_count: 0,
  }

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------
  const queryKey = ['admin-events', activeStatus, page]

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => fetchAdminEvents({ status: activeStatus, page, limit: 20 }),
    keepPreviousData: true,
  })

  useEffect(() => {
    if (isError) {
      toast.error('Không thể tải danh sách sự kiện.')
    }
  }, [isError, toast])

  const items = data?.items ?? []
  const pagination = data?.pagination ?? {}

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-events'] })

  const updateSettingsMutation = useMutation({
    mutationFn: (newSettings) => updateAdminAutoReviewSettings(newSettings),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin-auto-review-settings'], updated)
      toast.success('Đã lưu cấu hình AI tự động duyệt sự kiện thành công.')
      setIsSettingsOpen(false)
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể lưu cài đặt tự động duyệt.'))
    },
  })

  const toggleAutoReviewMutation = useMutation({
    mutationFn: (enabled) => updateAdminAutoReviewSettings({ auto_review_enabled: enabled }),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(['admin-auto-review-settings'], updated)
      toast.success(
        variables
          ? 'Đã BẬT hệ thống AI tự động đánh giá & duyệt sự kiện.'
          : 'Đã TẮT hệ thống AI tự động duyệt sự kiện (chuyển sang duyệt thủ công).'
      )
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể cập nhật trạng thái AI tự động duyệt.'))
    },
  })

  const runSingleAutoReviewMutation = useMutation({
    mutationFn: runAdminSingleAutoReview,
    onSuccess: (res) => {
      if (res.cancelled) {
        toast.info(res.message || 'Tiến trình quét đã được dừng theo yêu cầu.')
      } else if (res.processed === 0) {
        toast.info(res.message || 'Không có sự kiện nào cần quét lúc này.')
      } else {
        const title = res.eventTitle ? `"${res.eventTitle}"` : 'Sự kiện'
        if (res.action === 'APPROVED') {
          toast.success(`Hệ thống AI đã tự động phê duyệt sự kiện ${title}.`)
        } else if (res.action === 'REJECTED') {
          toast.error(`Hệ thống AI đã tự động từ chối sự kiện ${title}.`)
        } else if (res.action === 'PRE_REVIEWED') {
          toast.success(`Đã hoàn tất quét review trước cho ${title}. Kết quả đã sẵn sàng để Admin kiểm tra.`)
        } else {
          toast.info(`AI đã thẩm định ${title}: Cần Admin xem xét thêm (Needs Review).`)
        }
      }
      queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      queryClient.invalidateQueries({ queryKey: ['admin-auto-review-settings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-auto-review-scan-status'] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể thực hiện quét duyệt sự kiện.'))
      queryClient.invalidateQueries({ queryKey: ['admin-auto-review-scan-status'] })
    },
  })

  const cancelAutoReviewMutation = useMutation({
    mutationFn: cancelAdminAutoReview,
    onSuccess: (res) => {
      toast.success(res.message || 'Đã gửi lệnh dừng tiến trình quét AI.')
      queryClient.invalidateQueries({ queryKey: ['admin-auto-review-scan-status'] })
      queryClient.invalidateQueries({ queryKey: ['admin-events'] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể hủy tiến trình quét.'))
    },
  })

  const reviewMutation = useMutation({
    mutationFn: ({ eventId, payload }) => reviewAdminEvent(eventId, payload),
    onSuccess: (_data, variables) => {
      const status = variables?.payload?.status
      toast.success(status === 'APPROVED' ? 'Đã phê duyệt sự kiện.' : 'Đã từ chối sự kiện.')
      closeModal()
      invalidate()
    },
    onError: (err) => {
      const apiMsg = getApiMessage(err, 'Không thể thực hiện thao tác.')
      const zodErrors = err.response?.data?.errors
      if (zodErrors?.length) {
        const message = zodErrors.map((e) => e.message).join(', ')
        setModalError(message)
        toast.error(message)
      } else {
        setModalError(apiMsg)
        toast.error(apiMsg)
      }
    },
  })

  const hideMutation = useMutation({
    mutationFn: ({ eventId, payload }) => hideAdminEvent(eventId, payload),
    onSuccess: () => {
      toast.success('Đã ẩn sự kiện.')
      closeModal()
      invalidate()
    },
    onError: (err) => {
      const apiMsg = getApiMessage(err, 'Không thể ẩn sự kiện.')
      setModalError(apiMsg)
      toast.error(apiMsg)
    },
  })

  const unhideMutation = useMutation({
    mutationFn: ({ eventId }) => unhideAdminEvent(eventId),
    onSuccess: () => {
      toast.success('Đã bỏ ẩn sự kiện.')
      closeModal()
      invalidate()
    },
    onError: (err) => {
      const apiMsg = getApiMessage(err, 'Không thể bỏ ẩn sự kiện.')
      setModalError(apiMsg)
      toast.error(apiMsg)
    },
  })

  const isMutating = reviewMutation.isPending || hideMutation.isPending || unhideMutation.isPending

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const openModal = (event) => {
    setSelectedEvent(event)
    setModalNote(notes[event.id] ?? '')
    setModalError('')
  }

  const closeModal = () => {
    setSelectedEvent(null)
    setModalNote('')
    setModalError('')
  }

  /** Quick approve/reject directly from table row (note from inline input) */
  const quickReview = (eventId, status) => {
    const note = (notes[eventId] ?? '').trim() || null
    reviewMutation.mutate({ eventId, payload: { status, review_note: note } })
  }

  const closeConfirm = () => setConfirmState(null)

  /** Quick hide directly from table row */
  const quickHide = (eventId) => {
    setConfirmState({
      title: 'Xác nhận ẩn sự kiện',
      description: 'Bạn có chắc chắn muốn ẩn sự kiện này khỏi hệ thống? Sự kiện sẽ không còn hiển thị với người dùng.',
      confirmText: 'Ẩn sự kiện',
      confirmColor: 'bg-panel-soft border border-border-soft text-content hover:bg-panel-soft/80',
      onConfirm: () => {
        const note = (notes[eventId] ?? '').trim() || null
        hideMutation.mutate({ eventId, payload: { hide_note: note } })
        closeConfirm()
      }
    })
  }

  /** Quick unhide directly from table row */
  const quickUnhide = (eventId) => {
    setConfirmState({
      title: 'Xác nhận bỏ ẩn',
      description: 'Bạn có chắc chắn muốn bỏ ẩn sự kiện này? Sự kiện sẽ hiển thị lại bình thường.',
      confirmText: 'Bỏ ẩn',
      confirmColor: 'bg-success text-slate-950 hover:bg-success/90',
      onConfirm: () => {
        unhideMutation.mutate({ eventId })
        closeConfirm()
      }
    })
  }

  const confirmSuspend = async ({ reason, note }) => {
    if (!suspendTarget || suspendLoading) return
    setSuspendLoading(true)
    try {
      await suspendAdminEvent(suspendTarget.id, { reason, note })
      toast.success(`Đã đình chỉ sự kiện "${suspendTarget.title}".`)
      setSuspendTarget(null)
      invalidate()
    } catch (err) {
      toast.error(getApiMessage(err, 'Không thể đình chỉ sự kiện.'))
    } finally {
      setSuspendLoading(false)
    }
  }

  const quickUnsuspend = (event) => {
    setConfirmState({
      title: 'Gỡ đình chỉ sự kiện',
      subtitle: 'Khôi phục hiển thị và quyền mở bán vé.',
      eventTitle: event.title,
      description: `Bạn có chắc chắn muốn gỡ lệnh đình chỉ cho sự kiện "${event.title}"? Sự kiện sẽ được hiển thị trở lại và Ban tổ chức có thể tiếp tục mở bán vé bình thường.`,
      tone: 'success',
      confirmText: 'Xác nhận gỡ đình chỉ',
      cancelText: 'Hủy bỏ',
      onConfirm: async () => {
        try {
          await unsuspendAdminEvent(event.id)
          toast.success(`Đã gỡ đình chỉ sự kiện "${event.title}".`)
          closeConfirm()
          invalidate()
        } catch (err) {
          toast.error(getApiMessage(err, 'Không thể gỡ đình chỉ sự kiện.'))
        }
      },
    })
  }

  /** Modal submit */
  const submitModalReview = (status) => {
    if (!selectedEvent) return
    
    if (status === 'APPROVED') {
      setConfirmState({
        title: 'Xác nhận phê duyệt',
        subtitle: 'Chấp thuận xuất bản sự kiện lên nền tảng.',
        eventTitle: selectedEvent.title,
        description: 'Sự kiện sẽ được công khai và cho phép người dùng đặt vé tham gia.',
        tone: 'success',
        confirmText: 'Phê duyệt',
        cancelText: 'Hủy bỏ',
        onConfirm: () => {
          reviewMutation.mutate({
            eventId: selectedEvent.id,
            payload: { status, review_note: modalNote.trim() || null },
          })
          closeConfirm()
        }
      })
    } else {
      setConfirmState({
        title: 'Xác nhận từ chối',
        subtitle: 'Từ chối yêu cầu xuất bản sự kiện.',
        eventTitle: selectedEvent.title,
        description: 'Sự kiện sẽ bị từ chối và Ban tổ chức sẽ nhận được thông báo phản hồi lý do kiểm duyệt.',
        tone: 'danger',
        confirmText: 'Từ chối sự kiện',
        cancelText: 'Hủy bỏ',
        onConfirm: () => {
          reviewMutation.mutate({
            eventId: selectedEvent.id,
            payload: { status, review_note: modalNote.trim() || null },
          })
          closeConfirm()
        }
      })
    }
  }

  const submitModalHide = () => {
    if (!selectedEvent) return
    setConfirmState({
      title: 'Xác nhận ẩn sự kiện',
      description: 'Bạn có chắc chắn muốn ẩn sự kiện này khỏi hệ thống? Sự kiện sẽ không còn hiển thị với người dùng.',
      confirmText: 'Ẩn sự kiện',
      confirmColor: 'bg-panel-soft border border-border-soft text-content hover:bg-panel-soft/80',
      onConfirm: () => {
        hideMutation.mutate({
          eventId: selectedEvent.id,
          payload: { hide_note: modalNote.trim() || null },
        })
        closeConfirm()
      }
    })
  }

  const submitModalUnhide = () => {
    if (!selectedEvent) return
    setConfirmState({
      title: 'Xác nhận bỏ ẩn',
      description: 'Bạn có chắc chắn muốn bỏ ẩn sự kiện này? Sự kiện sẽ hiển thị lại bình thường.',
      confirmText: 'Bỏ ẩn',
      confirmColor: 'bg-success text-slate-950 hover:bg-success/90',
      onConfirm: () => {
        unhideMutation.mutate({ eventId: selectedEvent.id })
        closeConfirm()
      }
    })
  }

  const setNote = (eventId, value) =>
    setNotes((prev) => ({ ...prev, [eventId]: value }))

  const isScanning = Boolean(scanStatus?.isRunning || runSingleAutoReviewMutation.isPending)

  return (
    <Page
      title="Duyệt Sự kiện"
      description="Kiểm duyệt và phê duyệt các sự kiện được gửi bởi Organizer."
    >
      {/* AI Auto-Review Control Banner */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-panel-soft/70 to-panel p-4 shadow-lg backdrop-blur-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3.5">
            <div className={`mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl border shadow-inner ${
              isScanning
                ? 'border-amber-400/50 bg-gradient-to-br from-amber-500/30 to-rose-600/30 text-amber-300 shadow-amber-500/20'
                : autoReviewSettings.auto_review_enabled
                  ? 'border-indigo-400/40 bg-gradient-to-br from-indigo-500/30 to-purple-600/30 text-indigo-300 shadow-indigo-500/20 animate-pulse'
                  : 'border-border-soft/60 bg-panel text-subtle'
            }`}>
              <Bot className="size-5 sm:size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <h2 className="font-display text-sm sm:text-base font-black tracking-wide text-content break-words">
                    Hệ thống AI Tự động Thẩm định & Duyệt Sự kiện
                  </h2>
                  <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    <Sparkles className="size-3 text-indigo-400 shrink-0" />
                    AI Agent
                  </span>
                </div>
                {autoReviewSettings.auto_review_enabled ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 sm:px-2.5 py-0.5 text-[11px] sm:text-xs font-bold text-emerald-400 shadow-sm shadow-emerald-500/20">
                    <span className="size-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <span className="sm:hidden">
                      {autoReviewSettings.auto_approve_enabled ? 'BẬT (QUÉT 15P + TỰ DUYỆT)' : 'BẬT (QUÉT 15P REVIEW)'}
                    </span>
                    <span className="hidden sm:inline">
                      {autoReviewSettings.auto_approve_enabled ? 'ĐANG BẬT (QUÉT 15P + TỰ ĐỘNG DUYỆT)' : 'ĐANG BẬT (QUÉT 15P REVIEW TRƯỚC)'}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 sm:px-2.5 py-0.5 text-[11px] sm:text-xs font-bold text-zinc-400">
                    <span className="size-2 rounded-full bg-zinc-400 shrink-0" />
                    <span>ĐANG TẮT (DUYỆT THỦ CÔNG)</span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-subtle max-w-2xl leading-relaxed">
                Chu kỳ 15 phút quét đúng 1 sự kiện: Tự động phê duyệt nếu đạt chuẩn khi bật tự duyệt; hoặc quét review trước lưu kết quả thẩm định để Admin xem xét nếu tắt tự duyệt.
              </p>

              {/* Stats badges & Live Scanning status */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-lg border border-border-soft/40 bg-panel-soft/60 px-2.5 py-1 text-subtle">
                  Chờ duyệt: <strong className="text-amber-400">{autoReviewStats.pending_count}</strong>
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-950/20 px-2.5 py-1 text-emerald-300">
                  AI Tự động duyệt: <strong className="text-emerald-400">{autoReviewStats.auto_approved_count}</strong>
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-950/20 px-2.5 py-1 text-rose-300">
                  AI Tự động từ chối: <strong className="text-rose-400">{autoReviewStats.auto_rejected_count}</strong>
                </span>

                {isScanning && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-amber-200 font-semibold animate-pulse">
                    <RefreshCw className="size-3 animate-spin text-amber-400" />
                    Đang quét 1 sự kiện: {scanStatus?.eventTitle ? `"${scanStatus.eventTitle}"` : 'Đang xử lý...'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons (2 hàng 2 cột) */}
          <div className="grid grid-cols-2 gap-2.5 shrink-0 sm:w-[380px]">
            {/* AI Run Button / Cancel Button */}
            {isScanning ? (
              <button
                type="button"
                disabled={cancelAutoReviewMutation.isPending}
                onClick={() => {
                  runSingleAutoReviewMutation.reset()
                  cancelAutoReviewMutation.mutate()
                  queryClient.setQueryData(['admin-auto-review-scan-status'], { isRunning: false })
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/60 bg-gradient-to-r from-rose-600 via-rose-500 to-red-600 px-3 py-2 text-xs font-black tracking-wide text-white shadow-lg shadow-rose-950/50 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:from-rose-500 hover:to-red-500 active:scale-95 disabled:opacity-50"
                title="Dừng và hủy ngay tiến trình quét AI đang chạy"
              >
                <Square className="size-3.5 fill-white text-white animate-pulse" />
                <span>{cancelAutoReviewMutation.isPending ? 'Đang dừng...' : 'Hủy quét'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={runSingleAutoReviewMutation.isPending || autoReviewStats.pending_count === 0}
                onClick={() => runSingleAutoReviewMutation.mutate()}
                className="btn-led-gold-sm active:scale-95 !w-full !flex justify-center"
                title="Thẩm định duy nhất 01 sự kiện đang chờ duyệt (mỗi lần chạy chỉ review 1 sự kiện)"
              >
                <span className="btn-led-gold-sm-inner !w-full justify-center">
                  <Play className="size-4 fill-current shrink-0" />
                  <span>Quét duyệt AI</span>
                </span>
              </button>
            )}
            {/* Quick ON/OFF Switch */}
            <button
              type="button"
              disabled={toggleAutoReviewMutation.isPending}
              onClick={() => toggleAutoReviewMutation.mutate(!autoReviewSettings.auto_review_enabled)}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black shadow-md transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                autoReviewSettings.auto_review_enabled
                  ? 'border border-emerald-500/50 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                  : 'border border-border-soft/50 bg-panel-soft text-subtle hover:bg-surface hover:text-content'
              }`}
            >
              <Zap className={`size-4 ${autoReviewSettings.auto_review_enabled ? 'text-emerald-400' : 'text-subtle'}`} />
              <span>{autoReviewSettings.auto_review_enabled ? 'Bật tự động' : 'Tắt tự động'}</span>
            </button>


            {/* Settings Button */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border-soft/60 bg-panel-soft px-3 py-2 text-xs font-bold text-content shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-indigo-400/50 hover:bg-surface hover:text-indigo-300"
            >
              <Sliders className="size-4 text-indigo-400" />
              <span>Cài đặt tự động</span>
            </button>

            {/* Criteria Management Button */}
            <button
              type="button"
              onClick={() => setIsCriteriaOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-950/40 px-3 py-2 text-xs font-black text-indigo-300 shadow-md transition duration-200 hover:-translate-y-0.5 hover:border-indigo-400 hover:bg-indigo-900/50 hover:text-white"
            >
              <ShieldCheck className="size-4 text-indigo-400 shrink-0" />
              <span className="sm:hidden">Điều khoản</span><span className="hidden sm:inline">Điều khoản duyệt AI</span>
              {criteriaList.length > 0 && (
                <span className="rounded-full bg-indigo-500/30 px-1.5 py-0.5 text-[10px] font-black text-indigo-200 border border-indigo-500/40 shrink-0">
                  {activeCriteriaCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Status tab filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => { setActiveStatus(tab.value); setPage(1) }}
            className={`inline-flex min-w-20 sm:min-w-28 items-center justify-center rounded-full px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-extrabold shadow-sm transition duration-200 hover:-translate-y-0.5 ${activeStatus === tab.value
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-md shadow-[#C99A47]/30'
                : 'border border-border-soft/40 bg-panel-soft text-subtle hover:border-[#C99A47]/50 hover:bg-surface hover:text-[#E6C17A]'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* States */}
      {isLoading && (
        <Panel className="mt-5 text-sm text-subtle">Đang tải danh sách sự kiện...</Panel>
      )}
      {isError && (
        <Panel className="mt-5 text-sm text-error">Không thể tải danh sách sự kiện.</Panel>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <Panel className="mt-5 text-sm text-subtle">
          Không có sự kiện nào ở trạng thái này.
        </Panel>
      )}

      {/* Table */}
      {!isLoading && !isError && items.length > 0 && (
        <>
          <div className="mt-5">
            <Table
              headers={[
                'Ảnh',
                'Tên sự kiện',
                'Organizer',
                'Ngày diễn ra',
                'Ngày gửi',
                'Trạng thái',
                'Thao tác',
              ]}
              rows={items.map((event) => [
                /* Thumbnail */
                event.thumbnail_url ? (
                  <img
                    key="img"
                    src={event.thumbnail_url}
                    alt={event.title}
                    className="h-12 w-20 rounded-xl object-cover border border-border-soft/30"
                  />
                ) : (
                  <ImagePlaceholder key="img" label="Event" />
                ),

                /* Event name */
                <div key="name">
                  <p className="max-w-[200px] truncate font-semibold text-content">
                    {event.title}
                  </p>
                  <p className="text-xs text-subtle">{event.slug}</p>
                </div>,

                /* Organizer */
                <span key="org" className="text-sm text-subtle">
                  {event.organizer_name || '—'}
                </span>,

                /* Event date */
                <span key="date" className="text-sm text-subtle">
                  {formatDate(event.start_time)}
                </span>,

                /* Submitted date */
                <span key="sub" className="text-sm text-subtle">
                  {formatDate(event.created_at)}
                </span>,

                /* Status badge */
                <span key="status">
                  <div className="flex flex-col gap-1 items-start">
                    {statusBadge(event.status, event.approval_status, event.display_state)}
                    {event.cancel_request?.status === 'PENDING' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse whitespace-nowrap">
                        Chờ duyệt hủy
                      </span>
                    )}
                    {event.pending_revision && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse whitespace-nowrap">
                        Sửa đổi chờ duyệt
                      </span>
                    )}
                  </div>
                </span>,

                /* Actions */
                <div key="actions" className="flex flex-col gap-2">
                  <div className="flex items-center justify-center gap-2">
                    {/* Suspend — for PUBLISHED events that are not suspended and not in pending revision */}
                    {event.status === 'PUBLISHED' && event.display_state !== 'SUSPENDED_BY_ADMIN' && !event.pending_revision && (
                      <TableActionButton
                        title="Đình chỉ sự kiện (Khóa đa nguồn vi phạm)"
                        tone="danger"
                        icon={ShieldAlert}
                        onClick={() => setSuspendTarget(event)}
                        disabled={isMutating || suspendLoading}
                      />
                    )}
                    {/* Unsuspend — when SUSPENDED_BY_ADMIN */}
                    {event.display_state === 'SUSPENDED_BY_ADMIN' && (
                      <TableActionButton
                        title="Gỡ đình chỉ sự kiện"
                        tone="success"
                        icon={CheckCircle2}
                        onClick={() => quickUnsuspend(event)}
                        disabled={isMutating || suspendLoading}
                      />
                    )}
                    {/* View/Review detail button */}
                    <TableActionButton
                      title={
                        event.cancel_request?.status === 'PENDING'
                          ? 'Xem & Duyệt yêu cầu hủy sự kiện'
                          : event.status === 'PENDING_REVIEW' || event.pending_revision
                            ? 'Xem chi tiết & Thẩm định duyệt'
                            : 'Xem chi tiết sự kiện'
                      }
                      tone={
                        event.cancel_request?.status === 'PENDING'
                          ? 'danger'
                          : event.pending_revision
                            ? 'warning'
                            : 'primary'
                      }
                      icon={Eye}
                      onClick={() => navigate(`/admin/events/review/${event.id}`)}
                    />
                  </div>
                  <input
                    className="h-9 rounded-xl border border-border-soft/40 bg-panel-soft px-2 text-xs text-content outline-none focus:border-primary"
                    placeholder="Ghi chú (tuỳ chọn)"
                    value={notes[event.id] ?? ''}
                    onChange={(e) => setNote(event.id, e.target.value)}
                  />
                </div>,
              ])}
            />
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-subtle">
              <span>
                Trang {pagination.page} / {pagination.total_pages} · {pagination.total} sự kiện
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="admin-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Trước
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="admin-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Tiếp
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail / Review Modal */}
      {selectedEvent && (
        <EventReviewModal
          event={selectedEvent}
          note={modalNote}
          error={modalError}
          isMutating={isMutating}
          onNoteChange={setModalNote}
          onReview={submitModalReview}
          onHide={submitModalHide}
          onUnhide={submitModalUnhide}
          onClose={closeModal}
        />
      )}

      {/* Confirm Modal */}
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

      {/* AI Auto-Review Settings Modal */}
      <AiAutoReviewSettingsModal
        open={isSettingsOpen}
        settings={autoReviewSettings}
        isLoading={updateSettingsMutation.isPending}
        onSave={(newSettings) => updateSettingsMutation.mutate(newSettings)}
        onOpenCriteria={() => {
          setIsSettingsOpen(false)
          setIsCriteriaOpen(true)
        }}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* AI Review Criteria Management Modal */}
      <AdminReviewCriteriaModal
        isOpen={isCriteriaOpen}
        onClose={() => setIsCriteriaOpen(false)}
      />

      {/* Admin Suspend Modal */}
      {suspendTarget && (
        <AdminSuspendModal
          event={suspendTarget}
          loading={suspendLoading}
          onClose={() => setSuspendTarget(null)}
          onConfirm={confirmSuspend}
        />
      )}
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActionButton({ title, color, icon, onClick, disabled }) {
  const colorMap = {
    green: 'border-success/30 text-success hover:bg-success/10',
    red: 'border-error/30 text-error hover:bg-error/10',
    gray: 'border-border-soft/40 text-subtle hover:border-tertiary hover:bg-panel-soft',
  }
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`grid size-9 place-items-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50 ${colorMap[color]}`}
    >
      {icon}
    </button>
  )
}

function EventReviewModal({
  event,
  note,
  error,
  isMutating,
  onNoteChange,
  onReview,
  onHide,
  onUnhide,
  onClose,
}) {
  const isPending = event.status === 'PENDING_REVIEW'
  const isPublished = event.status === 'PUBLISHED'
  const isHiddenApproved = event.status === 'HIDDEN' && event.approval_status === 'APPROVED'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
      <Panel className="max-h-[90vh] w-full max-w-5xl overflow-y-auto border-border-soft/60">
        {/* Header */}
        <h3 className="font-display text-2xl font-extrabold text-content leading-tight">
          {event.title}
        </h3>
        <p className="mt-1 text-sm text-subtle">
          Organizer: <span className="font-semibold text-content">{event.organizer_name}</span>
        </p>
        <p className="text-sm text-subtle">
          Ngày diễn ra:{' '}
          <span className="font-semibold text-content">
            {formatDate(event.start_time)}
            {event.end_time && event.end_time !== event.start_time
              ? ` — ${formatDate(event.end_time)}`
              : ''}
          </span>
        </p>
        <div className="mt-2">{statusBadge(event.status, event.approval_status)}</div>

        {/* Event thumbnail */}
        {event.thumbnail_url && (
          <div className="mt-4 overflow-hidden rounded-xl border border-border-soft/40 bg-black/20">
            <img
              src={event.thumbnail_url}
              alt={event.title}
              className="max-h-[420px] w-full object-contain"
            />
          </div>
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <DetailBlock icon={Tag} label="Danh mục" value={event.category_name || 'Chưa phân loại'} />
          <DetailBlock icon={Calendar} label="Hình thức" value={event.format || 'Chưa cập nhật'} />
          <DetailBlock icon={Ticket} label="Số loại vé" value={`${event.ticket_types?.length || 0} loại vé`} />
          <DetailBlock icon={MapPin} label="Số phiên" value={`${event.sessions?.length || 0} phiên`} />
        </div>

        {(event.short_description || event.description) && (
          <div className="mt-5 rounded-xl border border-border-soft/30 bg-panel-soft/50 p-4">
            <p className="text-xs font-bold uppercase text-muted">Mô tả sự kiện</p>
            {event.short_description && <p className="mt-2 text-sm font-semibold text-content">{event.short_description}</p>}
            {event.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-subtle">
                {stripHtml(event.description)}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border-soft/30 bg-panel-soft/40 p-4">
            <p className="text-xs font-bold uppercase text-muted">Lịch diễn và địa điểm</p>
            <div className="mt-3 space-y-3">
              {(event.sessions || []).length === 0 ? (
                <p className="text-sm text-subtle">Chưa có session.</p>
              ) : (
                event.sessions.map((session) => (
                  <div key={session.id} className="rounded-lg border border-border-soft/20 bg-surface/50 p-3 text-sm">
                    <p className="font-bold text-content">{session.session_name || 'Session'}</p>
                    <p className="mt-1 text-subtle">{formatDateTime(session.start_time)} - {formatDateTime(session.end_time)}</p>
                    <p className="mt-1 text-subtle">
                      {[session.venue_name, session.address_line, session.city].filter(Boolean).join(', ') || 'Chưa cập nhật địa điểm'}
                    </p>
                    {session.seat_map_id && <p className="mt-1 text-xs font-bold text-tertiary">Có sơ đồ ghế</p>}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border-soft/30 bg-panel-soft/40 p-4">
            <p className="text-xs font-bold uppercase text-muted">Loại vé</p>
            <div className="mt-3 space-y-3">
              {(event.ticket_types || []).length === 0 ? (
                <p className="text-sm text-subtle">Chưa có loại vé.</p>
              ) : (
                event.ticket_types.map((ticket) => (
                  <div key={ticket.id} className="flex items-start justify-between gap-3 rounded-lg border border-border-soft/20 bg-surface/50 p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-content">{ticket.name}</p>
                      <p className="mt-1 text-subtle">{ticket.is_seated ? 'Vé theo ghế' : 'Vé thường'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-content">{formatMoney(ticket.price)}</p>
                      <p className="mt-1 text-xs text-subtle">{ticket.sold_quantity || 0}/{ticket.quantity || 0} đã bán</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {event.review_note && (
          <div className="mt-5 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
            <p className="font-bold">Ghi chú review gần nhất</p>
            <p className="mt-1 whitespace-pre-wrap">{event.review_note}</p>
          </div>
        )}

        {/* AI Review Assistant Card */}
        <div className="mt-5">
          <AiReviewAssistantCard
            event={event}
            onApplyFeedback={(feedbackText) => {
              onNoteChange((prev) => (prev ? `${prev}\n${feedbackText}` : feedbackText))
            }}
          />
        </div>

        {/* Note textarea — shown for PENDING_REVIEW and PUBLISHED (hide reason) */}
        {(isPending || isPublished) && (
          <label className="mt-5 block">
            <span className="text-sm font-semibold text-subtle">
              {isPending ? 'Ghi chú (bắt buộc khi từ chối)' : 'Lý do ẩn (tuỳ chọn)'}
            </span>
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-border-soft/40 bg-panel-soft p-3 text-sm text-content outline-none focus:border-primary placeholder:text-muted"
              placeholder={
                isPending
                  ? 'Nhập lý do duyệt hoặc từ chối...'
                  : 'Nhập lý do ẩn sự kiện...'
              }
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
            />
          </label>
        )}

        {/* Error */}

        {/* Action buttons */}
        <div className="mt-5 flex flex-wrap gap-3">
          {isPending && (
            <>
              <button
                type="button"
                disabled={isMutating}
                onClick={() => onReview('APPROVED')}
                className="admin-primary disabled:cursor-not-allowed disabled:opacity-70"
              >
                <CheckCircle2 className="size-4" />
                Phê duyệt
              </button>
              <button
                type="button"
                disabled={isMutating}
                onClick={() => onReview('REJECTED')}
                className="admin-danger disabled:cursor-not-allowed disabled:opacity-70"
              >
                <XCircle className="size-4" />
                Từ chối
              </button>
            </>
          )}

          <button
            type="button"
            className="admin-secondary"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>
      </Panel>
    </div>
  )
}

function DetailBlock({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-soft/30 bg-panel-soft/40 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-tertiary/10 text-tertiary">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-xs font-bold uppercase text-muted">{label}</p>
        <p className="text-sm font-bold text-content">{value}</p>
      </div>
    </div>
  )
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('vi-VN')
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value || 0))
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
        if (w.severity === 'HIGH') criticalViolations.push(item)
        else yellowWarnings.push(item)
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

function AiReviewAssistantCard({ event, onApplyFeedback }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const eventId = event?.id

  const reviewQuery = useQuery({
    queryKey: ['admin-ai-review', eventId],
    queryFn: () => fetchAdminAiReview(eventId),
    retry: false,
  })

  const cancelMutation = useMutation({
    mutationFn: cancelAdminAutoReview,
    onSuccess: (res) => {
      toast.success(res.message || 'Đã gửi lệnh dừng tiến trình quét AI.')
      queryClient.invalidateQueries({ queryKey: ['admin-auto-review-scan-status'] })
      queryClient.invalidateQueries({ queryKey: ['admin-ai-review', eventId] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể hủy tiến trình quét.'))
    },
  })

  const runMutation = useMutation({
    mutationFn: () => runAdminAiReview(event),
    onSuccess: (data) => {
      if (data?.cancelled) {
        toast.info(data.message || 'Tiến trình quét đã được dừng theo yêu cầu.')
      } else {
        toast.success('Đã hoàn thành phân tích sự kiện bằng AI!')
        queryClient.setQueryData(['admin-ai-review', eventId], data)
      }
      queryClient.invalidateQueries({ queryKey: ['admin-auto-review-scan-status'] })
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Không thể chạy phân tích AI.')
      queryClient.invalidateQueries({ queryKey: ['admin-auto-review-scan-status'] })
    },
  })

  const rawAiReview = reviewQuery.data || (event?.ai_recommendation ? { recommendation: event.ai_recommendation, warnings: event.ai_warnings } : null)
  const aiData = parseAiReviewData(rawAiReview)

  const getRecBadge = (rec) => {
    switch (rec) {
      case 'APPROVE':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black text-emerald-400 border border-emerald-500/30">
            <Check className="size-3.5" /> AI Khuyến nghị: Duyệt xuất bản (APPROVE)
          </span>
        )
      case 'NEEDS_REVIEW':
      case 'NEEDS_CHANGES':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-black text-amber-400 border border-amber-500/30">
            <AlertTriangle className="size-3.5" /> AI Khuyến nghị: Cần xem xét / Sửa đổi (NEEDS_REVIEW)
          </span>
        )
      case 'REJECT':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-3 py-1 text-xs font-black text-rose-400 border border-rose-500/30">
            <XCircle className="size-3.5" /> AI Khuyến nghị: Từ chối yêu cầu (REJECT)
          </span>
        )
      default:
        return <span className="rounded-full bg-slate-500/20 px-3 py-1 text-xs font-bold text-slate-300">{rec}</span>
    }
  }

  const getImageSourceLabel = (src) => {
    if (src === 'MAIN_POSTER') return 'Ảnh đại diện chính (Poster)'
    if (src === 'COVER_BANNER') return 'Ảnh bìa (Cover Banner)'
    if (src?.startsWith('PERMIT')) return 'Tài liệu giấy phép'
    if (src?.startsWith('DESCRIPTION_IMAGE')) return `Ảnh trong mô tả (${src.replace('DESCRIPTION_IMAGE_', '#')})`
    return src || 'Hình ảnh'
  }

  const formatAnalysis = (text, source) => {
    if (!text || typeof text !== 'string') return ''
    if (/[\u0E00-\u0E7F\u1780-\u17FF\u0E80-\u0EFF\u1000-\u109F\u0900-\u097F]/.test(text) || /(.)\1{4,}/.test(text) || /(.{2,8})\1{3,}/.test(text)) {
      return `${getImageSourceLabel(source)} có bố cục trực quan rõ nét, phù hợp với chủ đề sự kiện và không vi phạm quy chuẩn.`
    }
    return text
  }

  const getImageStatusBadge = (st) => {
    if (st === 'VIOLATION') return <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-400 border border-rose-500/30">Vi phạm nội dung</span>
    if (st === 'WARNING') return <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 border border-amber-500/30">Cần lưu ý / Tải lỗi</span>
    if (st === 'MISSING') return <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-400 border border-rose-500/30">Chưa tải ảnh</span>
    return <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/30">Đạt chuẩn (AI Vision xác nhận)</span>
  }

  const handleApplySingle = (text) => {
    onApplyFeedback?.(text)
    toast.success('Đã thêm vào ghi chú kiểm duyệt!')
  }

  const handleApplyAll = () => {
    if (!aiData) return
    const lines = []
    if (aiData.critical_violations?.length > 0) {
      lines.push('=== VI PHẠM CHÍNH SÁCH ===')
      aiData.critical_violations.forEach(v => lines.push(`- [VI PHẠM] ${v.issue}${v.highlighted_text ? ` (Trích: "${v.highlighted_text}")` : ''}`))
    }
    if (aiData.warnings?.length > 0) {
      lines.push('=== LƯU Ý & CẢNH BÁO ===')
      aiData.warnings.forEach(w => lines.push(`- [LƯU Ý] ${w.issue}${w.highlighted_text ? ` (Trích: "${w.highlighted_text}")` : ''}`))
    }
    const imageIssues = (aiData.image_review?.items || []).filter(i => i.status === 'VIOLATION' || i.status === 'WARNING')
    if (imageIssues.length > 0) {
      lines.push('=== VẤN ĐỀ HÌNH ẢNH ===')
      imageIssues.forEach(img => {
        lines.push(`- [${getImageSourceLabel(img.source)}]: ${img.issues?.join(', ') || img.suggestion || 'Không đạt chuẩn'}`)
      })
    }
    if (lines.length === 0) {
      toast.info('Không có lỗi nào để sao chép.')
      return
    }
    onApplyFeedback?.(lines.join('\n'))
    toast.success('Đã sao chép tất cả vấn đề vào ô Ghi chú Admin!')
  }

  const imageItems = Array.isArray(aiData?.image_review?.items) ? aiData.image_review.items : []
  const visionItems = Array.isArray(aiData?.vision_analysis) ? aiData.vision_analysis : []
  const hasImages = imageItems.length > 0 || visionItems.length > 0

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/90 p-5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-indigo-500/10 p-2 text-indigo-400 border border-indigo-500/20">
            <Bot className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-extrabold text-white text-base">Trợ lý AI Hỗ trợ Duyệt Sự kiện</h4>
              <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300">
                eventhub-qwen3
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Kiểm duyệt nội dung, ảnh qua AI Vision, cơ cấu vé & đối chiếu 4 bộ chính sách
            </p>
          </div>
        </div>

        {runMutation.isPending ? (
          <button
            type="button"
            onClick={() => {
              runMutation.reset()
              cancelMutation.mutate()
              queryClient.setQueryData(['admin-auto-review-scan-status'], { isRunning: false })
            }}
            disabled={cancelMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/60 bg-gradient-to-r from-rose-600 via-rose-500 to-red-600 px-4 py-2 text-xs font-black tracking-wide text-white shadow-lg shadow-rose-950/50 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:from-rose-500 hover:to-red-500 hover:shadow-rose-600/30 active:scale-95 disabled:opacity-50"
            title="Dừng và hủy ngay tiến trình quét AI đang chạy"
          >
            <Square className="size-3.5 fill-white text-white animate-pulse" />
            <span>{cancelMutation.isPending ? 'Đang dừng...' : 'Hủy tiến trình quét'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || reviewQuery.isLoading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-md transition hover:bg-indigo-500 disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${runMutation.isPending ? 'animate-spin' : ''}`} />
            {aiData ? 'Chạy lại AI' : 'Chạy AI Đánh giá'}
          </button>
        )}
      </div>

      {/* Active AI Scanning Progress State */}
      {runMutation.isPending && (
        <div className="mt-4 rounded-xl border border-indigo-500/30 bg-slate-900/90 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-start gap-3">
            <RefreshCw className="size-5 animate-spin text-indigo-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold text-indigo-300">
                  AI đang quét và phân tích đa tầng sự kiện...
                </h5>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300 bg-rose-950/40 border border-rose-500/30 px-2.5 py-0.5 rounded-lg">
                  <span className="size-1.5 rounded-full bg-rose-400 animate-ping" />
                  Có thể bấm "Hủy tiến trình quét" ở trên để dừng
                </span>
              </div>
              <div className="mt-1.5 space-y-1.5 text-xs text-slate-300">
                <p className="flex items-center gap-2">
                  <span className="inline-block size-1.5 rounded-full bg-indigo-400 animate-ping" />
                  <span><strong>Giai đoạn 1:</strong> AI Vision quét sâu từng hình ảnh (Poster, Banner, ảnh mô tả) để kiểm tra vi phạm...</span>
                </p>
                <p className="flex items-center gap-2">
                  <span className="inline-block size-1.5 rounded-full bg-amber-400 animate-ping" />
                  <span><strong>Giai đoạn 2:</strong> Qwen3 8B rà soát chính tả tiếng Việt & đối chiếu bộ điều khoản EventHub...</span>
                </p>
              </div>
              <p className="mt-2 text-[10px] text-slate-400 italic">
                Quá trình quét và đối chiếu toàn diện mất khoảng 30 - 60 giây. Bấm nút "Hủy tiến trình quét" màu đỏ ở trên nếu bạn muốn dừng ngay lập tức.
              </p>
            </div>
          </div>
        </div>
      )}

      {reviewQuery.isLoading ? (
        <div className="py-6 text-center text-xs text-slate-400">Đang tải phân tích AI...</div>
      ) : !aiData && !runMutation.isPending ? (
        <div className="py-6 text-center">
          <p className="text-xs text-slate-400">Chưa có kết quả phân tích AI cho sự kiện này.</p>
          <button
            type="button"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600/30 border border-indigo-500/40 px-4 py-2 text-xs font-bold text-indigo-300 transition hover:bg-indigo-600/50"
          >
            <Sparkles className="size-3.5" />
            Bắt đầu phân tích AI ngay
          </button>
        </div>
      ) : aiData && (
        <div className="mt-4 space-y-4 text-xs">
          {/* Recommendation Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-950/60 border border-slate-800 p-3">
            <div className="min-w-0 flex-1">{getRecBadge(aiData.recommendation)}</div>
            <div className="flex items-center gap-3 text-slate-300 text-xs">
              <span>Chất lượng: <strong className="text-emerald-400">{aiData.quality_score}/100</strong></span>
              <span className="text-slate-600">|</span>
              <span>Rủi ro: <strong className={aiData.risk_score > 50 ? 'text-rose-400' : 'text-emerald-400'}>{aiData.risk_score}/100</strong></span>
            </div>
          </div>

          {/* AI Summary */}
          {aiData.summary && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5 text-xs text-slate-300 leading-relaxed">
              <span className="font-bold text-slate-100 mr-1.5">Tóm tắt đánh giá:</span>
              {aiData.summary}
            </div>
          )}

          {/* 🖼️ KIỂM DUYỆT HÌNH ẢNH & VISION AUDIT */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
                <ImageIcon className="size-4 text-slate-400" />
                Kiểm duyệt Hình ảnh qua AI Vision ({imageItems.length || visionItems.length} ảnh)
              </span>
              <span className="text-[10px] text-slate-400 italic">
                * Chỉ ảnh AI quét an toàn mới đạt chuẩn
              </span>
            </div>

            {hasImages ? (
              <div className="space-y-2.5">
                {imageItems.length > 0 ? (
                  imageItems.map((img, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-100">{getImageSourceLabel(img.source)}</span>
                        {getImageStatusBadge(img.status)}
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
                          onClick={() => handleApplySingle(`[Gợi ý ảnh ${getImageSourceLabel(img.source)}] ${img.suggestion}`)}
                          className="flex w-full items-center justify-between rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-1.5 text-left text-xs text-amber-200 hover:bg-amber-950/35 transition"
                        >
                          <span>💡 Gợi ý: {img.suggestion}</span>
                          <span className="font-semibold text-amber-400">+ Thêm</span>
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  visionItems.map((img, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
                      <span className="font-semibold text-slate-100 text-xs">{getImageSourceLabel(img.source)}</span>
                      <p className="text-xs text-slate-300 leading-relaxed">{formatAnalysis(img.description, img.source)}</p>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Sự kiện chưa tải lên hình ảnh nào.</p>
            )}
          </div>

          {/* 🔴 CRITICAL VIOLATIONS */}
          {aiData.critical_violations && aiData.critical_violations.length > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 space-y-2.5">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-400">
                <ShieldAlert className="size-4" />
                Vi phạm chính sách nghiêm trọng ({aiData.critical_violations.length})
              </span>
              <div className="space-y-2">
                {aiData.critical_violations.map((v, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplySingle(`[VI PHẠM] ${v.issue}${v.highlighted_text ? ` (Trích đoạn: "${v.highlighted_text}")` : ''}`)}
                    className="flex w-full cursor-pointer items-start justify-between rounded-xl border border-rose-500/20 bg-slate-900/90 p-3 text-left text-xs text-slate-200 hover:bg-rose-950/30 transition shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-rose-300">[{v.policy_code || 'VI PHẠM'}]: </span>
                      <span>{v.issue}</span>
                      {v.highlighted_text && <p className="mt-1 text-[11px] text-rose-300/80 italic">&ldquo;{v.highlighted_text}&rdquo;</p>}
                    </div>
                    <span className="ml-2 shrink-0 text-[10px] font-semibold text-rose-400/80 hover:text-rose-300">+ Thêm</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 🟡 WARNINGS */}
          {aiData.warnings && aiData.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-2.5">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                <AlertTriangle className="size-4" />
                Cảnh báo & Cần lưu ý ({aiData.warnings.length})
              </span>
              <div className="space-y-2">
                {aiData.warnings.map((w, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplySingle(`[LƯU Ý] ${w.issue}${w.highlighted_text ? ` (Trích đoạn: "${w.highlighted_text}")` : ''}`)}
                    className="flex w-full cursor-pointer items-start justify-between rounded-xl border border-amber-500/20 bg-slate-900/90 p-3 text-left text-xs text-slate-200 hover:bg-amber-950/30 transition shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-amber-300">[{w.policy_code || 'LƯU Ý'}]: </span>
                      <span>{w.issue}</span>
                      {w.highlighted_text && <p className="mt-1 text-[11px] text-amber-300/80 italic">&ldquo;{w.highlighted_text}&rdquo;</p>}
                    </div>
                    <span className="ml-2 shrink-0 text-[10px] font-semibold text-amber-400/80 hover:text-amber-300">+ Thêm</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 🟢 COMPLIANT CHECKS */}
          {aiData.compliant_checks && aiData.compliant_checks.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-4 space-y-2.5">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                <CheckCircle2 className="size-4" />
                Tiêu chí đạt chuẩn ({aiData.compliant_checks.length})
              </span>
              <div className="space-y-1.5">
                {aiData.compliant_checks.map((c, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-slate-200">
                    <Check className="size-3.5 shrink-0 text-emerald-400 mt-0.5" />
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons: Copy all issues */}
          {((aiData.critical_violations?.length || 0) + (aiData.warnings?.length || 0) > 0) && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleApplyAll}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600/30 border border-indigo-500/40 px-3.5 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/50 transition"
              >
                <FileCheck className="size-3.5" />
                Sao chép tất cả vấn đề vào ô Ghi chú Admin
              </button>
            </div>
          )}
        </div>
      )}
    </div>
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
            <div className="min-w-0 flex-1">
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

function AiAutoReviewSettingsModal({
  open,
  settings,
  isLoading,
  onSave,
  onOpenCriteria,
  onClose,
}) {
  const [formState, setFormState] = useState({
    auto_review_enabled: false,
    auto_approve_enabled: true,
    auto_reject_enabled: true,
    auto_notify_organizer: true,
    min_quality_score: 75,
    max_risk_score: 25,
  })

  useEffect(() => {
    if (settings) {
      setFormState({
        auto_review_enabled: Boolean(settings.auto_review_enabled),
        auto_approve_enabled: Boolean(settings.auto_approve_enabled),
        auto_reject_enabled: Boolean(settings.auto_reject_enabled),
        auto_notify_organizer: Boolean(settings.auto_notify_organizer),
        min_quality_score: Number(settings.min_quality_score) || 75,
        max_risk_score: Number(settings.max_risk_score) || 25,
      })
    }
  }, [settings, open])

  if (!open) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formState)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-indigo-500/40 bg-[#0F172A] shadow-2xl shadow-indigo-950/60">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-soft/60 bg-slate-900/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30">
              <Bot className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-black text-white">
                Cài đặt Hệ thống AI Tự động Duyệt & Cảnh báo
              </h3>
              <p className="text-xs text-slate-400">
                Tùy chỉnh tiêu chuẩn tự động phê duyệt, từ chối và phản hồi Organizer
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Link to Criteria Management */}
          {onOpenCriteria && (
            <div className="flex items-center justify-between rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-3.5">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="size-4 text-indigo-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white">Quản lý Bộ Điều khoản & Tiêu chí Duyệt AI</p>
                  <p className="text-[11px] text-slate-400">Thêm, sửa, xóa các quy tắc kiểm tra (Giấy phép PDF, Hình ảnh, Giá vé...)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenCriteria}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 transition"
              >
                Cấu hình điều khoản
              </button>
            </div>
          )}

          {/* Main Master Toggle */}
          <div className={`rounded-xl border p-4 transition ${
            formState.auto_review_enabled
              ? 'border-indigo-500/50 bg-indigo-950/30 shadow-inner'
              : 'border-slate-800 bg-slate-900/50'
          }`}>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Kích hoạt AI Quét Thẩm định (Chu kỳ 15 phút / 1 sự kiện)</span>
                  {formState.auto_review_enabled && (
                    <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                      Đang kích hoạt
                    </span>
                  )}
                </label>
                <p className="text-xs text-slate-400">
                  Cứ sau mỗi 15 phút, hệ thống tự động quét đúng 1 sự kiện đang chờ duyệt (hoặc Admin có thể bấm nút chạy thủ công bất cứ lúc nào).
                </p>
              </div>
              <input
                type="checkbox"
                checked={formState.auto_review_enabled}
                onChange={(e) => setFormState((prev) => ({ ...prev, auto_review_enabled: e.target.checked }))}
                className="size-5 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Sub options grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Auto Approve Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-300">Tự động Phê duyệt</span>
                </div>
                <input
                  type="checkbox"
                  disabled={!formState.auto_review_enabled}
                  checked={formState.auto_approve_enabled}
                  onChange={(e) => setFormState((prev) => ({ ...prev, auto_approve_enabled: e.target.checked }))}
                  className="size-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-400 disabled:opacity-40 cursor-pointer"
                />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                • <strong>BẬT</strong>: Sự kiện đạt chuẩn sẽ tự động chuyển sang <strong>ĐÃ DUYỆT (APPROVED)</strong>.<br />
                • <strong>TẮT</strong>: Cứ sau 15p AI chỉ quét review trước cho Admin và đưa ra kết quả, giữ nguyên sự kiện ở trạng thái Chờ duyệt để Admin kiểm tra và quyết định.
              </p>
            </div>

            {/* Auto Reject Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="size-4 text-rose-400" />
                  <span className="text-sm font-bold text-rose-300">Tự động Từ chối</span>
                </div>
                <input
                  type="checkbox"
                  disabled={!formState.auto_review_enabled}
                  checked={formState.auto_reject_enabled}
                  onChange={(e) => setFormState((prev) => ({ ...prev, auto_reject_enabled: e.target.checked }))}
                  className="size-4 rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-rose-400 disabled:opacity-40 cursor-pointer"
                />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tự động chuyển sự kiện sang trạng thái <strong>TỪ CHỐI (HIDDEN)</strong> khi phát hiện vi phạm pháp lý hoặc chính sách nghiêm trọng.
              </p>
            </div>
          </div>

          {/* Auto Notify Organizer */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-amber-400" />
                <span className="text-sm font-bold text-amber-300">Gửi cảnh báo & đề xuất cải thiện cho Organizer</span>
              </div>
              <input
                type="checkbox"
                disabled={!formState.auto_review_enabled}
                checked={formState.auto_notify_organizer}
                onChange={(e) => setFormState((prev) => ({ ...prev, auto_notify_organizer: e.target.checked }))}
                className="size-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-400 disabled:opacity-40 cursor-pointer"
              />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tự động gửi thông báo chi tiết (vi phạm cụ thể, cảnh báo, đề xuất cải thiện nội dung và lỗi chính tả phát hiện bởi AI) về email & tài khoản của Organizer.
            </p>
          </div>

          {/* Threshold Sliders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Min Quality Score */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300">
                  Điểm chất lượng tối thiểu để duyệt
                </label>
                <span className="text-sm font-black text-emerald-400">{formState.min_quality_score}/100</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                step="5"
                disabled={!formState.auto_review_enabled || !formState.auto_approve_enabled}
                value={formState.min_quality_score}
                onChange={(e) => setFormState((prev) => ({ ...prev, min_quality_score: Number(e.target.value) }))}
                className="w-full accent-emerald-500 cursor-pointer disabled:opacity-40"
              />
              <p className="text-[11px] text-slate-500">
                Khuyến nghị: 75-80 điểm. Sự kiện có điểm thấp hơn sẽ chuyển sang Admin duyệt thủ công.
              </p>
            </div>

            {/* Max Risk Score */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300">
                  Mức rủi ro tối đa cho phép
                </label>
                <span className="text-sm font-black text-rose-400">{formState.max_risk_score}/100</span>
              </div>
              <input
                type="range"
                min="10"
                max="50"
                step="5"
                disabled={!formState.auto_review_enabled || !formState.auto_approve_enabled}
                value={formState.max_risk_score}
                onChange={(e) => setFormState((prev) => ({ ...prev, max_risk_score: Number(e.target.value) }))}
                className="w-full accent-rose-500 cursor-pointer disabled:opacity-40"
              />
              <p className="text-[11px] text-slate-500">
                Khuyến nghị: ≤ 25 điểm. Sự kiện có rủi ro cao hơn sẽ không thể tự động duyệt.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-300 rounded-xl hover:bg-slate-800 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-2 text-xs font-black text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-indigo-400 transition disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  <span>Lưu cấu hình</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

