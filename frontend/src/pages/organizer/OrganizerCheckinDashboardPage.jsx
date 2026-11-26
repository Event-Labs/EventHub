import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  DoorOpen,
  History,
  Loader2,
  PieChart,
  RefreshCw,
  Ticket,
  TicketCheck,
  TrendingUp,
  UserCheck,
} from 'lucide-react'
import { fetchOrganizerEvents } from '@/services/organizerEvents.js'
import { fetchCheckinStats, fetchEventCheckinHistory } from '@/services/organizerOrders.js'
import { Badge, OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'
import { OrganizerEventPicker } from './OrganizerEventPicker.jsx'
import { CheckinKpiCards } from './checkin/CheckinKpiCards.jsx'
import { SessionStackedBarChart } from './checkin/SessionStackedBarChart.jsx'
import { OverallDonutChart } from './checkin/OverallDonutChart.jsx'
import { TicketTypeStackedBarChart } from './checkin/TicketTypeStackedBarChart.jsx'
import { CheckinTrendLineChart } from './checkin/CheckinTrendLineChart.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getScanResultMeta(result, resultMessage, isEnglish) {
  const code = String(result || 'OK').toUpperCase()
  if (code === 'OK') {
    return {
      label: isEnglish ? 'Checked in' : 'Đã check-in',
      badgeClass: 'border-emerald-400/35 bg-emerald-500/15 text-emerald-300 [html.light_&]:text-emerald-700',
    }
  }
  if (code === 'VERIFIED') {
    return {
      label: isEnglish ? 'Verified only' : 'Chỉ xác thực',
      badgeClass: 'border-amber-400/35 bg-amber-500/15 text-amber-300 [html.light_&]:text-amber-700',
    }
  }
  const errorMap = {
    USED: isEnglish ? 'Already used' : 'Vé đã dùng',
    NOT_FOUND: isEnglish ? 'Not found' : 'Không tìm thấy',
    WRONG_EVENT: isEnglish ? 'Wrong event' : 'Sai sự kiện',
    INVALID_QR: isEnglish ? 'Invalid QR' : 'QR không hợp lệ',
    NOT_OPEN: isEnglish ? 'Not open yet' : 'Chưa đến giờ',
    EXPIRED: isEnglish ? 'Expired' : 'Đã hết hạn',
    REFUND_IN_PROGRESS: isEnglish ? 'Refunding' : 'Đang hoàn tiền',
    INVALID_ORDER: isEnglish ? 'Unpaid order' : 'Chưa thanh toán',
    FORBIDDEN: isEnglish ? 'Forbidden' : 'Không được phép',
    INVALID: isEnglish ? 'Invalid' : 'Không hợp lệ',
    CANCELLED: isEnglish ? 'Cancelled' : 'Đã hủy',
  }
  return {
    label: errorMap[code] || resultMessage || code,
    badgeClass: 'border-rose-400/35 bg-rose-500/15 text-rose-300 [html.light_&]:text-rose-700',
  }
}

function buildPaginationPages(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1)
  }
  const pages = [1]
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)
  if (start > 2) pages.push('ellipsis-left')
  for (let p = start; p <= end; p += 1) pages.push(p)
  if (end < totalPages - 1) pages.push('ellipsis-right')
  pages.push(totalPages)
  return pages
}

