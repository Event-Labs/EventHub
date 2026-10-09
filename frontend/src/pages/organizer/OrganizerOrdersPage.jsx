import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { fetchOrganizerOrders, fetchOrganizerOrderDetail } from '@/services/organizerOrders.js'
import { fetchOrganizerEvents } from '@/services/organizerEvents.js'
import {
  AvatarInitials,
  Badge,
  StatusBadge,
  TableActionButton,
  OrganizerPage,
  OrganizerPanel,
} from './OrganizerComponents.jsx'

// ─── Constants ───────────────────────────────────────────────────────────────

const ORDER_STATUSES = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'PAID', label: 'Đã thanh toán' },
  { value: 'PENDING', label: 'Chờ thanh toán' },
  { value: 'REFUND_REQUESTED', label: 'Yêu cầu hoàn tiền' },
  { value: 'REFUNDED', label: 'Đã hoàn tiền' },
  { value: 'CANCELLED', label: 'Đã hủy' },
  { value: 'EXPIRED', label: 'Hết hạn' },
  { value: 'FAILED', label: 'Thất bại' },
]

const STATUS_TONE = {
  PAID: 'green',
  PENDING: 'amber',
  REFUND_REQUESTED: 'purple',
  REFUNDED: 'green',
  PARTIALLY_REFUNDED: 'green',
  CANCELLED: 'gray',
  EXPIRED: 'orange',
  FAILED: 'red',
  PROCESSING: 'amber',
}

