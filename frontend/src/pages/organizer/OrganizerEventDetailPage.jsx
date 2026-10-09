import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
    fetchOrganizerEvent,
    fetchDemandPrediction,
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
} from 'lucide-react'
import '@/components/RichTextEditor.css'

const STATUS_LABELS = {
    DRAFT: 'Bản nháp',
    PENDING_REVIEW: 'Chờ duyệt',
    PUBLISHED: 'Đã xuất bản',
    HIDDEN: 'Đã ẩn',
    CANCELLED: 'Đã hủy',
    COMPLETED: 'Đã kết thúc',
}

const STATUS_TONES = {
    DRAFT: 'gray',
    PENDING_REVIEW: 'amber',
    PUBLISHED: 'green',
    HIDDEN: 'gray',
    CANCELLED: 'gray',
    COMPLETED: 'green',
}

function DemandPredictionCard({ eventId }) {
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
                    <h3 className="font-bold text-content">AI Dự báo nhu cầu</h3>
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
    const demandLabel = isHigh ? 'Nhu cầu cao' : sellOutPct >= 40 ? 'Nhu cầu trung bình' : 'Nhu cầu thấp'

    return (
        <OrganizerPanel>
            <div className="flex items-center gap-2 mb-4">
                <Sparkles className="size-5 text-primary" />
                <h3 className="font-bold text-content">AI Dự báo nhu cầu</h3>
                <span className="ml-auto text-xs text-subtle">{prediction.model_version}</span>
            </div>

            {/* Demand label badge */}
            <div className={`flex items-center gap-3 rounded-xl border p-3 ${demandBg}`}>
                <DemandIcon className={`size-6 ${demandColor}`} />
                <div>
                    <p className={`font-bold ${demandColor}`}>{demandLabel}</p>
                    <p className="text-xs text-subtle">Dự báo từ AI EventHub</p>
                </div>
            </div>

            {/* Metrics */}
            <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-panel-soft p-3 text-center">
                    <p className="text-2xl font-extrabold text-content">{score}%</p>
                    <p className="text-xs text-subtle mt-1">Điểm nhu cầu</p>
                </div>
                <div className="rounded-xl bg-panel-soft p-3 text-center">
                    <p className="text-2xl font-extrabold text-content">{sellOutPct}%</p>
                    <p className="text-xs text-subtle mt-1">Xác suất hết vé</p>
                </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
                <div className="flex justify-between text-xs text-subtle mb-1">
                    <span>Xác suất hết vé</span>
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
                * Dự báo dựa trên mô hình AI được training từ dữ liệu lịch sử EventHub.
            </p>
        </OrganizerPanel>
    )
}

