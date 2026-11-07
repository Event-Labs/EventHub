import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  PieChart,
  ScanLine,
  TicketCheck,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react'
import { fetchOrganizerEvents } from '@/services/organizerEvents.js'
import { fetchCheckinStats } from '@/services/organizerOrders.js'
import { Badge, OrganizerPage, OrganizerPanel, StatCard } from './OrganizerComponents.jsx'
import { OrganizerEventPicker } from './OrganizerEventPicker.jsx'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function fmtCurrency(n) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(n) || 0)
}

const TICKET_PALETTE = [
  { stroke: '#10B981', bg: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  { stroke: '#06B6D4', bg: 'bg-cyan-500', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  { stroke: '#E6C17A', bg: 'bg-amber-400', text: 'text-amber-400', border: 'border-amber-400/30' },
  { stroke: '#A855F7', bg: 'bg-purple-500', text: 'text-purple-400', border: 'border-purple-500/30' },
  { stroke: '#EC4899', bg: 'bg-pink-500', text: 'text-pink-400', border: 'border-pink-500/30' },
  { stroke: '#3B82F6', bg: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500/30' },
]

// ─── Sub-components: Biểu đồ Check-in theo Phiên ───────────────────────────────

function SessionCheckinChart({ data = [] }) {
  const [hoveredId, setHoveredId] = useState(null)
  const [viewMode, setViewMode] = useState('chart') // 'chart' | 'table'

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-subtle">
        <Clock className="size-8 opacity-40 mb-2" />
        <p className="text-sm">Chưa có dữ liệu phiên cho sự kiện này.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Legend & Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 [html.light_&]:border-slate-200 pb-3">
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-slate-300 [html.light_&]:text-[#1B365D]">
            <span className="size-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            Đã check-in
          </span>
          <span className="flex items-center gap-1.5 text-slate-300 [html.light_&]:text-[#1B365D]">
            <span className="size-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
            Chưa check-in
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-panel-soft/60 [html.light_&]:bg-slate-100 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-bold transition ${
              viewMode === 'chart'
                ? 'bg-primary text-[#0D1B2A] shadow-sm'
                : 'text-subtle hover:text-white [html.light_&]:hover:text-[#0D1B2A]'
            }`}
          >
            <BarChart3 className="size-3.5" />
            Biểu đồ
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`rounded-md px-2.5 py-1 font-bold transition ${
              viewMode === 'table'
                ? 'bg-primary text-[#0D1B2A] shadow-sm'
                : 'text-subtle hover:text-white [html.light_&]:hover:text-[#0D1B2A]'
            }`}
          >
            Bảng
          </button>
        </div>
      </div>

      {viewMode === 'chart' ? (
        <div className="space-y-4">
          {data.map((s, idx) => {
            const total = Number(s.total_tickets) || 0
            const checked = Number(s.checked_in) || 0
            const valid = Number(s.valid) || 0
            const rate = Number(s.checkin_rate) || 0
            const isHovered = hoveredId === s.session_id

            return (
              <div
                key={s.session_id || idx}
                onMouseEnter={() => setHoveredId(s.session_id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`group relative rounded-xl border p-4 transition-all duration-200 ${
                  isHovered
                    ? 'border-emerald-500/40 bg-[#142347]/80 [html.light_&]:bg-[#f0f9ff] [html.light_&]:border-emerald-500/60 shadow-[0_4px_20px_rgba(16,185,129,0.15)]'
                    : 'border-white/10 bg-[#0d172e]/60 [html.light_&]:bg-white [html.light_&]:border-slate-200 hover:border-white/20'
                }`}
              >
                {/* Header row of session */}
                <div className="mb-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                      {s.session_name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 [html.light_&]:text-[#536b88]">
                      {fmtDate(s.start_time)} · {s.venue_name || 'Tại địa điểm'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs font-semibold text-slate-300 [html.light_&]:text-[#1B365D]">
                      {checked}/{total} vé
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-black tracking-wide border ${
                        rate >= 80
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 [html.light_&]:text-emerald-700'
                          : rate >= 50
                            ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 [html.light_&]:text-cyan-700'
                            : 'bg-amber-500/20 text-amber-400 border-amber-500/40 [html.light_&]:text-amber-700'
                      }`}
                    >
                      {rate}%
                    </span>
                  </div>
                </div>

                {/* Stacked Comparative Bar */}
                <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-800/80 [html.light_&]:bg-slate-200 p-0.5 shadow-inner">
                  {total > 0 ? (
                    <div className="flex h-full w-full overflow-hidden rounded-full">
                      {checked > 0 && (
                        <div
                          style={{ width: `${Math.min((checked / total) * 100, 100)}%` }}
                          className="h-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400 transition-all duration-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                          title={`Đã check-in: ${checked} vé`}
                        />
                      )}
                      {valid > 0 && (
                        <div
                          style={{ width: `${Math.min((valid / total) * 100, 100 - (checked / total) * 100)}%` }}
                          className="h-full bg-gradient-to-r from-amber-600/80 to-amber-500/80 transition-all duration-500"
                          title={`Chưa check-in: ${valid} vé`}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="h-full w-full bg-slate-700/40 rounded-full" />
                  )}
                </div>

                {/* Sub-metrics breakdown */}
                <div className="mt-2.5 flex items-center justify-between text-[11.5px] text-slate-400 [html.light_&]:text-[#536b88]">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    Đã check-in: <strong className="text-white [html.light_&]:text-[#0D1B2A]">{checked}</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-amber-400" />
                    Chưa check-in: <strong className="text-white [html.light_&]:text-[#0D1B2A]">{valid}</strong>
                  </span>
                  <span>
                    Tổng: <strong className="text-white [html.light_&]:text-[#0D1B2A]">{total}</strong>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Tabular view fallback */
        <div className="space-y-3">
          {data.map((s) => (
            <div key={s.session_id} className="rounded-xl border border-white/10 [html.light_&]:border-slate-200 bg-[#0d172e]/60 [html.light_&]:bg-white p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-content">{s.session_name}</p>
                  <p className="text-xs text-subtle">
                    {fmtDate(s.start_time)} · {s.venue_name}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-tertiary">
                  {s.checkin_rate}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800 [html.light_&]:bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${s.checkin_rate >= 80 ? 'bg-success' : 'bg-primary'}`}
                  style={{ width: `${Math.min(s.checkin_rate, 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-subtle">
                {s.checked_in} / {s.total_tickets} đã check-in
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components: Biểu đồ Donut Check-in theo Loại vé ─────────────────────

function TicketTypeCheckinChart({ data = [] }) {
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const [viewMode, setViewMode] = useState('chart') // 'chart' | 'table'

  const totalChecked = useMemo(() => data.reduce((s, t) => s + (Number(t.checked_in) || 0), 0), [data])
  const totalAll = useMemo(() => data.reduce((s, t) => s + (Number(t.total_tickets) || 0), 0), [data])
  const overallRate = totalAll > 0 ? Math.round((totalChecked / totalAll) * 100) : 0

  // Calculate SVG Donut Slices
  const radius = 68
  const circumference = 2 * Math.PI * radius

  const slices = useMemo(() => {
    let acc = 0
    return data.map((t, idx) => {
      const checked = Number(t.checked_in) || 0
      const total = Number(t.total_tickets) || 0
      const share = totalChecked > 0 ? (checked / totalChecked) : (totalAll > 0 ? (total / totalAll) : 0)
      const strokeDasharray = `${share * circumference} ${circumference}`
      const strokeDashoffset = -acc * circumference
      acc += share
      return {
        ...t,
        idx,
        share: Math.round(share * 100),
        strokeDasharray,
        strokeDashoffset,
        color: TICKET_PALETTE[idx % TICKET_PALETTE.length],
      }
    })
  }, [data, totalChecked, totalAll, circumference])

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-subtle">
        <TicketCheck className="size-8 opacity-40 mb-2" />
        <p className="text-sm">Chưa có dữ liệu loại vé cho sự kiện này.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header controls */}
      <div className="mb-4 flex items-center justify-between border-b border-white/10 [html.light_&]:border-slate-200 pb-3">
        <span className="text-xs font-semibold text-slate-300 [html.light_&]:text-[#1B365D]">
          Phân bổ {totalChecked} vé đã soát theo từng hạng vé
        </span>
        <div className="flex items-center gap-1 rounded-lg bg-panel-soft/60 [html.light_&]:bg-slate-100 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-bold transition ${
              viewMode === 'chart'
                ? 'bg-primary text-[#0D1B2A] shadow-sm'
                : 'text-subtle hover:text-white [html.light_&]:hover:text-[#0D1B2A]'
            }`}
          >
            <PieChart className="size-3.5" />
            Biểu đồ
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`rounded-md px-2.5 py-1 font-bold transition ${
              viewMode === 'table'
                ? 'bg-primary text-[#0D1B2A] shadow-sm'
                : 'text-subtle hover:text-white [html.light_&]:hover:text-[#0D1B2A]'
            }`}
          >
            Bảng
          </button>
        </div>
      </div>

      {viewMode === 'chart' ? (
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] items-center gap-6 py-2">
          {/* Donut Visual */}
          <div className="relative mx-auto flex items-center justify-center shrink-0">
            <svg width="170" height="170" viewBox="0 0 170 170" className="rotate-[-90deg]">
              {/* Background track circle */}
              <circle
                cx="85"
                cy="85"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="20"
                className="text-slate-800/80 [html.light_&]:text-slate-200"
              />
              {/* Donut Segments */}
              {totalChecked > 0 ? (
                slices.map((slice) => {
                  const isHovered = hoveredIdx === slice.idx
                  return (
                    <circle
                      key={slice.ticket_type_id}
                      cx="85"
                      cy="85"
                      r={radius}
                      fill="none"
                      stroke={slice.color.stroke}
                      strokeWidth={isHovered ? 24 : 20}
                      strokeDasharray={slice.strokeDasharray}
                      strokeDashoffset={slice.strokeDashoffset}
                      strokeLinecap="butt"
                      className="transition-all duration-300 cursor-pointer"
                      onMouseEnter={() => setHoveredIdx(slice.idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                  )
                })
              ) : (
                <circle
                  cx="85"
                  cy="85"
                  r={radius}
                  fill="none"
                  stroke="#334155"
                  strokeWidth="20"
                  strokeDasharray="4 6"
                />
              )}
            </svg>

            {/* Inner Center Statistics */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-black tracking-tight text-white [html.light_&]:text-[#0D1B2A]">
                {hoveredIdx !== null ? `${slices[hoveredIdx]?.checked_in || 0}` : `${totalChecked}`}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">
                {hoveredIdx !== null ? slices[hoveredIdx]?.ticket_type_name : 'Đã check-in'}
              </span>
              <span className="text-[11px] font-extrabold text-emerald-400">
                {hoveredIdx !== null ? `${slices[hoveredIdx]?.checkin_rate}%` : `${overallRate}% tổng`}
              </span>
            </div>
          </div>

          {/* Ticket Type Cards & Progress list */}
          <div className="space-y-3 min-w-0">
            {slices.map((t) => {
              const isHovered = hoveredIdx === t.idx
              const checked = Number(t.checked_in) || 0
              const total = Number(t.total_tickets) || 0
              const rate = Number(t.checkin_rate) || 0

              return (
                <div
                  key={t.ticket_type_id}
                  onMouseEnter={() => setHoveredIdx(t.idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`rounded-xl border p-3 transition-all duration-200 cursor-pointer ${
                    isHovered
                      ? 'border-cyan-500/50 bg-[#142347] [html.light_&]:bg-[#f0fdfa] [html.light_&]:border-cyan-500/60 shadow-[0_4px_16px_rgba(6,182,212,0.15)]'
                      : 'border-white/10 bg-[#0d172e]/60 [html.light_&]:bg-white [html.light_&]:border-slate-200 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`size-3 rounded-full shrink-0 ${t.color.bg}`} />
                      <p className="truncate text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                        {t.ticket_type_name}
                      </p>
                      <span className="text-xs text-slate-400 [html.light_&]:text-[#536b88]">
                        · {fmtCurrency(t.price)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-semibold text-slate-300 [html.light_&]:text-[#1B365D]">
                        {checked}/{total} vé
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-black border ${
                          rate >= 80
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 [html.light_&]:text-emerald-700'
                            : rate >= 50
                              ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 [html.light_&]:text-cyan-700'
                              : 'bg-amber-500/20 text-amber-400 border-amber-500/30 [html.light_&]:text-amber-700'
                        }`}
                      >
                        {rate}%
                      </span>
                    </div>
                  </div>

                  {/* Micro Progress Track */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800 [html.light_&]:bg-slate-200">
                    <div
                      style={{ width: `${Math.min(rate, 100)}%` }}
                      className={`h-full rounded-full transition-all duration-500 ${t.color.bg}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* Original table view fallback */
        <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 [html.light_&]:border-slate-200 bg-[#121b33] [html.light_&]:bg-white">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead className="border-b border-white/10 [html.light_&]:border-slate-200 bg-[#172242] [html.light_&]:bg-slate-100 text-xs font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                <tr>
                  <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider whitespace-nowrap">Loại vé</th>
                  <th className="px-3.5 py-3 text-right font-bold uppercase tracking-wider whitespace-nowrap">Tổng</th>
                  <th className="px-3.5 py-3 text-right font-bold uppercase tracking-wider whitespace-nowrap">Đã CK</th>
                  <th className="px-3.5 py-3 text-right font-bold uppercase tracking-wider whitespace-nowrap">Tỷ lệ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 [html.light_&]:divide-slate-100 font-medium text-slate-300 [html.light_&]:text-slate-700">
                {data.map((tt) => (
                  <tr key={tt.ticket_type_id} className="hover:bg-white/[0.02] [html.light_&]:hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-semibold text-content">{tt.ticket_type_name}</p>
                      <p className="text-xs text-subtle">{fmtCurrency(tt.price)}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm text-subtle">{tt.total_tickets}</td>
                    <td className="px-4 py-3.5 text-right text-sm font-semibold text-success">{tt.checked_in}</td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold border ${
                        tt.checkin_rate >= 80 ? 'bg-success/15 text-success border-success/30' :
                        tt.checkin_rate >= 50 ? 'bg-tertiary/15 text-tertiary border-tertiary/30' :
                        'bg-warning/15 text-warning border-warning/30'
                      }`}>
                        {tt.checkin_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function OrganizerCheckinDashboardPage() {
  const [searchParams] = useSearchParams()
  const initialEventId = searchParams.get('eventId') || ''

  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState(initialEventId)

  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)

  // Load event list (published, completed, or events with ticket sales)
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

  const loadStats = useCallback(async () => {
    if (!selectedEventId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchCheckinStats(selectedEventId)
      setStats(data)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu check-in.')
    } finally {
      setLoading(false)
    }
  }, [selectedEventId])

  useEffect(() => { loadStats() }, [loadStats])

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(loadStats, 30_000)
    return () => clearInterval(timer)
  }, [loadStats])

  const overall = stats?.overall
  const bySession = stats?.by_session ?? []
  const byTicketType = stats?.by_ticket_type ?? []
  const recentCheckins = stats?.recent_checkins ?? []

  return (
    <OrganizerPage
      title="Theo dõi Check-in"
      description="Theo dõi tình trạng check-in theo thời gian thực cho sự kiện của bạn."
    >
      {/* ── Event selector with Smart Event Picker (Đã bỏ icon lịch) ── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        {eventsLoading ? (
          <div className="flex items-center gap-2 text-sm text-subtle">
            <Loader2 className="size-4 animate-spin text-primary" /> Đang tải sự kiện...
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-subtle">Chưa có sự kiện nào trong hệ thống.</p>
        ) : (
          <div className="flex-1 max-w-xl">
            <OrganizerEventPicker
              events={events}
              selectedEventId={selectedEventId}
              onSelectEvent={setSelectedEventId}
              loading={eventsLoading}
              label="Chọn sự kiện"
              allowAll={false}
              showCalendarIcon={false}
              placeholder="Chọn sự kiện để theo dõi check-in..."
            />
          </div>
        )}
        {lastRefresh && (
          <div className="flex items-center gap-2 pb-0.5">
            <p className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
              Cập nhật: {lastRefresh.toLocaleTimeString('vi-VN')}
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <OrganizerPanel className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-tertiary" />
        </OrganizerPanel>
      ) : stats ? (
        <>
          {/* ── KPI Cards ── */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Users}
              label="Tổng vé"
              value={overall.total_tickets.toLocaleString('vi-VN')}
              sub="Vé đã bán (đơn PAID)"
              accentBg="bg-tertiary/15"
              accentColor="text-tertiary"
            />
            <StatCard
              icon={CheckCircle2}
              label="Đã check-in"
              value={overall.checked_in.toLocaleString('vi-VN')}
              sub={`${overall.checkin_rate}% tổng số vé`}
              accentBg="bg-success/15"
              accentColor="text-success"
            />
            <StatCard
              icon={TicketCheck}
              label="Chưa check-in"
              value={overall.valid.toLocaleString('vi-VN')}
              sub="Vé hợp lệ còn lại"
              accentBg="bg-warning/15"
              accentColor="text-warning"
            />
            <StatCard
              icon={TrendingUp}
              label="Tỷ lệ check-in"
              value={`${overall.checkin_rate}%`}
              sub={`${overall.checked_in} / ${overall.total_tickets}`}
              accentBg="bg-ai/15"
              accentColor="text-ai"
            />
          </div>

          {/* ── Overall progress ── */}
          <OrganizerPanel className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-content">Tiến độ check-in tổng thể</h2>
              <span className="text-sm font-bold text-tertiary">{overall.checkin_rate}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800 [html.light_&]:bg-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  overall.checkin_rate >= 80 ? 'bg-success' : overall.checkin_rate >= 50 ? 'bg-primary' : 'bg-warning'
                }`}
                style={{ width: `${Math.min(overall.checkin_rate, 100)}%` }}
              />
            </div>
            <div className="mt-3 flex gap-6 text-xs text-subtle">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-success" /> Đã check-in: {overall.checked_in}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-warning" /> Chưa check-in: {overall.valid}
              </span>
              {overall.cancelled > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-error" /> Đã hủy: {overall.cancelled}
                </span>
              )}
            </div>
          </OrganizerPanel>

          {/* ── Biểu đồ trực quan thay thế dạng liệt kê ── */}
          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            {/* ── Biểu đồ Check-in theo phiên ── */}
            {bySession.length > 0 && (
              <OrganizerPanel>
                <div className="mb-4 flex items-center gap-2">
                  <BarChart3 className="size-5 text-tertiary" />
                  <h2 className="font-bold text-content">Biểu đồ Check-in theo phiên</h2>
                </div>
                <SessionCheckinChart data={bySession} />
              </OrganizerPanel>
            )}

            {/* ── Biểu đồ Donut Check-in theo loại vé ── */}
            {byTicketType.length > 0 && (
              <OrganizerPanel>
                <div className="mb-4 flex items-center gap-2">
                  <PieChart className="size-5 text-tertiary" />
                  <h2 className="font-bold text-content">Biểu đồ Check-in theo loại vé</h2>
                </div>
                <TicketTypeCheckinChart data={byTicketType} />
              </OrganizerPanel>
            )}
          </div>

          {/* ── Recent Check-ins ── */}
          {recentCheckins.length > 0 && (
            <OrganizerPanel>
              <div className="mb-4 flex items-center gap-2">
                <h2 className="font-bold text-content">Check-in gần nhất (20 lần)</h2>
              </div>
              <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 [html.light_&]:border-slate-200 bg-[#121b33] [html.light_&]:bg-white">
                <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[650px] text-sm">
                    <thead className="border-b border-white/10 [html.light_&]:border-slate-200 bg-[#172242] [html.light_&]:bg-slate-100 text-xs font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                      <tr>
                        <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider whitespace-nowrap">Người tham dự</th>
                        <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider whitespace-nowrap">Loại vé</th>
                        <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider whitespace-nowrap">Phiên</th>
                        <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider whitespace-nowrap">Thời gian</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 [html.light_&]:divide-slate-100 font-medium text-slate-300 [html.light_&]:text-slate-700">
                      {recentCheckins.map((c, i) => (
                        <tr key={`${c.ticket_code}-${i}`} className="hover:bg-white/[0.02] [html.light_&]:hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3.5">
                            <p className="text-sm font-semibold text-content">{c.attendee_name || '—'}</p>
                            <p className="text-xs text-subtle">{c.attendee_email}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge tone="blue">{c.ticket_type_name}</Badge>
                          </td>
                          <td className="px-4 py-3.5 text-subtle text-sm">
                            {c.session_name || '—'}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="flex items-center gap-1 text-xs text-subtle">
                              <Clock className="size-3" />
                              {fmtDateTime(c.checked_in_at)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </OrganizerPanel>
          )}

          {overall.total_tickets === 0 && (
            <OrganizerPanel className="py-14 text-center">
              <XCircle className="mx-auto size-10 text-subtle" />
              <p className="mt-3 font-bold text-content">Sự kiện này chưa có vé nào được bán.</p>
              <p className="mt-1 text-sm text-subtle">Dữ liệu check-in sẽ xuất hiện khi có đơn hàng được thanh toán.</p>
            </OrganizerPanel>
          )}
        </>
      ) : null}
    </OrganizerPage>
  )
}
