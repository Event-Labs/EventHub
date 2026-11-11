import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
    fetchOrganizerEvent,
    fetchDemandPrediction,
    publishOrganizerEvent,
    hideOrganizerEvent,
    unhideOrganizerEvent,
    pauseSalesOrganizerEvent,
    resumeSalesOrganizerEvent,
    cancelOrganizerEvent,
    submitCancellationRequest,
    withdrawCancellationRequest,
    deleteOrganizerDraftEvent,
} from '@/services/organizerEvents.js'
import {
    fetchCheckinStats,
    fetchRevenueStats,
} from '@/services/organizerOrders.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import {
    OrganizerPage,
    OrganizerPanel,
    Badge,
    StatCard,
} from './OrganizerComponents.jsx'
import {
    CalendarDays,
    MapPin,
    Users,
    Wallet,
    Ticket,
    ArrowLeft,
    Clock,
    TrendingUp,
    TrendingDown,
    Minus,
    Sparkles,
    ChevronDown,
    ChevronUp,
    Pencil,
    RotateCcw,
} from 'lucide-react'
import { isEventEnded } from './eventStatusUtil.js'
import {
    PublishConfirmModal,
    ToggleHideConfirmModal,
    ToggleSalesConfirmModal,
    CancelOrRequestCancelModal,
    WithdrawCancelConfirmModal,
    DeleteDraftConfirmModal,
} from './OrganizerEventModals.jsx'
import { EventActionsDropdown } from './EventActionsDropdown.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { translatePhrase } from '@/i18n/phraseDictionary.js'
import { cleanAndFormatVenue, translateEventHtmlDescription } from '@/i18n/eventTranslations.js'
import '@/components/RichTextEditor.css'

const STATUS_LABELS_VI = {
    DRAFT: 'Bản nháp',
    PENDING_REVIEW: 'Chờ duyệt',
    PUBLISHED: 'Đã xuất bản',
    HIDDEN: 'Đã ẩn',
    CANCELLED: 'Đã hủy',
    COMPLETED: 'Đã kết thúc',
}

const STATUS_LABELS_EN = {
    DRAFT: 'Draft',
    PENDING_REVIEW: 'Pending Review',
    PUBLISHED: 'Published',
    HIDDEN: 'Hidden',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed',
}

const STATUS_TONES = {
    DRAFT: 'slate',
    PENDING_REVIEW: 'amber',
    PUBLISHED: 'green',
    HIDDEN: 'neutral',
    CANCELLED: 'red',
    COMPLETED: 'purple',
}