const STATUS_LABEL = {
  PAID: 'Đã thanh toán',
  PENDING: 'Chờ thanh toán',
  REFUND_REQUESTED: 'Yêu cầu hoàn tiền',
  REFUNDED: 'Đã hoàn tiền',
  PARTIALLY_REFUNDED: 'Hoàn một phần',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
  FAILED: 'Thất bại',
  PROCESSING: 'Đang xử lý',
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
    Number(amount) || 0,
  )
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatTimeOnly(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function OrganizerOrdersPage() {
  const [orders, setOrders] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 1 })
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchParams] = useSearchParams()
  const initialEventId = searchParams.get('eventId') || ''
  const [selectedEventId, setSelectedEventId] = useState(initialEventId)
  const [selectedStatus, setSelectedStatus] = useState('')
  const [page, setPage] = useState(1)

  // Detail modal
  const [detailOrderId, setDetailOrderId] = useState(null)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: 20 }
      if (selectedEventId) params.eventId = selectedEventId
      if (selectedStatus) params.status = selectedStatus
      if (search) params.search = search

      const data = await fetchOrganizerOrders(params)
      setOrders(data.items || [])
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, total_pages: 1 })
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách đơn hàng.')
    } finally {
      setLoading(false)
    }
  }, [page, selectedEventId, selectedStatus, search])

  // Load events for filter dropdown (only published events)
  useEffect(() => {
    fetchOrganizerEvents()
      .then((data) => setEvents((data || []).filter((ev) => ev.status === 'PUBLISHED')))
      .catch(() => setEvents([]))
  }, [])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [selectedEventId, selectedStatus, search])

  const handleSearch = (e) => {
    e.preventDefault()
    setSearch(searchInput.trim())
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearch('')
  }

  return (
    <OrganizerPage
      title="Quản lý Đơn hàng"
      description="Xem tất cả đơn hàng từ các sự kiện bạn quản lý."
    >
      {/* ── Filter bar ── */}
      <div className="mb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Search */}
          <form className="relative flex-1" onSubmit={handleSearch}>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white" />
            <input
              className="h-10 w-full rounded-xl border border-white/15 bg-[#0d172e] pl-10 pr-8 text-sm font-normal text-white outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-white/50"
              placeholder="Tìm tên, email người mua hoặc mã đơn..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                onClick={clearSearch}
              >
                <X className="size-4" />
              </button>
            )}
          </form>

          {/* Event filter */}
          <select
            className="h-10 rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm font-medium text-white shadow-sm outline-none focus:border-primary lg:w-64"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
          >
            <option value="" className="bg-[#0b1329] text-white">Tất cả sự kiện</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id} className="bg-[#0b1329] text-white">
                {ev.title}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            className="h-10 rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm font-medium text-white shadow-sm outline-none focus:border-primary lg:w-52"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s.value} value={s.value} className="bg-[#0b1329] text-white">
                {s.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="org-btn-secondary flex items-center gap-2"
            onClick={loadOrders}
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>



      {/* ── Table ── */}
      {loading ? (
        <OrganizerPanel className="flex items-center justify-center py-16">
          <Loader2 className="size-7 animate-spin text-primary" />
        </OrganizerPanel>
      ) : orders.length === 0 ? (
        <OrganizerPanel className="py-14 text-center">
          <p className="font-bold text-content">Không tìm thấy đơn hàng nào.</p>
          <p className="mt-1 text-sm text-subtle">Thử thay đổi bộ lọc hoặc tìm kiếm khác.</p>
        </OrganizerPanel>
      ) : (
        <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#121b33]">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#172242] text-xs font-bold uppercase tracking-wider text-white">
                <tr>
                  <th className="px-3 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Mã đơn</th>
                  <th className="px-3 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Người mua</th>
                  <th className="px-3 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Sự kiện</th>
                  <th className="w-14 px-2 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap text-center">Số vé</th>
                  <th className="px-3 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap text-right">Tổng tiền</th>
                  <th className="px-3 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap text-center">Trạng thái</th>
                  <th className="px-3 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap text-center">Ngày đặt</th>
                  <th className="w-14 px-3 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs sm:text-sm font-bold text-content tracking-tight">
                        {order.order_code}
                      </span>
                    </td>
                    <td className="max-w-[170px] xl:max-w-[210px] px-3 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <AvatarInitials
                          name={order.buyer_name || order.buyer_email || 'K'}
                          className="size-8 shrink-0 animate-pulse-slow"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-content" title={order.buyer_name}>{order.buyer_name}</p>
                          <p className="truncate text-xs text-subtle" title={order.buyer_email}>{order.buyer_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[160px] xl:max-w-[200px] px-3 py-3">
                      <p className="truncate text-sm font-bold text-white" title={order.event_title}>
                        {order.event_title}
                      </p>
                    </td>
                    <td className="w-14 px-2 py-3 text-center text-sm font-semibold text-content whitespace-nowrap">
                      {order.ticket_quantity}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-primary text-sm whitespace-nowrap">
                      {formatCurrency(order.total_amount)}
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      <StatusBadge
                        status={order.status}
                        label={STATUS_LABEL[order.status]}
                        tone={STATUS_TONE[order.status]}
                      />
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      <p className="text-sm font-medium text-slate-200">{formatDateOnly(order.created_at)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{formatTimeOnly(order.created_at)}</p>
                    </td>
                    <td className="w-14 px-3 py-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center">
                        <TableActionButton
                          onClick={() => setDetailOrderId(order.id)}
                          title="Xem chi tiết"
                          icon={Eye}
                          tone="default"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && pagination.total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-subtle">
          <span>
            Hiển thị {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} trong{' '}
            {pagination.total} đơn hàng
          </span>
          <div className="flex items-center gap-2">
            <button
              className="grid size-8 place-items-center rounded-xl border border-border-soft/40 text-subtle bg-panel-soft hover:border-tertiary hover:text-tertiary disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="font-bold text-content">
              {pagination.page} / {pagination.total_pages}
            </span>
            <button
              className="grid size-8 place-items-center rounded-xl border border-border-soft/40 text-subtle bg-panel-soft hover:border-tertiary hover:text-tertiary disabled:opacity-40"
              disabled={page >= pagination.total_pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Order Detail Modal ── */}
      {detailOrderId && (
        <OrderDetailModal
          orderId={detailOrderId}
          onClose={() => setDetailOrderId(null)}
        />
      )}
    </OrganizerPage>
  )
}

function OrderDetailModal({ orderId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    fetchOrganizerOrderDetail(orderId)
      .then((result) => { if (active) { setData(result); setLoading(false) } })
      .catch((err) => {
        if (active) {
          setError(err.response?.data?.message || 'Không thể tải chi tiết đơn hàng.')
          setLoading(false)
        }
      })
    return () => { active = false }
  }, [orderId])

  const order = data?.order
  const items = data?.items || []

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-[#0b1329] border border-white/15 shadow-2xl shadow-black/90 overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#111c3a] px-6 py-4">
          <h2 className="font-display text-xl font-black text-white">
            Chi tiết đơn hàng
          </h2>
          <button
            className="grid size-8 place-items-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-6 py-5 bg-[#0b1329]">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-7 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
              {error}
            </div>
          )}

          {order && (
            <div className="space-y-6">
              {/* Order summary */}
              <section>
                <h3 className="mb-3 text-base font-extrabold uppercase tracking-wider text-white">
                  Thông tin đơn hàng
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <DetailRow label="Mã đơn">
                    <span className="font-mono font-bold text-white">{order.order_code}</span>
                  </DetailRow>
                  <DetailRow label="Trạng thái">
                    <StatusBadge
                      status={order.status}
                      label={STATUS_LABEL[order.status]}
                      tone={STATUS_TONE[order.status]}
                    />
                  </DetailRow>
                  <DetailRow label="Sự kiện">
                    <span className="font-bold text-white text-base leading-snug">{order.event_title}</span>
                  </DetailRow>
                  <DetailRow label="Ngày đặt">
                    <span className="text-slate-200 font-medium">{formatDateTime(order.created_at)}</span>
                  </DetailRow>
                </div>
              </section>

              {/* Buyer info */}
              <section>
                <h3 className="mb-3 text-base font-extrabold uppercase tracking-wider text-white">
                  Thông tin người mua
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <DetailRow label="Họ tên"><span className="text-white font-bold text-base">{order.buyer_name}</span></DetailRow>
                  <DetailRow label="Email"><span className="text-slate-200 font-semibold">{order.buyer_email}</span></DetailRow>
                  <DetailRow label="Số điện thoại"><span className="text-slate-200 font-semibold">{order.buyer_phone || '—'}</span></DetailRow>
                  {order.user_full_name && order.user_full_name !== order.buyer_name && (
                    <DetailRow label="Tài khoản"><span className="text-slate-200 font-semibold">{order.user_full_name} ({order.user_email})</span></DetailRow>
                  )}
                </div>
              </section>

              {/* Line items */}
              <section>
                <h3 className="mb-3 text-base font-extrabold uppercase tracking-wider text-white">
                  Chi tiết vé
                </h3>
                <div className="overflow-hidden rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-[#111c3a] text-xs uppercase font-bold text-white border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-white whitespace-nowrap">Loại vé</th>
                        <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-white whitespace-nowrap">Phiên / Địa điểm</th>
                        <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-white whitespace-nowrap">Ghế</th>
                        <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-white whitespace-nowrap">SL</th>
                        <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-white whitespace-nowrap">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 bg-[#0b1329]">
                      {items.map((item) => (
                        <tr key={item.id} className="transition-colors hover:bg-white/5">
                          <td className="px-4 py-3 font-bold text-white">{item.ticket_type_name}</td>
                          <td className="px-4 py-3 text-slate-300">
                            <p className="font-semibold text-white">{item.session_name || '—'}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{item.venue_name}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {item.row_label && item.seat_number
                              ? `${item.row_label}${item.seat_number}`
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-white">{item.quantity}</td>
                          <td className="px-4 py-3 text-right font-bold text-primary text-base">
                            {formatCurrency(item.final_price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Payment summary */}
              <section>
                <h3 className="mb-3 text-base font-extrabold uppercase tracking-wider text-white">
                  Thanh toán
                </h3>
                <div className="rounded-xl border border-white/10 bg-[#111c3a] px-5 py-4 text-sm text-white">
                  <div className="space-y-2">
                    <SummaryRow label="Tạm tính" value={formatCurrency(order.subtotal)} />
                    {Number(order.discount_amount) > 0 && (
                      <SummaryRow
                        label={`Giảm giá${order.promo_code ? ` (${order.promo_code})` : ''}`}
                        value={`-${formatCurrency(order.discount_amount)}`}
                        tone="green"
                      />
                    )}
                    {Number(order.platform_fee) > 0 && (
                      <SummaryRow label="Phí nền tảng" value={formatCurrency(order.platform_fee)} />
                    )}
                    <div className="border-t border-white/10 pt-2">
                      <SummaryRow
                        label="Tổng cộng"
                        value={formatCurrency(order.total_amount)}
                        bold
                      />
                    </div>
                  </div>

                  {order.payment_status && (
                    <div className="mt-3 border-t border-white/10 pt-3 text-xs text-slate-300">
                      <p>
                        Phương thức:{' '}
                        <span className="font-semibold text-white">
                          {order.payment_provider || '—'}
                        </span>
                      </p>
                      {order.payment_transaction_id && (
                        <p className="mt-1">
                          Mã giao dịch:{' '}
                          <span className="font-mono font-semibold text-white">
                            {order.payment_transaction_id}
                          </span>
                        </p>
                      )}
                      {order.payment_paid_at && (
                        <p className="mt-1">
                          Thanh toán lúc:{' '}
                          <span className="font-semibold text-white">
                            {formatDateTime(order.payment_paid_at)}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-white/10 bg-[#111c3a] px-6 py-4">
          <button className="org-btn-secondary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, children }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function SummaryRow({ label, value, bold, tone }) {
  const valueClass = tone === 'green' ? 'text-success' : bold ? 'text-white' : 'text-slate-200'
  return (
    <div className="flex items-center justify-between">
      <span className={`${bold ? 'font-bold text-white text-base' : 'text-slate-300 font-semibold'}`}>{label}</span>
      <span className={`${bold ? 'text-xl font-black text-white' : 'font-bold'} ${valueClass}`}>
        {value}
      </span>
    </div>
  )
}
