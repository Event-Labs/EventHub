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
  OrganizerPage,
  OrganizerPanel,
} from './OrganizerComponents.jsx'

// ─── Constants ───────────────────────────────────────────────────────────────

const ORDER_STATUSES = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'PAID', label: 'Đã thanh toán' },
  { value: 'PENDING', label: 'Chờ thanh toán' },
  { value: 'CANCELLED', label: 'Đã hủy' },
  { value: 'EXPIRED', label: 'Hết hạn' },
]

const STATUS_TONE = {
  PAID: 'green',
  PENDING: 'blue',
  CANCELLED: 'red',
  EXPIRED: 'gray',
}

const STATUS_LABEL = {
  PAID: 'Đã thanh toán',
  PENDING: 'Chờ thanh toán',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
    Number(amount) || 0,
  )
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

  // Load events for filter dropdown
  useEffect(() => {
    fetchOrganizerEvents()
      .then(setEvents)
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
      title="Quản lý đơn hàng"
      description="Xem tất cả đơn hàng từ các sự kiện bạn quản lý."
    >
      {/* ── Filter bar ── */}
      <OrganizerPanel className="mb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          {/* Search */}
          <form className="relative flex-1" onSubmit={handleSearch}>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              className="h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft pl-10 pr-8 text-sm text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted"
              placeholder="Tìm tên, email người mua hoặc mã đơn..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-content"
                onClick={clearSearch}
              >
                <X className="size-4" />
              </button>
            )}
          </form>

          {/* Event filter */}
          <select
            className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content lg:w-64"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
          >
            <option value="" className="bg-surface text-content">Tất cả sự kiện</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id} className="bg-surface text-content">
                {ev.title}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content lg:w-52"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s.value} value={s.value} className="bg-surface text-content">
                {s.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="admin-secondary flex items-center gap-2"
            onClick={loadOrders}
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </OrganizerPanel>

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
          {error}
        </div>
      )}

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
        <div className="overflow-x-auto rounded-xl border border-border-soft/30 bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border-soft/30 text-xs uppercase text-subtle">
              <tr>
                <th className="px-5 py-4 font-extrabold">Mã đơn</th>
                <th className="px-5 py-4 font-extrabold">Người mua</th>
                <th className="px-5 py-4 font-extrabold">Sự kiện</th>
                <th className="px-5 py-4 font-extrabold">Số vé</th>
                <th className="px-5 py-4 font-extrabold">Tổng tiền</th>
                <th className="px-5 py-4 font-extrabold">Trạng thái</th>
                <th className="px-5 py-4 font-extrabold">Ngày đặt</th>
                <th className="px-5 py-4 font-extrabold">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-border-soft/20 transition-colors last:border-0 hover:bg-panel-soft/60"
                >
                  <td className="px-5 py-4">
                    <span className="font-mono text-xs font-bold text-content">
                      {order.order_code}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <AvatarInitials
                        name={order.buyer_name || order.buyer_email || 'K'}
                        className="size-8 animate-pulse-slow"
                      />
                      <div>
                        <p className="font-semibold text-content">{order.buyer_name}</p>
                        <p className="text-xs text-subtle">{order.buyer_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="max-w-[180px] truncate font-semibold text-content">
                      {order.event_title}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-center font-semibold text-content">
                    {order.ticket_quantity}
                  </td>
                  <td className="px-5 py-4 font-bold text-primary">
                    {formatCurrency(order.total_amount)}
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={STATUS_TONE[order.status] || 'gray'}>
                      {STATUS_LABEL[order.status] || order.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-subtle">
                    {formatDateTime(order.created_at)}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      className="grid size-9 place-items-center rounded-xl border border-border-soft/40 bg-panel-soft text-subtle transition hover:border-tertiary hover:text-tertiary"
                      onClick={() => setDetailOrderId(order.id)}
                      title="Xem chi tiết"
                      aria-label={`Xem chi tiết đơn hàng ${order.order_code}`}
                    >
                      <Eye className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-surface border border-border-soft/40 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-soft/30 px-6 py-4">
          <h2 className="font-display text-lg font-extrabold text-content">
            Chi tiết đơn hàng
          </h2>
          <button
            className="grid size-8 place-items-center rounded-xl text-subtle hover:bg-panel-soft transition"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-6 py-5">
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
                <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-subtle">
                  Thông tin đơn hàng
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <DetailRow label="Mã đơn">
                    <span className="font-mono font-bold text-content">{order.order_code}</span>
                  </DetailRow>
                  <DetailRow label="Trạng thái">
                    <Badge tone={STATUS_TONE[order.status] || 'gray'}>
                      {STATUS_LABEL[order.status] || order.status}
                    </Badge>
                  </DetailRow>
                  <DetailRow label="Sự kiện">
                    <span className="font-semibold text-content">{order.event_title}</span>
                  </DetailRow>
                  <DetailRow label="Ngày đặt">
                    <span className="text-content font-medium">{formatDateTime(order.created_at)}</span>
                  </DetailRow>
                </div>
              </section>

              {/* Buyer info */}
              <section>
                <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-subtle">
                  Thông tin người mua
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <DetailRow label="Họ tên"><span className="text-content font-semibold">{order.buyer_name}</span></DetailRow>
                  <DetailRow label="Email"><span className="text-content font-semibold">{order.buyer_email}</span></DetailRow>
                  <DetailRow label="Số điện thoại"><span className="text-content font-semibold">{order.buyer_phone || '—'}</span></DetailRow>
                  {order.user_full_name && order.user_full_name !== order.buyer_name && (
                    <DetailRow label="Tài khoản"><span className="text-content font-semibold">{order.user_full_name} ({order.user_email})</span></DetailRow>
                  )}
                </div>
              </section>

              {/* Line items */}
              <section>
                <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-subtle">
                  Chi tiết vé
                </h3>
                <div className="overflow-hidden rounded-xl border border-border-soft/30">
                  <table className="w-full text-sm">
                    <thead className="bg-panel-soft/50 text-xs uppercase text-subtle border-b border-border-soft/30">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold">Loại vé</th>
                        <th className="px-4 py-3 text-left font-bold">Phiên / Địa điểm</th>
                        <th className="px-4 py-3 text-left font-bold">Ghế</th>
                        <th className="px-4 py-3 text-right font-bold">SL</th>
                        <th className="px-4 py-3 text-right font-bold">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b border-border-soft/20 transition-colors last:border-0 hover:bg-panel-soft/50">
                          <td className="px-4 py-3 font-semibold text-content">{item.ticket_type_name}</td>
                          <td className="px-4 py-3 text-subtle">
                            <p className="font-semibold text-content">{item.session_name || '—'}</p>
                            <p className="text-xs mt-0.5">{item.venue_name}</p>
                          </td>
                          <td className="px-4 py-3 text-subtle">
                            {item.row_label && item.seat_number
                              ? `${item.row_label}${item.seat_number}`
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-content">{item.quantity}</td>
                          <td className="px-4 py-3 text-right font-bold text-primary">
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
                <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-subtle">
                  Thanh toán
                </h3>
                <div className="rounded-xl border border-border-soft/30 bg-panel-soft px-5 py-4 text-sm">
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
                    <div className="border-t border-border-soft/30 pt-2">
                      <SummaryRow
                        label="Tổng cộng"
                        value={formatCurrency(order.total_amount)}
                        bold
                      />
                    </div>
                  </div>

                  {order.payment_status && (
                    <div className="mt-3 border-t border-border-soft/30 pt-3 text-xs text-subtle">
                      <p>
                        Phương thức:{' '}
                        <span className="font-semibold text-content">
                          {order.payment_provider || '—'}
                        </span>
                      </p>
                      {order.payment_transaction_id && (
                        <p className="mt-1">
                          Mã giao dịch:{' '}
                          <span className="font-mono font-semibold text-content">
                            {order.payment_transaction_id}
                          </span>
                        </p>
                      )}
                      {order.payment_paid_at && (
                        <p className="mt-1">
                          Thanh toán lúc:{' '}
                          <span className="font-semibold text-content">
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

        <div className="flex justify-end border-t border-border-soft/30 px-6 py-4">
          <button className="admin-secondary" onClick={onClose}>
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
      <p className="text-xs text-subtle">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

function SummaryRow({ label, value, bold, tone }) {
  const valueClass = tone === 'green' ? 'text-success' : bold ? 'text-content' : 'text-subtle'
  return (
    <div className="flex items-center justify-between">
      <span className={`${bold ? 'font-bold text-content' : 'text-subtle'}`}>{label}</span>
      <span className={`${bold ? 'text-lg font-extrabold' : 'font-semibold'} ${valueClass}`}>
        {value}
      </span>
    </div>
  )
}
