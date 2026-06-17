import { useEffect, useState, useCallback } from 'react'
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
  const [selectedEventId, setSelectedEventId] = useState('')
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
      eyebrow="Vận hành / Đơn hàng"
      description="Xem tất cả đơn hàng từ các sự kiện bạn quản lý."
    >
      {/* ── Filter bar ── */}
      <OrganizerPanel className="mb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          {/* Search */}
          <form className="relative flex-1" onSubmit={handleSearch}>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#737686]" />
            <input
              className="h-10 w-full rounded-md border border-[#c3c6d7] bg-[#f7f9fb] pl-10 pr-8 text-sm text-[#191c1e] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Tìm tên, email người mua hoặc mã đơn..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737686] hover:text-[#191c1e]"
                onClick={clearSearch}
              >
                <X className="size-4" />
              </button>
            )}
          </form>

          {/* Event filter */}
          <select
            className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm lg:w-64"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
          >
            <option value="">Tất cả sự kiện</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm lg:w-52"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
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
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
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
          <p className="font-bold text-[#565e74]">Không tìm thấy đơn hàng nào.</p>
          <p className="mt-1 text-sm text-[#737686]">Thử thay đổi bộ lọc hoặc tìm kiếm khác.</p>
        </OrganizerPanel>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[#c3c6d7] bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#f2f4f6] text-xs uppercase text-[#5c647a]">
              <tr>
                <th className="px-5 py-4 font-bold">Mã đơn</th>
                <th className="px-5 py-4 font-bold">Người mua</th>
                <th className="px-5 py-4 font-bold">Sự kiện</th>
                <th className="px-5 py-4 font-bold">Số vé</th>
                <th className="px-5 py-4 font-bold">Tổng tiền</th>
                <th className="px-5 py-4 font-bold">Trạng thái</th>
                <th className="px-5 py-4 font-bold">Ngày đặt</th>
                <th className="px-5 py-4 font-bold">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-t border-[#e0e3e5] hover:bg-[#f7f9fb]"
                >
                  <td className="px-5 py-4">
                    <span className="font-mono text-xs font-bold text-[#191c1e]">
                      {order.order_code}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <AvatarInitials
                        name={order.buyer_name || order.buyer_email || 'K'}
                        className="size-8"
                      />
                      <div>
                        <p className="font-semibold text-[#191c1e]">{order.buyer_name}</p>
                        <p className="text-xs text-[#737686]">{order.buyer_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="max-w-[180px] truncate font-semibold text-[#191c1e]">
                      {order.event_title}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-center font-semibold">
                    {order.ticket_quantity}
                  </td>
                  <td className="px-5 py-4 font-bold text-[#191c1e]">
                    {formatCurrency(order.total_amount)}
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={STATUS_TONE[order.status] || 'gray'}>
                      {STATUS_LABEL[order.status] || order.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-[#737686]">
                    {formatDateTime(order.created_at)}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      className="flex items-center gap-1.5 rounded-md border border-[#c3c6d7] bg-white px-3 py-1.5 text-xs font-bold text-[#434655] hover:border-primary hover:text-primary"
                      onClick={() => setDetailOrderId(order.id)}
                    >
                      <Eye className="size-3.5" />
                      Chi tiết
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
        <div className="mt-4 flex items-center justify-between text-sm text-[#434655]">
          <span>
            Hiển thị {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} trong{' '}
            {pagination.total} đơn hàng
          </span>
          <div className="flex items-center gap-2">
            <button
              className="grid size-8 place-items-center rounded-md border border-[#c3c6d7] disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="font-bold">
              {pagination.page} / {pagination.total_pages}
            </span>
            <button
              className="grid size-8 place-items-center rounded-md border border-[#c3c6d7] disabled:opacity-40"
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e0e3e5] px-6 py-4">
          <h2 className="font-display text-lg font-extrabold text-[#111827]">
            Chi tiết đơn hàng
          </h2>
          <button
            className="grid size-8 place-items-center rounded-full text-[#737686] hover:bg-[#f2f4f6]"
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
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {order && (
            <div className="space-y-6">
              {/* Order summary */}
              <section>
                <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[#737686]">
                  Thông tin đơn hàng
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <DetailRow label="Mã đơn">
                    <span className="font-mono font-bold">{order.order_code}</span>
                  </DetailRow>
                  <DetailRow label="Trạng thái">
                    <Badge tone={STATUS_TONE[order.status] || 'gray'}>
                      {STATUS_LABEL[order.status] || order.status}
                    </Badge>
                  </DetailRow>
                  <DetailRow label="Sự kiện">
                    <span className="font-semibold">{order.event_title}</span>
                  </DetailRow>
                  <DetailRow label="Ngày đặt">
                    {formatDateTime(order.created_at)}
                  </DetailRow>
                </div>
              </section>

              {/* Buyer info */}
              <section>
                <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[#737686]">
                  Thông tin người mua
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <DetailRow label="Họ tên">{order.buyer_name}</DetailRow>
                  <DetailRow label="Email">{order.buyer_email}</DetailRow>
                  <DetailRow label="Số điện thoại">{order.buyer_phone || '—'}</DetailRow>
                  {order.user_full_name && order.user_full_name !== order.buyer_name && (
                    <DetailRow label="Tài khoản">{order.user_full_name} ({order.user_email})</DetailRow>
                  )}
                </div>
              </section>

              {/* Line items */}
              <section>
                <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[#737686]">
                  Chi tiết vé
                </h3>
                <div className="overflow-hidden rounded-md border border-[#e0e3e5]">
                  <table className="w-full text-sm">
                    <thead className="bg-[#f2f4f6] text-xs uppercase text-[#5c647a]">
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
                        <tr key={item.id} className="border-t border-[#e0e3e5]">
                          <td className="px-4 py-3 font-semibold">{item.ticket_type_name}</td>
                          <td className="px-4 py-3 text-[#565e74]">
                            <p>{item.session_name || '—'}</p>
                            <p className="text-xs">{item.venue_name}</p>
                          </td>
                          <td className="px-4 py-3 text-[#565e74]">
                            {item.row_label && item.seat_number
                              ? `${item.row_label}${item.seat_number}`
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">{item.quantity}</td>
                          <td className="px-4 py-3 text-right font-bold">
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
                <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[#737686]">
                  Thanh toán
                </h3>
                <div className="rounded-md border border-[#e0e3e5] bg-[#f7f9fb] px-5 py-4 text-sm">
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
                    <div className="border-t border-[#e0e3e5] pt-2">
                      <SummaryRow
                        label="Tổng cộng"
                        value={formatCurrency(order.total_amount)}
                        bold
                      />
                    </div>
                  </div>

                  {order.payment_status && (
                    <div className="mt-3 border-t border-[#e0e3e5] pt-3 text-xs text-[#737686]">
                      <p>
                        Phương thức:{' '}
                        <span className="font-semibold text-[#434655]">
                          {order.payment_provider || '—'}
                        </span>
                      </p>
                      {order.payment_transaction_id && (
                        <p className="mt-1">
                          Mã giao dịch:{' '}
                          <span className="font-mono font-semibold text-[#434655]">
                            {order.payment_transaction_id}
                          </span>
                        </p>
                      )}
                      {order.payment_paid_at && (
                        <p className="mt-1">
                          Thanh toán lúc:{' '}
                          <span className="font-semibold text-[#434655]">
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

        <div className="flex justify-end border-t border-[#e0e3e5] px-6 py-4">
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
      <p className="text-xs text-[#737686]">{label}</p>
      <p className="mt-0.5 font-semibold text-[#191c1e]">{children}</p>
    </div>
  )
}

function SummaryRow({ label, value, bold, tone }) {
  const valueClass = tone === 'green' ? 'text-green-700' : bold ? 'text-[#111827]' : 'text-[#434655]'
  return (
    <div className="flex items-center justify-between">
      <span className={`${bold ? 'font-bold text-[#191c1e]' : 'text-[#565e74]'}`}>{label}</span>
      <span className={`${bold ? 'text-lg font-extrabold' : 'font-semibold'} ${valueClass}`}>
        {value}
      </span>
    </div>
  )
}