function OrganizerCheckinHistoryPanel({ eventId }) {
  const { isEnglish } = useLanguage()
  const [data, setData] = useState({
    gates: [],
    items: [],
    counts: { all: 0, staff: 0, iot: 0 },
    pagination: { page: 1, limit: 10, total: 0, total_pages: 1, has_more: false },
  })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [resultFilter, setResultFilter] = useState('OK')
  const [sourceFilter, setSourceFilter] = useState('ALL')
  const [gateId, setGateId] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setGateId('')
    setPage(1)
    setLoading(true)
  }, [eventId])

  const loadHistory = useCallback(async (manual = false) => {
    if (!eventId) return
    if (manual) setRefreshing(true)
    try {
      const res = await fetchEventCheckinHistory(eventId, {
        page,
        limit: pageSize,
        result: resultFilter,
        source: sourceFilter,
        ...(gateId ? { gate_id: gateId } : {}),
      })
      if (res) {
        const items = Array.isArray(res.items) ? res.items : []
        const pagination = res.pagination || {
          page,
          limit: pageSize,
          total: items.length,
          total_pages: 1,
          has_more: false,
        }
        const counts = res.counts || {
          all: pagination.total ?? items.length,
          staff: items.filter((i) => i.source !== 'IOT').length,
          iot: items.filter((i) => i.source === 'IOT').length,
        }
        setData({
          gates: Array.isArray(res.gates) ? res.gates : [],
          items,
          counts,
          pagination,
        })
        if (pagination.total_pages && page > pagination.total_pages) {
          setPage(pagination.total_pages)
        }
      }
    } catch {
      // Keep last known history silently on background poll
    } finally {
      setLoading(false)
      if (manual) setRefreshing(false)
    }
  }, [eventId, page, pageSize, resultFilter, sourceFilter, gateId])

  useEffect(() => {
    if (!eventId) return undefined
    loadHistory(false)
    const timer = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        loadHistory(false)
      }
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [eventId, loadHistory])

  const handleChangeResultFilter = (next) => {
    if (next === resultFilter) return
    setResultFilter(next)
    setPage(1)
  }

  const handleChangeSourceFilter = (next) => {
    if (next === sourceFilter) return
    setSourceFilter(next)
    setPage(1)
  }

  const handleChangeGate = (nextGateId) => {
    if (nextGateId === gateId) return
    setGateId(nextGateId)
    setPage(1)
  }

  const handleChangePageSize = (nextSize) => {
    const parsed = Number(nextSize) || 10
    if (parsed === pageSize) return
    setPageSize(parsed)
    setPage(1)
  }

  const items = data.items || []
  const gates = data.gates || []
  const totalCount = data.pagination?.total ?? items.length
  const totalPages = Math.max(1, data.pagination?.total_pages || Math.ceil(totalCount / pageSize) || 1)
  const allCount = data.counts?.all ?? totalCount
  const staffCount = data.counts?.staff ?? 0
  const iotCount = data.counts?.iot ?? 0
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = totalCount === 0 ? 0 : Math.min(totalCount, (page - 1) * pageSize + items.length)
  const pageNumbers = useMemo(() => buildPaginationPages(page, totalPages), [page, totalPages])

  return (
    <OrganizerPanel>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <History className="size-5 text-[#E6C17A]" />
          <h2 className="font-bold text-content text-base">
            {isEnglish ? 'Check-in & Scan History' : 'Lịch sử soát vé & check-in'}
          </h2>
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">
            {totalCount}{' '}
            {resultFilter === 'ALL'
              ? (isEnglish ? 'scans' : 'lượt quét')
              : (isEnglish ? 'tickets' : 'vé')}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {gates.length > 0 && (
            <select
              value={gateId}
              onChange={(e) => handleChangeGate(e.target.value)}
              className="rounded-lg border border-white/15 [html.light_&]:border-slate-300 bg-[#121b33] [html.light_&]:bg-white px-2.5 py-1.5 text-xs font-semibold text-content outline-none focus:border-primary"
              aria-label={isEnglish ? 'Filter by gate' : 'Lọc theo cổng'}
            >
              <option value="">{isEnglish ? 'All gates' : 'Tất cả cổng'}</option>
              {gates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}

          <div className="inline-flex rounded-lg border border-white/15 [html.light_&]:border-slate-300 bg-[#121b33] [html.light_&]:bg-slate-100 p-0.5 text-[11px] font-bold">
            {[
              { id: 'OK', label: isEnglish ? 'Checked-in (OK)' : 'Đã check-in (OK)' },
              { id: 'ALL', label: isEnglish ? 'All scans' : 'Tất cả lượt quét' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleChangeResultFilter(tab.id)}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  resultFilter === tab.id
                    ? 'bg-emerald-400 text-slate-950 font-extrabold'
                    : 'text-slate-400 hover:text-white [html.light_&]:text-slate-600 [html.light_&]:hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-lg border border-white/15 [html.light_&]:border-slate-300 bg-[#121b33] [html.light_&]:bg-slate-100 p-0.5 text-[11px] font-bold">
            {[
              { id: 'ALL', label: `${isEnglish ? 'All' : 'Tất cả'} (${allCount})` },
              { id: 'STAFF', label: `Staff (${staffCount})` },
              { id: 'IOT', label: `IoT (${iotCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleChangeSourceFilter(tab.id)}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  sourceFilter === tab.id
                    ? 'bg-primary text-slate-950 font-extrabold'
                    : 'text-slate-400 hover:text-white [html.light_&]:text-slate-600 [html.light_&]:hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => loadHistory(true)}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/15 [html.light_&]:border-slate-300 bg-[#121b33] [html.light_&]:bg-white text-slate-400 hover:border-primary/60 hover:text-primary transition-colors"
            title={isEnglish ? 'Refresh history' : 'Làm mới lịch sử'}
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>{isEnglish ? 'Loading check-in history...' : 'Đang tải lịch sử soát vé từ cơ sở dữ liệu...'}</span>
        </div>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          {isEnglish
            ? 'No check-in or scan records found for the current filters.'
            : 'Chưa có lượt soát vé nào phù hợp với bộ lọc hiện tại.'}
        </p>
      ) : (
        <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 [html.light_&]:border-slate-200 bg-[#121b33] [html.light_&]:bg-white">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[820px] text-xs">
              <thead className="border-b border-white/10 [html.light_&]:border-slate-200 bg-[#172242] [html.light_&]:bg-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">{isEnglish ? 'Time' : 'Thời gian'}</th>
                  <th className="px-4 py-3 text-left">{isEnglish ? 'Attendee' : 'Người tham dự'}</th>
                  <th className="px-4 py-3 text-left">{isEnglish ? 'Ticket Code' : 'Mã vé'}</th>
                  <th className="px-4 py-3 text-left">{isEnglish ? 'Tier / Seat / Session' : 'Hạng vé / Ghế / Phiên'}</th>
                  <th className="px-4 py-3 text-left">{isEnglish ? 'Gate' : 'Cổng'}</th>
                  <th className="px-4 py-3 text-left">{isEnglish ? 'Source' : 'Nguồn check-in'}</th>
                  <th className="px-4 py-3 text-left">{isEnglish ? 'Status' : 'Trạng thái'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 [html.light_&]:divide-slate-100 font-medium text-slate-300 [html.light_&]:text-slate-700">
                {items.map((c) => {
                  const isIot = c.source === 'IOT'
                  const resultMeta = getScanResultMeta(c.result, c.result_message, isEnglish)
                  const tierAndSeat = [c.ticket_type_name, c.seat_label ? `Ghế ${c.seat_label}` : null]
                    .filter(Boolean)
                    .join(' • ')
                  return (
                    <tr
                      key={`${c.source}-${c.id}-${c.result || 'OK'}`}
                      className={`transition-colors ${
                        isIot
                          ? 'bg-cyan-500/[0.04] hover:bg-cyan-500/[0.08] [html.light_&]:bg-sky-50/40 [html.light_&]:hover:bg-sky-50'
                          : 'hover:bg-white/[0.02] [html.light_&]:hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-slate-300 [html.light_&]:text-slate-600 font-mono">
                          <Clock className="size-3 text-slate-400" />
                          {fmtDateTime(c.checked_in_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-white [html.light_&]:text-[#0D1B2A]">
                          {c.attendee_name || '—'}
                        </p>
                        {c.attendee_email && (
                          <p className="text-[11px] text-slate-400">{c.attendee_email}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-[#E6C17A] [html.light_&]:text-amber-700 whitespace-nowrap">
                        {c.ticket_code || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {tierAndSeat ? (
                          <Badge tone="blue">{tierAndSeat}</Badge>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {c.session_name && (
                          <p className="mt-1 text-[11px] text-slate-400">{c.session_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {c.gate_name ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2.5 py-0.5 text-[11px] font-bold text-purple-300 [html.light_&]:text-purple-700">
                            <DoorOpen className="size-3" />
                            {c.gate_name}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isIot ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/35 bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-bold text-cyan-300 [html.light_&]:text-cyan-700">
                            <Cpu className="size-3" />
                            IoT • {c.actor_name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 [html.light_&]:text-emerald-700">
                            <UserCheck className="size-3" />
                            Staff • {c.actor_name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${resultMeta.badgeClass}`}
                          title={c.result_message || resultMeta.label}
                        >
                          {resultMeta.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 [html.light_&]:border-slate-200 pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-400">
            <span>
              {isEnglish
                ? `Showing ${rangeStart}–${rangeEnd} of ${totalCount}`
                : `Hiển thị ${rangeStart}–${rangeEnd} / ${totalCount}`}
            </span>
            <select
              value={pageSize}
              onChange={(e) => handleChangePageSize(e.target.value)}
              className="rounded-lg border border-white/15 [html.light_&]:border-slate-300 bg-[#121b33] [html.light_&]:bg-white px-2 py-1 text-xs font-semibold text-content outline-none focus:border-primary"
              aria-label={isEnglish ? 'Rows per page' : 'Số dòng mỗi trang'}
            >
              {[10, 20, 50].map((size) => (
                <option key={size} value={size} className="bg-[#0f172a] text-white">
                  {size} / {isEnglish ? 'page' : 'trang'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 [html.light_&]:border-slate-300 bg-[#121b33] [html.light_&]:bg-white px-2.5 py-1 font-semibold text-content transition-colors hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" />
              <span>{isEnglish ? 'Prev' : 'Trước'}</span>
            </button>

            {pageNumbers.map((p) =>
              typeof p === 'string' ? (
                <span key={p} className="px-1.5 text-slate-400">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`min-w-7 rounded-lg px-2 py-1 font-bold transition-colors ${
                    p === page
                      ? 'bg-primary text-slate-950'
                      : 'border border-white/15 [html.light_&]:border-slate-300 bg-[#121b33] [html.light_&]:bg-white text-slate-400 hover:border-primary/50 hover:text-white [html.light_&]:hover:text-slate-900'
                  }`}
                >
                  {p}
                </button>
              ),
            )}

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 [html.light_&]:border-slate-300 bg-[#121b33] [html.light_&]:bg-white px-2.5 py-1 font-semibold text-content transition-colors hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>{isEnglish ? 'Next' : 'Sau'}</span>
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </OrganizerPanel>
  )
}

export function OrganizerCheckinDashboardPage() {
  const { isEnglish } = useLanguage()
  const [searchParams] = useSearchParams()
  const initialEventId = searchParams.get('eventId') || ''

  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState(initialEventId)

  const [stats, setStats] = useState(null)
  const [initialLoading, setInitialLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('connected') // 'connected' | 'reconnecting' | 'error'
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)
  const isFetchingRef = useRef(false)

  // 1. Load active events list for organizer
  useEffect(() => {
    setEventsLoading(true)
    fetchOrganizerEvents()
      .then((data) => {
        const active = (data || []).filter(
          (e) =>
            ['PUBLISHED', 'COMPLETED', 'CANCELLED'].includes(e.status) ||
            Number(e.paid_orders_count || 0) > 0 ||
            (e.status !== 'DRAFT' && e.status !== 'PENDING_REVIEW')
        )
        setEvents(active)
        if (initialEventId && active.some((ev) => ev.id === initialEventId)) {
          setSelectedEventId(initialEventId)
        } else if (active.length > 0) {
          setSelectedEventId(active[0].id)
        }
      })
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [initialEventId])

  // 2. Fetch stats function (with background poll support & overlap lock)
  const loadStats = useCallback(
    async (isManual = false) => {
      if (!selectedEventId || isFetchingRef.current) return

      isFetchingRef.current = true
      if (isManual) {
        setIsRefreshing(true)
      }

      try {
        const data = await fetchCheckinStats(selectedEventId)
        setStats(data)
        setLastRefresh(new Date())
        setConnectionStatus('connected')
        setError('')
      } catch (err) {
        setConnectionStatus('reconnecting')
        setError((prev) => prev || err.response?.data?.message || 'Không thể tải dữ liệu check-in.')
      } finally {
        isFetchingRef.current = false
        setIsRefreshing(false)
        setInitialLoading(false)
      }
    },
    [selectedEventId]
  )

  // 3. Reset and load on event change
  useEffect(() => {
    if (!selectedEventId) return
    setStats(null)
    setInitialLoading(true)
    setError('')
    loadStats(true)
  }, [selectedEventId, loadStats])

  // 4. Polling timer every 6 seconds for Real-time Analytics (paused if tab is hidden)
  useEffect(() => {
    if (!selectedEventId) return
    const timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        loadStats(false)
      }
    }, 6_000)

    return () => clearInterval(timer)
  }, [selectedEventId, loadStats])

  const overall = stats?.overall ?? { total_tickets: 0, checked_in: 0, valid: 0, cancelled: 0, checkin_rate: 0 }
  const bySession = stats?.by_session ?? []
  const byTicketType = stats?.by_ticket_type ?? []
  const timeline = stats?.checkin_timeline ?? []

  return (
    <OrganizerPage
      title={isEnglish ? 'Check-in Monitoring' : 'Theo dõi Check-in'}
    >
      {/* ── ROW 1: HEADER CONTROLS & REAL-TIME STATUS ── */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-white/10 [html.light_&]:border-slate-200 pb-5">
        {/* Left: Event selector */}
        <div className="w-full lg:max-w-xl">
          {eventsLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="size-4 animate-spin text-primary" /> {isEnglish ? 'Loading events list...' : 'Đang tải danh sách sự kiện...'}
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-slate-400">{isEnglish ? 'No events found in the system.' : 'Chưa có sự kiện nào trong hệ thống.'}</p>
          ) : (
            <OrganizerEventPicker
              events={events}
              selectedEventId={selectedEventId}
              onSelectEvent={setSelectedEventId}
              loading={eventsLoading}
              label={isEnglish ? 'Select event to monitor' : 'Chọn sự kiện theo dõi'}
              allowAll={false}
              showCalendarIcon={false}
              placeholder={isEnglish ? 'Select an event to monitor check-in...' : 'Chọn sự kiện để theo dõi check-in...'}
            />
          )}
        </div>

        {/* Right: Real-time Connection Status */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 self-start lg:self-center">
          {connectionStatus === 'connected' ? (
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span>{isEnglish ? 'Live Updates' : 'Cập nhật trực tiếp'}</span>
              <span className="text-emerald-500/40">|</span>
              <span className="text-slate-300 font-normal">
                {lastRefresh ? lastRefresh.toLocaleTimeString(isEnglish ? 'en-US' : 'vi-VN') : '—'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-400">
              <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
              <span>{isEnglish ? 'Reconnecting...' : 'Đang kết nối lại...'}</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {initialLoading && !stats ? (
        <OrganizerPanel className="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 className="size-10 animate-spin text-primary mb-3" />
          <p className="text-sm font-semibold text-white">{isEnglish ? 'Aggregating real-time check-in metrics...' : 'Đang tổng hợp số liệu check-in thời gian thực...'}</p>
        </OrganizerPanel>
      ) : stats ? (
        <div className="space-y-6">
          {/* ── ROW 2: KPI SUMMARY CARDS ── */}
          <CheckinKpiCards overall={overall} />

          {/* ── ROW 3: MAIN CHARTS (SESSION & OVERALL DONUT) ── */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Left: Check-in by Session (7 Cols) */}
            <div className="xl:col-span-7">
              <OrganizerPanel className="h-full">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="size-5 text-[#E6C17A]" />
                    <h2 className="font-bold text-content text-base">{isEnglish ? 'Check-in by Session' : 'Check-in theo phiên'}</h2>
                  </div>
                  <span className="text-xs text-slate-400">{bySession.length} {isEnglish ? 'sessions' : 'phiên'}</span>
                </div>
                <SessionStackedBarChart data={bySession} />
              </OrganizerPanel>
            </div>

            {/* Right: Overall Check-in Doughnut (5 Cols) */}
            <div className="xl:col-span-5">
              <OrganizerPanel className="h-full flex flex-col justify-between">
                <div className="mb-2 flex items-center gap-2">
                  <PieChart className="size-5 text-[#E6C17A]" />
                  <h2 className="font-bold text-content text-base">{isEnglish ? 'Overall Event Check-in' : 'Tổng thể check-in sự kiện'}</h2>
                </div>
                <div className="my-auto py-2">
                  <OverallDonutChart overall={overall} />
                </div>
              </OrganizerPanel>
            </div>
          </div>

          {/* ── ROW 4: TICKET ANALYTICS (CHECK-IN BY TICKET TYPE) ── */}
          <OrganizerPanel>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ticket className="size-5 text-[#E6C17A]" />
                <h2 className="font-bold text-content text-base">{isEnglish ? 'Check-in by Ticket Tier' : 'Check-in theo hạng vé'}</h2>
              </div>
              <span className="text-xs text-slate-400">{byTicketType.length} {isEnglish ? 'ticket tiers' : 'hạng vé'}</span>
            </div>
            <TicketTypeStackedBarChart data={byTicketType} />
          </OrganizerPanel>

          {/* ── ROW 5: CHECK-IN TREND (OVER TIME) ── */}
          <OrganizerPanel>
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="size-5 text-[#E6C17A]" />
              <h2 className="font-bold text-content text-base">{isEnglish ? 'Check-in Trend Over Time' : 'Xu hướng check-in theo thời gian'}</h2>
            </div>
            <CheckinTrendLineChart timeline={timeline} />
          </OrganizerPanel>

          {/* ── ROW 6: SYNCED CHECK-IN & SCAN HISTORY (PAGINATED) ── */}
          <OrganizerCheckinHistoryPanel eventId={selectedEventId} />

          {/* Empty state when 0 total tickets sold */}
          {overall.total_tickets === 0 && (
            <OrganizerPanel className="py-14 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-[#C99A47]/30 bg-[#C99A47]/10 text-[#E6C17A] shadow-[0_0_20px_rgba(201,154,71,0.15)] mb-3">
                <TicketCheck className="size-6 text-[#E6C17A]" />
              </div>
              <h3 className="text-base font-bold text-content">{isEnglish ? 'No tickets have been sold for this event yet' : 'Sự kiện này chưa có vé nào được bán'}</h3>
              <p className="mt-1 text-sm text-subtle">
                {isEnglish ? 'Check-in data will appear automatically once orders are successfully paid.' : 'Dữ liệu check-in sẽ xuất hiện tự động khi có đơn hàng được thanh toán thành công.'}
              </p>
            </OrganizerPanel>
          )}
        </div>
      ) : null}
    </OrganizerPage>
  )
}