function DemandPredictionCard({ eventId }) {
    const { isEnglish } = useLanguage()
    const [prediction, setPrediction] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        fetchDemandPrediction(eventId)
            .then((data) => {
                if (!cancelled) setPrediction(data)
            })
            .catch((err) => {
                if (!cancelled) setError(err)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => { cancelled = true }
    }, [eventId])

    if (loading) {
        return (
            <OrganizerPanel>
                <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="size-5 text-primary" />
                    <h3 className="font-bold text-content">{isEnglish ? 'AI Demand Prediction' : 'AI Dự báo nhu cầu'}</h3>
                </div>
                <div className="animate-pulse space-y-2">
                    <div className="h-8 w-3/4 rounded bg-panel-soft" />
                    <div className="h-4 w-1/2 rounded bg-panel-soft" />
                    <div className="h-4 w-2/3 rounded bg-panel-soft" />
                </div>
            </OrganizerPanel>
        )
    }

    if (error || !prediction || prediction.demand_label === 'UNAVAILABLE') {
        return null // Silently hide if AI service unavailable
    }

    const isHigh = prediction.demand_label === 'HIGH'
    const score = Math.round((prediction.demand_score || 0) * 100)
    const sellOutPct = Math.round((prediction.sell_out_probability || 0) * 100)

    const DemandIcon = isHigh ? TrendingUp : sellOutPct >= 40 ? Minus : TrendingDown
    const demandColor = isHigh
        ? 'text-green-400'
        : sellOutPct >= 40 ? 'text-yellow-400' : 'text-orange-400'
    const demandBg = isHigh
        ? 'bg-green-500/10 border-green-500/20'
        : sellOutPct >= 40 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-orange-500/10 border-orange-500/20'
    const demandLabel = isHigh
        ? (isEnglish ? 'High Demand' : 'Nhu cầu cao')
        : sellOutPct >= 40
            ? (isEnglish ? 'Medium Demand' : 'Nhu cầu trung bình')
            : (isEnglish ? 'Low Demand' : 'Nhu cầu thấp')

    return (
        <OrganizerPanel>
            <div className="flex items-center gap-2 mb-4">
                <Sparkles className="size-5 text-primary" />
                <h3 className="font-bold text-content">{isEnglish ? 'AI Demand Prediction' : 'AI Dự báo nhu cầu'}</h3>
                <span className="ml-auto text-xs text-subtle">{prediction.model_version}</span>
            </div>

            {/* Demand label badge */}
            <div className={`flex items-center gap-3 rounded-xl border p-3 ${demandBg}`}>
                <DemandIcon className={`size-6 ${demandColor}`} />
                <div>
                    <p className={`font-bold ${demandColor}`}>{demandLabel}</p>
                    <p className="text-xs text-subtle">{isEnglish ? 'Forecast by EventHub AI' : 'Dự báo từ AI EventHub'}</p>
                </div>
            </div>

            {/* Metrics */}
            <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-panel-soft p-3 text-center">
                    <p className="text-2xl font-extrabold text-content">{score}%</p>
                    <p className="text-xs text-subtle mt-1">{isEnglish ? 'Demand Score' : 'Điểm nhu cầu'}</p>
                </div>
                <div className="rounded-xl bg-panel-soft p-3 text-center">
                    <p className="text-2xl font-extrabold text-content">{sellOutPct}%</p>
                    <p className="text-xs text-subtle mt-1">{isEnglish ? 'Sell-out Probability' : 'Xác suất hết vé'}</p>
                </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
                <div className="flex justify-between text-xs text-subtle mb-1">
                    <span>{isEnglish ? 'Sell-out Probability' : 'Xác suất hết vé'}</span>
                    <span>{sellOutPct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-panel-soft">
                    <div
                        className={`h-full rounded-full transition-all duration-700 ${isHigh ? 'bg-green-400' : sellOutPct >= 40 ? 'bg-yellow-400' : 'bg-orange-400'}`}
                        style={{ width: `${sellOutPct}%` }}
                    />
                </div>
            </div>

            <p className="mt-3 text-xs text-subtle">
                {isEnglish
                    ? '* Predictions are based on AI models trained from EventHub historical data.'
                    : '* Dự báo dựa trên mô hình AI được training từ dữ liệu lịch sử EventHub.'}
            </p>
        </OrganizerPanel>
    )
}

export function OrganizerEventDetailPage() {
    const { isEnglish } = useLanguage()
    const { eventId } = useParams()
    const navigate = useNavigate()
    const toast = useToast()

    const [event, setEvent] = useState(null)
    const [loading, setLoading] = useState(true)
    const [checkinStats, setCheckinStats] = useState(null)
    const [revenueStats, setRevenueStats] = useState(null)
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

    // Modal states
    const [publishTarget, setPublishTarget] = useState(null)
    const [publishLoading, setPublishLoading] = useState(false)
    const [hideTarget, setHideTarget] = useState(null)
    const [hideLoading, setHideLoading] = useState(false)
    const [salesTarget, setSalesTarget] = useState(null)
    const [salesLoading, setSalesLoading] = useState(false)
    const [cancelTarget, setCancelTarget] = useState(null)
    const [cancelLoading, setCancelLoading] = useState(false)
    const [cancelError, setCancelError] = useState(null)
    const [withdrawTarget, setWithdrawTarget] = useState(null)
    const [withdrawLoading, setWithdrawLoading] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [eventData, checkinData, revenueData] = await Promise.all([
                fetchOrganizerEvent(eventId),
                fetchCheckinStats(eventId).catch(() => null),
                fetchRevenueStats({ eventId }).catch(() => null),
            ])

            setEvent(eventData)
            setCheckinStats(checkinData)
            setRevenueStats(revenueData)
        } catch (err) {
            console.error(err)
            toast.error(getApiMessage(err, 'Không thể tải thông tin sự kiện.'))
        } finally {
            setLoading(false)
        }
    }, [eventId, toast])

    // Action handlers
    const openPublishModal = (ev) => setPublishTarget(ev)
    const closePublishModal = () => !publishLoading && setPublishTarget(null)
    const confirmPublish = async () => {
        if (!publishTarget || publishLoading) return
        setPublishLoading(true)
        try {
            await publishOrganizerEvent(publishTarget.id)
            setPublishTarget(null)
            toast.success(`Đã xuất bản thành công "${publishTarget.title}".`)
            await loadData()
        } catch (err) {
            console.error(err)
            toast.error(getApiMessage(err, 'Không thể xuất bản sự kiện.'))
        } finally {
            setPublishLoading(false)
        }
    }

    const openHideModal = (ev) => setHideTarget(ev)
    const closeHideModal = () => !hideLoading && setHideTarget(null)
    const confirmToggleHide = async (payload = {}) => {
        if (!hideTarget || hideLoading) return
        setHideLoading(true)
        try {
            const isCurrentlyHidden = hideTarget.display_state === 'HIDDEN_BY_ORGANIZER'
            if (isCurrentlyHidden) {
                await unhideOrganizerEvent(hideTarget.id)
                toast.success(`Đã hiển thị lại sự kiện "${hideTarget.title}".`)
            } else {
                await hideOrganizerEvent(hideTarget.id, payload.reason || 'Tạm ẩn theo yêu cầu của ban tổ chức')
                toast.info(`Đã ẩn sự kiện "${hideTarget.title}" khỏi tìm kiếm và trang chủ.`)
            }
            setHideTarget(null)
            await loadData()
        } catch (err) {
            console.error(err)
            toast.error(getApiMessage(err, 'Không thể thay đổi trạng thái hiển thị.'))
        } finally {
            setHideLoading(false)
        }
    }

    const openSalesModal = (ev) => {
        if (ev?.sales_status === 'PAUSED' && (ev?.display_state === 'HIDDEN_BY_ORGANIZER' || ev?.status === 'HIDDEN')) {
            toast.warning('Không thể kích hoạt bán vé khi sự kiện đang bị ẩn. Vui lòng hiện lại sự kiện trước.')
            return
        }
        setSalesTarget(ev)
    }
    const closeSalesModal = () => !salesLoading && setSalesTarget(null)
    const confirmToggleSales = async (payload = {}) => {
        if (!salesTarget || salesLoading) return
        if (salesTarget.sales_status === 'PAUSED' && (salesTarget.display_state === 'HIDDEN_BY_ORGANIZER' || salesTarget.status === 'HIDDEN')) {
            toast.warning('Không thể kích hoạt bán vé khi sự kiện đang bị ẩn. Vui lòng hiện lại sự kiện trước.')
            setSalesTarget(null)
            return
        }
        setSalesLoading(true)
        try {
            if (payload.action === 'RESUME_TICKET_TYPE' && payload.ticketTypeId) {
                await resumeSalesOrganizerEvent(salesTarget.id, { ticketTypeId: payload.ticketTypeId })
                toast.success(isEnglish ? `Ticket sales resumed for tier "${payload.ticketTypeName || 'selected'}".` : `Đã mở bán lại vé cho hạng vé "${payload.ticketTypeName || 'đã chọn'}".`)
            } else if (payload.action === 'RESUME_ALL_TICKETS') {
                const ticketTypeIds = Array.isArray(payload.ticketTypeIds) && payload.ticketTypeIds.length > 0
                    ? payload.ticketTypeIds
                    : undefined
                await resumeSalesOrganizerEvent(salesTarget.id, ticketTypeIds ? { ticketTypeIds } : {})
                toast.success(isEnglish ? 'Ticket sales resumed for all selected tiers.' : 'Đã mở bán lại cho tất cả các hạng vé đã chọn.')
            } else if (payload.scope === 'SPECIFIC' && (payload.ticketTypeIds?.length || payload.ticketTypeId)) {
                const ticketTypeIds = payload.ticketTypeIds || [payload.ticketTypeId]
                await pauseSalesOrganizerEvent(salesTarget.id, {
                    scope: 'SPECIFIC',
                    ticketTypeIds,
                    ticketTypes: payload.ticketTypes,
                    ticketTypeName: payload.ticketTypeName,
                    reason: payload.reason,
                })
                const count = ticketTypeIds.length
                toast.info(count > 1
                    ? (isEnglish ? `Paused sales for ${count} selected ticket tiers.` : `Đã tạm dừng bán vé cho ${count} loại vé đã chọn.`)
                    : (isEnglish ? `Paused sales for tier "${payload.ticketTypeName || 'selected'}".` : `Đã tạm dừng bán vé cho hạng vé "${payload.ticketTypeName || 'đã chọn'}".`))
            } else if (payload.scope === 'SEATS') {
                if (payload.action === 'RESUME_SEATS') {
                    await resumeSalesOrganizerEvent(salesTarget.id, {
                        scope: 'SEATS',
                        sessionId: payload.sessionId,
                        seatIds: payload.seatIds,
                    })
                    toast.success(`Đã mở bán lại cho ${payload.seatIds?.length || 0} vị trí ghế đã chọn.`)
                } else {
                    await pauseSalesOrganizerEvent(salesTarget.id, {
                        scope: 'SEATS',
                        sessionId: payload.sessionId,
                        seatIds: payload.seatIds,
                        seatLabels: payload.seatLabels,
                        reason: payload.reason,
                    })
                    toast.info(`Đã tạm dừng bán vé cho ${payload.seatIds?.length || 0} vị trí ghế đã chọn.`)
                }
            } else if (salesTarget.sales_status === 'PAUSED' || payload.action === 'RESUME_ALL') {
                const res = await resumeSalesOrganizerEvent(salesTarget.id)
                if (res?.event?.sales_status === 'PAUSED' || (res?.remainingBlocks && res.remainingBlocks.length > 0)) {
                    toast.warning(res?.message || 'Không thể kích hoạt bán vé khi sự kiện đang bị ẩn. Vui lòng hiện lại sự kiện trước.')
                } else {
                    toast.success(`Đã mở bán lại vé cho "${salesTarget.title}".`)
                }
            } else {
                await pauseSalesOrganizerEvent(salesTarget.id, {
                    scope: 'ALL',
                    reason: payload.reason || '',
                })
                toast.info(`Đã tạm dừng bán vé cho "${salesTarget.title}".`)
            }
            setSalesTarget(null)
            await loadData()
        } catch (err) {
            console.error(err)
            toast.error(getApiMessage(err, 'Không thể thay đổi trạng thái bán vé.'))
        } finally {
            setSalesLoading(false)
        }
    }

    const openCancelModal = (ev) => {
        setCancelError(null)
        setCancelTarget(ev)
    }
    const closeCancelModal = () => !cancelLoading && setCancelTarget(null)
    const confirmCancel = async (payload) => {
        if (!cancelTarget || cancelLoading) return
        setCancelLoading(true)
        setCancelError(null)
        try {
            if (payload.is_request) {
                await submitCancellationRequest(cancelTarget.id, {
                    reason_code: payload.reason_code,
                    reason_note: payload.reason_note,
                    refund_mode: payload.refund_mode,
                    commitment_accepted: payload.commitment_accepted,
                })
                toast.success('Đã gửi yêu cầu hủy sự kiện tới Quản trị viên để xét duyệt.')
            } else {
                await cancelOrganizerEvent(cancelTarget.id, payload.reason)
                toast.success(`Đã hủy sự kiện "${cancelTarget.title}".`)
            }
            setCancelTarget(null)
            await loadData()
        } catch (err) {
            console.error(err)
            const msg = getApiMessage(err, 'Không thể thực hiện hủy sự kiện.')
            setCancelError(msg)
            toast.error(msg)
        } finally {
            setCancelLoading(false)
        }
    }

    const openWithdrawModal = (ev) => setWithdrawTarget(ev)
    const closeWithdrawModal = () => !withdrawLoading && setWithdrawTarget(null)
    const confirmWithdrawCancellationRequest = async () => {
        if (!withdrawTarget || withdrawLoading) return
        setWithdrawLoading(true)
        try {
            await withdrawCancellationRequest(withdrawTarget.id)
            toast.success(`Đã hoàn tác yêu cầu hủy sự kiện "${withdrawTarget.title}".`)
            setWithdrawTarget(null)
            await loadData()
        } catch (err) {
            console.error(err)
            toast.error(getApiMessage(err, 'Không thể hoàn tác yêu cầu hủy sự kiện.'))
        } finally {
            setWithdrawLoading(false)
        }
    }

    const openDeleteModal = (ev) => setDeleteTarget(ev)
    const closeDeleteModal = () => !deleteLoading && setDeleteTarget(null)
    const confirmDelete = async () => {
        if (!deleteTarget || deleteLoading) return
        setDeleteLoading(true)
        try {
            await deleteOrganizerDraftEvent(deleteTarget.id)
            setDeleteTarget(null)
            toast.success(`Đã xóa vĩnh viễn bản nháp "${deleteTarget.title}".`)
            navigate('/organizer/events')
        } catch (err) {
            console.error(err)
            toast.error(getApiMessage(err, 'Không thể xóa bản nháp sự kiện.'))
        } finally {
            setDeleteLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [loadData])

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        )
    }

    if (!event) {
        return (
            <div className="py-16 text-center">
                <h2 className="text-xl font-bold">Không tìm thấy sự kiện</h2>
                <Link to="/organizer/events" className="mt-4 inline-flex items-center gap-2 text-primary hover:underline">
                    <ArrowLeft className="size-4" />
                    Quay lại danh sách
                </Link>
            </div>
        )
    }

    const getAutoLocale = () =>
        ((typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
         (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en'))
            ? 'en-US'
            : 'vi-VN'

    const formatCurrency = (amount) =>
        new Intl.NumberFormat(getAutoLocale(), { style: 'currency', currency: 'VND' }).format(amount || 0)

    const formatDate = (iso) => {
        if (!iso) return '—'
        const isEn = getAutoLocale() === 'en-US'
        return new Date(iso).toLocaleDateString(getAutoLocale(), {
            day: '2-digit', month: isEn ? 'short' : '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
    }

    const isCancelPending = event.cancel_request?.status === 'PENDING'
    const isCancelled = event.status === 'CANCELLED'
    const isSuspended = event.display_state === 'SUSPENDED_BY_ADMIN'
    const ended = isEventEnded(event) || (event.status === 'COMPLETED' && event.approval_status !== 'APPROVED')
    const isPendingReview = event.status === 'PENDING_REVIEW'
    const canEdit = !isCancelPending && !isCancelled && !isSuspended && !ended

    const firstVenue =
        event.venue ||
        event.venues?.[0] ||
        event.sessions?.find((s) => s && s.venue)?.venue ||
        (typeof event.sessions?.[0]?.venue === 'object' ? event.sessions[0].venue : null)

    const venueName =
        event.venue_name ||
        (typeof event.venue === 'string' ? event.venue : event.venue?.name) ||
        firstVenue?.name ||
        ''

    const venueAddress =
        event.address ||
        (typeof event.address_line === 'string' ? event.address_line : null) ||
        firstVenue?.address_line ||
        [firstVenue?.address_line, firstVenue?.ward, firstVenue?.district, firstVenue?.city].filter(Boolean).join(', ')

    return (
        <OrganizerPage
            title={isEnglish ? 'Event Details' : 'Chi tiết sự kiện'}
            backLink="/organizer/events"
            backLabel={isEnglish ? 'Back' : 'Quay lại'}
            action={(
                <div className="flex flex-wrap items-center gap-2.5">
                    {canEdit && (
                        <Link
                            to={`/organizer/events/${event.id}/edit`}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-3.5 text-xs font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95"
                        >
                            <Pencil className="size-3.5" />
                            {isEnglish ? 'Edit Event' : 'Chỉnh sửa sự kiện'}
                        </Link>
                    )}
                    {isCancelPending ? (
                        <button
                            type="button"
                            onClick={() => openWithdrawModal(event)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3.5 text-xs font-bold text-amber-300 shadow-md transition hover:bg-amber-500/25 hover:border-amber-500/70 active:scale-95"
                            title={isEnglish ? 'Undo cancellation request' : 'Hoàn tác yêu cầu hủy sự kiện'}
                        >
                            <RotateCcw className="size-3.5" />
                            {isEnglish ? 'Undo cancellation' : 'Hoàn tác yêu cầu hủy'}
                        </button>
                    ) : (
                        <EventActionsDropdown
                            event={event}
                            variant="button"
                            label={isEnglish ? 'Actions' : 'Tác vụ'}
                            includeEdit={false}
                            onToggleHide={openHideModal}
                            onToggleSales={openSalesModal}
                            onWithdrawCancel={openWithdrawModal}
                            onCancel={openCancelModal}
                            onPublish={openPublishModal}
                            onDelete={openDeleteModal}
                        />
                    )}
                </div>
            )}
        >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Left column: Event info */}
                <div className="flex flex-col gap-6 lg:col-span-2">
                    <OrganizerPanel className="p-0 overflow-hidden">
                        <div className="relative h-48 w-full bg-panel-soft">
                            {event.thumbnail_url ? (
                                <img src={event.thumbnail_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center bg-tertiary/15 text-primary">
                                    <CalendarDays className="size-16 opacity-30" />
                                </div>
                            )}
                            <div className="absolute left-4 top-4">
                                <Badge tone={event.status === 'COMPLETED' && event.approval_status === 'APPROVED' ? 'green' : (STATUS_TONES[event.status] || 'gray')}>
                                    {event.status === 'COMPLETED' && event.approval_status === 'APPROVED' ? (isEnglish ? 'Approved' : 'Đã duyệt') : ((isEnglish ? STATUS_LABELS_EN : STATUS_LABELS_VI)[event.status] || event.status)}
                                </Badge>
                            </div>
                        </div>

                        <div className="p-6">
                            <h2 className="text-2xl font-extrabold text-content">{isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title}</h2>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <div className="flex items-start gap-3">
                                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-panel-soft">
                                        <Clock className="size-5 text-subtle" />
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-wider text-subtle">{isEnglish ? 'Time' : 'Thời gian'}</p>
                                        <p className="mt-1 text-sm font-semibold text-content">{formatDate(event.start_time)}</p>
                                        {event.end_time && (
                                            <p className="text-sm font-semibold text-content">{isEnglish ? 'to ' : 'đến '}{formatDate(event.end_time)}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-panel-soft">
                                        <MapPin className="size-5 text-subtle" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs uppercase tracking-wider text-subtle">{isEnglish ? 'Location' : 'Địa điểm'}</p>
                                        <p className="mt-1 text-sm font-semibold text-content">
                                            {venueName
                                                ? (isEnglish ? cleanAndFormatVenue(venueName, true) : venueName)
                                                : (firstVenue ? cleanAndFormatVenue(firstVenue, isEnglish) : (isEnglish ? 'Venue to be announced' : 'Địa điểm cập nhật sau'))}
                                        </p>
                                        {venueAddress && venueAddress !== venueName && (
                                            <p className="mt-0.5 text-xs text-subtle leading-relaxed">
                                                {isEnglish ? cleanAndFormatVenue(venueAddress, true) : venueAddress}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {event.description && (
                                <div className="mt-6 border-t border-border-soft/30 pt-6">
                                    <h3 className="mb-3 text-sm font-bold text-content">{isEnglish ? 'Event Description' : 'Mô tả sự kiện'}</h3>

                                    <div className="relative">
                                        <div
                                            className={`ql-editor ql-content description-html block max-w-full break-words text-sm text-content p-0 [&_*]:max-w-full [&_a]:break-words [&_a]:text-[#E6C17A] [&_a]:underline [&_table]:block [&_table]:overflow-x-auto transition-all duration-300 ${
                                                isDescriptionExpanded
                                                    ? 'overflow-visible'
                                                    : 'max-h-56 overflow-hidden'
                                            }`}
                                            dangerouslySetInnerHTML={{ __html: translateEventHtmlDescription(event.description, isEnglish) }}
                                        />

                                        {!isDescriptionExpanded && event.description.length > 250 && (
                                            <div
                                                onClick={() => setIsDescriptionExpanded(true)}
                                                className="absolute inset-x-0 bottom-0 flex h-24 cursor-pointer items-end justify-center bg-gradient-to-t from-[var(--color-panel,#0f172a)] via-[var(--color-panel,#0f172a)]/80 to-transparent pb-1"
                                            >
                                                <button
                                                    type="button"
                                                    aria-label="Xem thêm"
                                                    className="cursor-pointer text-[#E6C17A] hover:text-[#C99A47] transition-all hover:scale-110"
                                                >
                                                    <ChevronDown className="size-6" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {isDescriptionExpanded && event.description.length > 250 && (
                                        <div className="mt-2 flex justify-center">
                                            <button
                                                type="button"
                                                onClick={() => setIsDescriptionExpanded(false)}
                                                aria-label="Thu gọn"
                                                className="cursor-pointer text-[#E6C17A] hover:text-[#C99A47] transition-all hover:scale-110 p-1"
                                            >
                                                <ChevronUp className="size-6" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </OrganizerPanel>
                </div>

                {/* Right column: Stats + AI Demand Prediction */}
                <div className="flex flex-col gap-6">
                    <StatCard
                        icon={Wallet}
                        label={isEnglish ? 'Total Revenue' : 'Tổng doanh thu'}
                        value={formatCurrency(
                            revenueStats?.by_event?.[0]?.gross_revenue ||
                            revenueStats?.overall?.gross_revenue || 0
                        )}
                        accentColor="text-success"
                        accentBg="bg-success/15"
                    />

                    <StatCard
                        icon={Users}
                        label={isEnglish ? 'Checked In' : 'Đã check-in'}
                        value={`${checkinStats?.overall?.checked_in || 0} / ${checkinStats?.overall?.total_tickets || 0}`}
                        sub={isEnglish ? 'Attendees' : 'Khách tham dự'}
                        accentColor="text-primary"
                        accentBg="bg-primary/15"
                    />

                    {/* AI Demand Prediction */}
                    <DemandPredictionCard eventId={eventId} />

                    <OrganizerPanel>
                        <h3 className="font-bold text-content flex items-center gap-2">
                            <Ticket className="size-5 text-tertiary" /> {isEnglish ? 'Ticket Tiers Allocation' : 'Phân bổ hạng vé'}
                        </h3>
                        <div className="mt-4 space-y-3">
                            {event.sessions?.slice(0, 5).map((session) => (
                                <div key={session.id} className="border-b border-border-soft/20 pb-3 last:border-0 last:pb-0">
                                    <p className="text-sm font-semibold truncate" title={session.name}>{session.name}</p>
                                    <div className="mt-2 space-y-2 text-xs">
                                        {(session.ticket_types || []).map((tt) => {
                                            const isTtPaused = (event?.sales_blocks || []).some(
                                                (b) => !b.released_at && b.metadata?.scope === 'SPECIFIC' && String(b.metadata?.ticket_type_id) === String(tt.id)
                                            )
                                            return (
                                                <div key={tt.id} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-subtle">{tt.name}</span>
                                                        {isTtPaused && (
                                                            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                                                                {isEnglish ? 'Sales Paused' : 'Tạm dừng bán'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="font-semibold text-content">{formatCurrency(tt.price)}</span>
                                                </div>
                                            )
                                        })}
                                        {(!session.ticket_types || session.ticket_types.length === 0) && (
                                            <p className="text-subtle italic">{isEnglish ? 'No ticket tiers' : 'Chưa có hạng vé'}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {(!event.sessions || event.sessions.length === 0) && (
                                <p className="text-sm text-subtle text-center py-4">{isEnglish ? 'No event sessions' : 'Chưa có phiên sự kiện'}</p>
                            )}
                        </div>
                    </OrganizerPanel>

                    <div className="grid grid-cols-2 gap-4">
                        <Link
                            to={`/organizer/orders?eventId=${event.id}`}
                            className="flex items-center justify-center gap-2 rounded-xl border border-[#C99A47]/50 text-[#E6C17A] hover:bg-[#C99A47]/10 transition px-4 py-2 font-bold text-xs"
                        >
                            {isEnglish ? 'View Orders' : 'Xem đơn hàng'}
                        </Link>
                        <Link
                            to={`/organizer/attendees?eventId=${event.id}`}
                            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] hover:brightness-110 transition px-4 py-2 font-bold text-xs shadow-sm"
                        >
                            {isEnglish ? 'Attendee List' : 'Danh sách khách'}
                        </Link>
                    </div>
                </div>
            </div>

            {/* Action Modals */}
            {publishTarget && (
                <PublishConfirmModal
                    event={publishTarget}
                    onConfirm={confirmPublish}
                    onClose={closePublishModal}
                    loading={publishLoading}
                />
            )}
            {hideTarget && (
                <ToggleHideConfirmModal
                    event={hideTarget}
                    onConfirm={confirmToggleHide}
                    onClose={closeHideModal}
                    loading={hideLoading}
                />
            )}
            {salesTarget && (
                <ToggleSalesConfirmModal
                    event={salesTarget}
                    onConfirm={confirmToggleSales}
                    onClose={closeSalesModal}
                    loading={salesLoading}
                />
            )}
            {cancelTarget && (
                <CancelOrRequestCancelModal
                    event={cancelTarget}
                    onConfirm={confirmCancel}
                    onClose={closeCancelModal}
                    loading={cancelLoading}
                    error={cancelError}
                />
            )}
            {withdrawTarget && (
                <WithdrawCancelConfirmModal
                    event={withdrawTarget}
                    onConfirm={confirmWithdrawCancellationRequest}
                    onClose={closeWithdrawModal}
                    loading={withdrawLoading}
                />
            )}
            {deleteTarget && (
                <DeleteDraftConfirmModal
                    event={deleteTarget}
                    onConfirm={confirmDelete}
                    onClose={closeDeleteModal}
                    loading={deleteLoading}
                />
            )}
        </OrganizerPage>
    )
}