export function OrganizerEventDetailPage() {
    const { eventId } = useParams()
    const toast = useToast()

    const [event, setEvent] = useState(null)
    const [loading, setLoading] = useState(true)
    const [checkinStats, setCheckinStats] = useState(null)
    const [revenueStats, setRevenueStats] = useState(null)
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

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

    const formatCurrency = (amount) =>
        new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0)

    const formatDate = (iso) => {
        if (!iso) return '—'
        return new Date(iso).toLocaleDateString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
    }

    return (
        <OrganizerPage
            title="Chi tiết sự kiện"
            backLink="/organizer/events"
            backLabel="Quay lại"
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
                                <Badge tone={STATUS_TONES[event.status] || 'gray'}>
                                    {STATUS_LABELS[event.status] || event.status}
                                </Badge>
                            </div>
                        </div>

                        <div className="p-6">
                            <h2 className="text-2xl font-extrabold text-content">{event.title}</h2>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <div className="flex items-start gap-3">
                                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-panel-soft">
                                        <Clock className="size-5 text-subtle" />
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-wider text-subtle">Thời gian</p>
                                        <p className="mt-1 text-sm font-semibold text-content">{formatDate(event.start_time)}</p>
                                        {event.end_time && (
                                            <p className="text-sm font-semibold text-content">đến {formatDate(event.end_time)}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-panel-soft">
                                        <MapPin className="size-5 text-subtle" />
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-wider text-subtle">Địa điểm</p>
                                        <p className="mt-1 text-sm font-semibold text-content">
                                            {event.format === 'ONLINE' ? 'Sự kiện trực tuyến' : event.venue_name || 'Đang cập nhật'}
                                        </p>
                                        {event.address && (
                                            <p className="text-sm font-semibold text-content">{event.address}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {event.description && (
                                <div className="mt-6 border-t border-border-soft/30 pt-6">
                                    <h3 className="mb-3 text-sm font-bold text-content">Mô tả sự kiện</h3>

                                    <div className="relative">
                                        <div
                                            className={`ql-editor ql-content description-html block max-w-full break-words text-sm text-subtle p-0 [&_*]:max-w-full [&_a]:break-words [&_a]:text-[#E6C17A] [&_a]:underline [&_table]:block [&_table]:overflow-x-auto transition-all duration-300 ${
                                                isDescriptionExpanded
                                                    ? 'overflow-visible'
                                                    : 'max-h-56 overflow-hidden'
                                            }`}
                                            dangerouslySetInnerHTML={{ __html: event.description }}
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
                        label="Tổng doanh thu"
                        value={formatCurrency(
                            revenueStats?.by_event?.[0]?.gross_revenue ||
                            revenueStats?.overall?.gross_revenue || 0
                        )}
                        accentColor="text-success"
                        accentBg="bg-success/15"
                    />

                    <StatCard
                        icon={Users}
                        label="Đã check-in"
                        value={`${checkinStats?.overall?.checked_in || 0} / ${checkinStats?.overall?.total_tickets || 0}`}
                        sub="Khách tham dự"
                        accentColor="text-primary"
                        accentBg="bg-primary/15"
                    />

                    {/* AI Demand Prediction */}
                    <DemandPredictionCard eventId={eventId} />

                    <OrganizerPanel>
                        <h3 className="font-bold text-content flex items-center gap-2">
                            <Ticket className="size-5 text-tertiary" /> Phân bổ hạng vé
                        </h3>
                        <div className="mt-4 space-y-3">
                            {event.sessions?.slice(0, 5).map((session) => (
                                <div key={session.id} className="border-b border-border-soft/20 pb-3 last:border-0 last:pb-0">
                                    <p className="text-sm font-semibold truncate" title={session.name}>{session.name}</p>
                                    <div className="mt-2 space-y-2 text-xs">
                                        {(session.ticket_types || []).map((tt) => (
                                            <div key={tt.id} className="flex items-center justify-between">
                                                <span className="text-subtle">{tt.name}</span>
                                                <span className="font-semibold text-content">{formatCurrency(tt.price)}</span>
                                            </div>
                                        ))}
                                        {(!session.ticket_types || session.ticket_types.length === 0) && (
                                            <p className="text-subtle italic">Chưa có hạng vé</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {(!event.sessions || event.sessions.length === 0) && (
                                <p className="text-sm text-subtle text-center py-4">Chưa có phiên sự kiện</p>
                            )}
                        </div>
                    </OrganizerPanel>

                    <div className="grid grid-cols-2 gap-4">
                        <Link
                            to={`/organizer/orders?eventId=${event.id}`}
                            className="flex items-center justify-center gap-2 rounded-xl border border-[#C99A47]/50 text-[#E6C17A] hover:bg-[#C99A47]/10 transition px-4 py-2 font-bold text-xs"
                        >
                            Xem đơn hàng
                        </Link>
                        <Link
                            to={`/organizer/attendees?eventId=${event.id}`}
                            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] hover:brightness-110 transition px-4 py-2 font-bold text-xs shadow-sm"
                        >
                            Danh sách khách
                        </Link>
                    </div>
                </div>
            </div>
        </OrganizerPage>
    )
}
