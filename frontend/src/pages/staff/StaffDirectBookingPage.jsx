import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, ExternalLink, Loader2, Printer, ReceiptText, RefreshCw, RotateCcw, Search, Ticket, UserRound } from 'lucide-react'
import { createStaffDirectBooking, fetchStaffDirectBookingEvents, fetchStaffDirectBookingStatus } from '@/services/orders.js'
import { fetchSessionSeats } from '@/services/events.js'
import { Badge, StaffPage, StaffPanel } from './StaffComponents.jsx'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'bank_transfer', label: 'Chuyển khoản' },
  { value: 'card', label: 'Thẻ' },
]

const PAYMENT_STATUS_LABELS = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  CANCELLED: 'Đã hủy',
  FAILED: 'Thanh toán thất bại',
  EXPIRED: 'Đã hết hạn',
  REFUNDED: 'Đã hoàn tiền',
}

const BOOKING_SOURCE_LABELS = {
  staff_direct: 'Nhân sự đặt trực tiếp',
}

function paymentStatusLabel(status) {
  return PAYMENT_STATUS_LABELS[status] || 'Chưa xác định'
}

function formatPrice(value) {
  const number = Number(value || 0)
  if (number === 0) return 'Miễn phí'
  return `${number.toLocaleString('vi-VN')} đ`
}

function formatDateTime(value) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function venueLine(venue) {
  if (!venue) return 'Địa điểm cập nhật sau'
  return [venue.name, venue.address_line, venue.ward, venue.district, venue.city].filter(Boolean).join(', ') || 'Địa điểm cập nhật sau'
}

function qrPayload(ticket) {
  return JSON.stringify({
    type: 'EVENTHUB_TICKET',
    ticket_id: ticket.id,
    ticket_code: ticket.ticket_code,
    qr_code: ticket.qr_code || ticket.ticket_code,
  })
}

function qrImageSrc(ticket) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(qrPayload(ticket))}`
}

const SEAT_WIDTH = 32
const SEAT_HEIGHT = 32
const SEAT_LAYOUT_PADDING = 24
const STAGE_HEIGHT = 44
const STAGE_GAP = 24

// Trạng thái ghế và màu sắc tương ứng
const SEAT_STATUS = {
  AVAILABLE: 'AVAILABLE',
  SELECTED: 'SELECTED',
  BOOKED: 'BOOKED',
  SOLD: 'SOLD',
  HELD: 'HELD',
  RESERVED: 'RESERVED',
  BLOCKED: 'BLOCKED',
  MAINTENANCE: 'MAINTENANCE',
  DISABLED: 'DISABLED',
}

// Trả về className cho ghế — zone color KHÔNG được xử lý ở đây,
// chỉ xử lý qua dải màu đáy (giống customer booking).
function getSeatStatusClass(status, selected) {
  if (selected) {
    // Đang chọn: cam
    return 'cursor-pointer border-orange-400 bg-orange-400 text-slate-950 shadow-md shadow-orange-400/40'
  }
  switch (status) {
    case SEAT_STATUS.AVAILABLE:
      // Trống: giống customer — border mờ, nền panel-soft, text subtle
      return 'cursor-pointer border-border-soft bg-panel-soft text-subtle hover:border-primary hover:text-primary'
    case SEAT_STATUS.SOLD:
    case SEAT_STATUS.BOOKED:
      // Đã bán: xám tối hoàn toàn (KHÔNG giữ zone color)
      return 'cursor-not-allowed border-slate-700 bg-slate-700 text-slate-500'
    case SEAT_STATUS.HELD:
    case SEAT_STATUS.RESERVED:
      // Đang giữ / đặt trước: xám tối (KHÔNG giữ zone color)
      return 'cursor-not-allowed border-slate-700 bg-slate-700 text-slate-500'
    case SEAT_STATUS.BLOCKED:
    case SEAT_STATUS.DISABLED:
    case SEAT_STATUS.MAINTENANCE:
      // Khoá: xám tối
      return 'cursor-not-allowed border-slate-700 bg-slate-700 text-slate-500'
    default:
      return 'cursor-not-allowed border-slate-700 bg-slate-700 text-slate-500'
  }
}

function getSeatLabel(seat) {
  // Ưu tiên label đầy đủ backend đã tạo (A1, B3...)
  if (seat.label && seat.label !== seat.row_label) return seat.label
  // Ghép row_label + seat_number
  if (seat.row_label != null && seat.seat_number != null && seat.seat_number !== '') {
    return `${seat.row_label}${seat.seat_number}`
  }
  return seat.label || seat.row_label || '?'
}

// Tính width cần thiết dựa trên label dài nhất
function calcSeatWidth(seats) {
  const maxLen = Math.max(2, ...(seats || []).map((s) => getSeatLabel(s).length))
  // mỗi ký tự ~6.5px ở font-size 9-10px, padding 4px mỗi bên, min 28px
  return Math.max(28, Math.ceil(maxLen * 6.5 + 8))
}

// Tính spacing thực tế giữa các ghế từ x_position
function calcXSpacing(seats) {
  const positioned = (seats || []).filter(
    (s) => s.x_position != null && Number.isFinite(Number(s.x_position))
  )
  if (positioned.length < 2) return null
  // Nhóm theo row_label, lấy spacing trong cùng row
  const rowMap = new Map()
  for (const s of positioned) {
    const row = s.row_label || ''
    if (!rowMap.has(row)) rowMap.set(row, [])
    rowMap.get(row).push(Number(s.x_position))
  }
  const spacings = []
  for (const xs of rowMap.values()) {
    if (xs.length < 2) continue
    xs.sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i] - xs[i - 1]
      if (d > 2 && d < 120) spacings.push(d) // bỏ lối đi lớn, chỉ lấy spacing ghế
    }
  }
  if (!spacings.length) return null
  spacings.sort((a, b) => a - b)
  // Lấy median
  return spacings[Math.floor(spacings.length / 2)]
}

function isClickable(status, selected) {
  if (selected) return true
  return status === SEAT_STATUS.AVAILABLE
}

function seatId(seat) {
  return String(seat?.session_seat_id || seat?.id || '')
}

// Xây dựng layout theo tọa độ x,y thực tế
function buildXYLayout(seats, seatWidth) {
  const w = seatWidth || SEAT_WIDTH
  const positioned = (seats || []).filter(
    (seat) => seat.x_position != null && seat.y_position != null &&
      Number.isFinite(Number(seat.x_position)) && Number.isFinite(Number(seat.y_position))
  )
  if (!positioned.length) return null

  const minX = Math.min(...positioned.map((s) => Number(s.x_position)))
  const minY = Math.min(...positioned.map((s) => Number(s.y_position)))
  const maxX = Math.max(...positioned.map((s) => Number(s.x_position)))
  const maxY = Math.max(...positioned.map((s) => Number(s.y_position)))
  const positions = new Map()

  positioned.forEach((seat) => {
    positions.set(seatId(seat), {
      left: Number(seat.x_position) - minX + SEAT_LAYOUT_PADDING,
      top: Number(seat.y_position) - minY + SEAT_LAYOUT_PADDING + STAGE_HEIGHT + STAGE_GAP,
    })
  })

  return {
    positions,
    width: Math.max(360, maxX - minX + w + SEAT_LAYOUT_PADDING * 2),
    height: Math.max(240, maxY - minY + SEAT_HEIGHT + SEAT_LAYOUT_PADDING * 2 + STAGE_HEIGHT + STAGE_GAP),
  }
}

// Xây dựng layout theo row/column thực tế (khi không có x,y)
function buildRowColLayout(seats) {
  const rowMap = new Map()
  for (const seat of seats || []) {
    const row = seat.row_label || 'A'
    if (!rowMap.has(row)) rowMap.set(row, [])
    rowMap.get(row).push(seat)
  }
  const rows = []
  for (const [rowLabel, rowSeats] of rowMap.entries()) {
    rows.push({
      rowLabel,
      seats: [...rowSeats].sort((a, b) => Number(a.seat_number || 0) - Number(b.seat_number || 0)),
    })
  }
  rows.sort((a, b) => a.rowLabel.localeCompare(b.rowLabel))
  return rows
}

export function StaffDirectBookingPage() {
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const directOrderId = searchParams.get('directOrderId')
  const [query, setQuery] = useState('')
  const [selectedEventId, setSelectedEventId] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [selectedSeatIds, setSelectedSeatIds] = useState([])
  const [buyer, setBuyer] = useState({ name: '', phone: '', email: '', note: '' })
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [quantities, setQuantities] = useState({})
  const [result, setResult] = useState(null)
  const [showDetail, setShowDetail] = useState(false)

  const eventsQuery = useQuery({
    queryKey: ['staff-direct-booking-events'],
    queryFn: fetchStaffDirectBookingEvents,
  })

  const returnStatusQuery = useQuery({
    queryKey: ['staff-direct-booking-return-status', directOrderId],
    queryFn: () => fetchStaffDirectBookingStatus(directOrderId),
    enabled: Boolean(directOrderId && !result),
    refetchInterval: (query) => (query.state.data?.order?.status === 'PAID' ? false : 5000),
  })

  const createMutation = useMutation({
    mutationFn: createStaffDirectBooking,
    onSuccess: (data) => {
      if (data.order.status === 'PAID' && data.confirmation_email_sent === false) {
        toast.error('Đã xuất vé nhưng chưa thể gửi email. Vui lòng kiểm tra cấu hình email.')
      } else if (data.order.status === 'PAID') {
        toast.success(`Đã xuất vé và gửi email tới ${data.order.buyer_email}.`)
      } else {
        toast.success('Đã tạo đơn. Vé sẽ được gửi qua email sau khi PayOS xác nhận thanh toán.')
      }
      setResult(data)
      setShowDetail(true)
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể tạo đơn đặt vé trực tiếp.'))
    },
  })

  const statusQuery = useQuery({
    queryKey: ['staff-direct-booking-status', result?.order?.id],
    queryFn: () => fetchStaffDirectBookingStatus(result.order.id),
    enabled: Boolean(result?.order?.id && result?.order?.status === 'PENDING'),
    refetchInterval: (query) => (query.state.data?.order?.status === 'PAID' ? false : 5000),
  })

  const displayResult = returnStatusQuery.data || statusQuery.data || result
  const activeStatusQuery = returnStatusQuery.data ? returnStatusQuery : statusQuery

  const events = useMemo(() => eventsQuery.data || [], [eventsQuery.data])
  const filteredEvents = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return events
    return events.filter((event) => event.title.toLowerCase().includes(keyword))
  }, [events, query])

  const selectedEvent = events.find((event) => event.id === selectedEventId) || null
  const selectedSession = selectedEvent?.sessions?.find((session) => String(session.id) === String(selectedSessionId)) || selectedEvent?.sessions?.[0] || null
  const currentTicketTypes = useMemo(
    () =>
      selectedSession
        ? (selectedEvent?.ticket_types || []).filter((ticketType) => String(ticketType.event_session_id) === String(selectedSession.id))
        : selectedEvent?.ticket_types || [],
    [selectedEvent, selectedSession],
  )
  const hasSeatedTickets = currentTicketTypes.some((ticketType) => ticketType.is_seated)
  const seatsQuery = useQuery({
    queryKey: ['staff-direct-session-seats', selectedSession?.id],
    queryFn: () => fetchSessionSeats(selectedSession.id),
    enabled: Boolean(selectedSession?.id && hasSeatedTickets),
  })
  const selectedItems = useMemo(() => {
    if (!selectedEvent) return []
    const seats = seatsQuery.data?.seats || []
    const seatGroups = {}
    selectedSeatIds.forEach((selectedSeatId) => {
      const seat = seats.find((item) => seatId(item) === String(selectedSeatId))
      if (!seat) return
      const mappedTicketTypeIds = seat.ticket_type_ids || []
      const ticketType = mappedTicketTypeIds.length
        ? currentTicketTypes.find((type) => mappedTicketTypeIds.some((id) => String(id) === String(type.id)))
        : currentTicketTypes.find((type) => type.is_seated)
      if (!ticketType) return
      if (!seatGroups[ticketType.id]) {
        seatGroups[ticketType.id] = {
          ticketType,
          quantity: 0,
          sessionSeatIds: [],
        }
      }
      seatGroups[ticketType.id].quantity += 1
      seatGroups[ticketType.id].sessionSeatIds.push(seat.session_seat_id)
    })

    const nonSeatedItems = currentTicketTypes
      .filter((ticketType) => !ticketType.is_seated)
      .map((ticketType) => ({
        ticketType,
        quantity: Number(quantities[ticketType.id] || 0),
      }))
      .filter((item) => item.quantity > 0)

    return [...Object.values(seatGroups), ...nonSeatedItems]
  }, [currentTicketTypes, quantities, seatsQuery.data?.seats, selectedEvent, selectedSeatIds])
  const totalQuantity = selectedItems.reduce((sum, item) => sum + item.quantity, 0)
  const totalAmount = selectedItems.reduce((sum, item) => sum + item.quantity * Number(item.ticketType.price || 0), 0)
  const cashReceivedAmount = Number(String(cashReceived).replace(/[^\d]/g, '') || 0)
  const cashChange = Math.max(0, cashReceivedAmount - totalAmount)
  const cashIsEnough = paymentMethod !== 'cash' || totalAmount === 0 || cashReceivedAmount >= totalAmount
  const buyerEmail = buyer.email.trim().toLowerCase()
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)
  const canSubmit = selectedEvent && buyer.name.trim().length >= 2 && buyer.phone.trim() && emailIsValid && selectedItems.length > 0 && cashIsEnough

  function updateQuantity(ticketType, nextValue) {
    const next = Math.max(0, Math.min(Number(ticketType.available_quantity || 0), Number(nextValue || 0)))
    setQuantities((current) => ({ ...current, [ticketType.id]: next }))
  }

  function resetForm() {
    setSelectedEventId('')
    setSelectedSessionId('')
    setSelectedSeatIds([])
    setBuyer({ name: '', phone: '', email: '', note: '' })
    setPaymentMethod('cash')
    setCashReceived('')
    setQuantities({})
    setResult(null)
    setShowDetail(false)
    createMutation.reset()
  }

  function submitBooking() {
    if (!canSubmit || createMutation.isPending) return
    createMutation.mutate({
      event_id: selectedEvent.id,
      buyer_name: buyer.name.trim(),
      buyer_phone: buyer.phone.trim(),
      buyer_email: buyerEmail,
      internal_note: buyer.note.trim() || null,
      payment_method: paymentMethod,
      items: selectedItems.map((item) => ({
        ticket_type_id: item.ticketType.id,
        quantity: item.quantity,
        session_seat_ids: item.sessionSeatIds || [],
      })),
    })
  }

  return (
    <StaffPage
      title="Đặt vé trực tiếp"
      description="Tạo đơn đặt vé đã thanh toán và in vé cho khách tại quầy."
      action={
        result ? (
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border-soft/50 px-4 py-2 text-sm font-bold text-content hover:border-primary hover:text-primary"
          >
            <RotateCcw className="size-4" />
            Tạo đơn đặt vé mới
          </button>
        ) : null
      }
    >
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
          }
          body * { visibility: hidden !important; }
          .direct-booking-print, .direct-booking-print * { visibility: visible !important; }
          .direct-booking-print {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            box-sizing: border-box !important;
            padding: 10mm !important;
            background: white !important;
          }
          .direct-booking-ticket {
            break-inside: avoid !important;
            border: 1.5px solid #000 !important;
            background: #fff !important;
            color: #000 !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: economy !important;
            print-color-adjust: economy !important;
          }
          .direct-booking-ticket .ticket-print-header {
            border-bottom: 1px solid #000 !important;
            background: #fff !important;
          }
          .direct-booking-ticket .ticket-print-logo {
            filter: grayscale(1) brightness(0) !important;
          }
          .direct-booking-ticket .ticket-print-status,
          .direct-booking-ticket .ticket-print-type {
            border: 1px solid #000 !important;
            background: #fff !important;
            color: #000 !important;
          }
          .direct-booking-ticket .ticket-print-banner,
          .direct-booking-ticket .ticket-print-gradient {
            display: none !important;
          }
          .direct-booking-ticket .ticket-print-hero {
            min-height: 0 !important;
            background: #fff !important;
          }
          .direct-booking-ticket .ticket-print-hero-content {
            min-height: 0 !important;
            padding: 16px 20px !important;
          }
          .direct-booking-ticket .ticket-print-title,
          .direct-booking-ticket .ticket-print-code,
          .direct-booking-ticket .ticket-print-details,
          .direct-booking-ticket .ticket-print-details * {
            color: #000 !important;
          }
          .direct-booking-ticket .ticket-print-separator {
            border-color: #000 !important;
          }
          .direct-booking-ticket .ticket-print-qr {
            border: 1px solid #000 !important;
            box-shadow: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {displayResult ? (
        <BookingResult
          result={displayResult}
          showDetail={showDetail}
          setShowDetail={setShowDetail}
          resetForm={resetForm}
          onRefresh={() => activeStatusQuery.refetch()}
          refreshing={activeStatusQuery.isFetching}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <StaffPanel>
              <SectionTitle step="1" title="Chọn sự kiện đang mở bán" />
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm sự kiện"
                  className="h-11 w-full rounded-md border border-border-soft/50 bg-panel-soft pl-10 pr-3 text-sm text-content outline-none transition focus:border-primary"
                />
              </div>
              {eventsQuery.isLoading && (
                <div className="mt-5 flex items-center gap-2 text-sm text-subtle">
                  <Loader2 className="size-4 animate-spin" />
                  Đang tải sự kiện...
                </div>
              )}
              {eventsQuery.isError && (
                <p className="mt-5 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
                  Không thể tải danh sách sự kiện đang mở bán.
                </p>
              )}
              {!eventsQuery.isLoading && !eventsQuery.isError && filteredEvents.length === 0 && (
                <p className="mt-5 rounded-md border border-border-soft/40 bg-panel-soft px-4 py-3 text-sm text-subtle">
                  Chưa có sự kiện phù hợp hoặc sự kiện chưa còn vé không chọn ghế.
                </p>
              )}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {filteredEvents.map((event) => {
                  const active = event.id === selectedEventId
                  const image = event.banner_url || event.thumbnail_url
                  const available = event.ticket_types.reduce((sum, ticketType) => sum + Number(ticketType.available_quantity || 0), 0)
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => {
                        setSelectedEventId(event.id)
                        setSelectedSessionId(event.sessions?.[0]?.id || '')
                        setSelectedSeatIds([])
                        setQuantities({})
                      }}
                      className={`flex h-full flex-col overflow-hidden rounded-lg border text-left transition ${
                        active ? 'border-primary bg-primary/10' : 'border-border-soft/40 bg-panel-soft hover:border-primary/60'
                      }`}
                    >
                      <div className="h-28 shrink-0 bg-surface">
                        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="line-clamp-2 min-h-12 break-words font-bold leading-6 text-content">{event.title}</h3>
                        <p className="mt-2 text-xs text-subtle">{formatDateTime(event.start_time)}</p>
                        <div className="mt-auto flex flex-wrap gap-2 pt-3">
                          <Badge tone="green">{available} vé còn lại</Badge>
                          <Badge tone="blue">{event.ticket_types.length} loại vé</Badge>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </StaffPanel>

            <StaffPanel>
              <SectionTitle step="2" title="Thông tin khách hàng" />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input label="Họ tên" value={buyer.name} onChange={(value) => setBuyer((current) => ({ ...current, name: value }))} />
                <Input label="Số điện thoại" value={buyer.phone} onChange={(value) => setBuyer((current) => ({ ...current, phone: value }))} />
                <Input
                  label="Email nhận vé"
                  value={buyer.email}
                  onChange={(value) => setBuyer((current) => ({ ...current, email: value }))}
                  type="email"
                  required
                  hint="Bắt buộc để hệ thống gửi vé và mã QR cho khách."
                />
                <Input label="Ghi chú nội bộ" value={buyer.note} onChange={(value) => setBuyer((current) => ({ ...current, note: value }))} />
              </div>
            </StaffPanel>

            <StaffPanel>
              <SectionTitle step="3" title="Chọn loại vé và số lượng" />
              {!selectedEvent ? (
                <p className="mt-4 text-sm text-subtle">Chọn sự kiện trước để xem loại vé còn bán.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {selectedEvent.sessions?.length > 1 && (
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-subtle">Suất diễn</span>
                      <select
                        value={selectedSession?.id || ''}
                        onChange={(event) => {
                          setSelectedSessionId(event.target.value)
                          setSelectedSeatIds([])
                          setQuantities({})
                        }}
                        className="mt-2 h-11 w-full rounded-md border border-border-soft/50 bg-panel-soft px-3 text-sm font-bold text-content outline-none focus:border-primary"
                      >
                        {selectedEvent.sessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            {session.session_name || formatDateTime(session.start_time)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {currentTicketTypes.map((ticketType) => (
                    <div key={ticketType.id} className="grid gap-3 rounded-lg border border-border-soft/40 bg-panel-soft p-4 md:grid-cols-[minmax(0,1fr)_160px] md:items-center">
                      <div>
                        <h3 className="font-bold text-content">{ticketType.name}</h3>
                        <p className="mt-1 text-sm text-subtle">
                          {formatPrice(ticketType.price)} · còn {ticketType.available_quantity} vé
                          {ticketType.is_seated ? ' · chọn ghế trên sơ đồ' : ''}
                        </p>
                      </div>
                      {ticketType.is_seated ? (
                        <span className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-sm font-bold text-primary">
                          {selectedItems.find((item) => item.ticketType.id === ticketType.id)?.quantity || 0} ghế
                        </span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          max={ticketType.available_quantity}
                          value={quantities[ticketType.id] || ''}
                          onChange={(event) => updateQuantity(ticketType, event.target.value)}
                          className="h-11 rounded-md border border-border-soft/50 bg-surface px-3 text-right text-sm font-bold text-content outline-none focus:border-primary"
                        />
                      )}
                    </div>
                  ))}

                  {hasSeatedTickets && (
                    <div className="rounded-lg border border-border-soft/40 bg-panel-soft p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-content">Sơ đồ chỗ ngồi</h3>
                          <p className="mt-1 text-sm text-subtle">Bấm ghế trống để chọn chỗ cho khách.</p>
                        </div>
                        <Badge tone="blue">Đã chọn {selectedSeatIds.length} ghế</Badge>
                      </div>
                      {seatsQuery.isLoading && (
                        <div className="mt-4 flex items-center gap-2 text-sm text-subtle">
                          <Loader2 className="size-4 animate-spin" />
                          Đang tải sơ đồ ghế...
                        </div>
                      )}
                      {seatsQuery.isError && (
                        <p className="mt-4 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
                          Không thể tải sơ đồ ghế.
                        </p>
                      )}
                      {seatsQuery.data?.seats?.length > 0 && (
                        <div className="mt-4 overflow-auto rounded-lg border border-border-soft/40 bg-background/30 p-4">
                          <SeatMapCanvas
                            seats={seatsQuery.data.seats}
                            ticketTypes={currentTicketTypes}
                            selectedSeatIds={selectedSeatIds}
                            onToggleSeat={(seat) => {
                              setSelectedSeatIds((current) =>
                                current.includes(seat)
                                  ? current.filter((item) => item !== seat)
                                  : [...current, seat],
                              )
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </StaffPanel>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <StaffPanel>
              <SectionTitle step="4" title="Thanh toán" />
              <div className="mt-4 grid gap-2">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(method.value)
                      createMutation.reset()
                    }}
                    className={`flex items-center justify-between rounded-md border px-4 py-3 text-sm font-bold transition ${
                      paymentMethod === method.value ? 'border-primary bg-primary/10 text-primary' : 'border-border-soft/40 text-content hover:border-primary/60'
                    }`}
                  >
                    {method.label}
                    {paymentMethod === method.value ? <CheckCircle2 className="size-4" /> : null}
                  </button>
                ))}
              </div>
            </StaffPanel>

            <StaffPanel>
              <SectionTitle step="5" title="Xác nhận đơn đặt vé" />
              <div className="mt-4 space-y-3 text-sm">
                <SummaryLine label="Khách hàng" value={buyer.name || 'Chưa nhập'} />
                <SummaryLine label="Sự kiện" value={selectedEvent?.title || 'Chưa chọn'} />
                <SummaryLine label="Số vé" value={`${totalQuantity} vé`} />
                <SummaryLine label="Tổng tiền" value={formatPrice(totalAmount)} strong />
                {selectedItems.map((item) => (
                  <SummaryLine
                    key={item.ticketType.id}
                    label={item.ticketType.name}
                    value={`${item.quantity} x ${formatPrice(item.ticketType.price)}`}
                  />
                ))}
              </div>
              {paymentMethod === 'cash' && (
                <div className="mt-5 rounded-lg border border-border-soft/40 bg-panel-soft p-4">
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-subtle">Số tiền khách đưa</span>
                    <input
                      inputMode="numeric"
                      value={cashReceived}
                      onChange={(event) => setCashReceived(event.target.value)}
                      placeholder="Nhập số tiền"
                      className="mt-2 h-11 w-full rounded-md border border-border-soft/50 bg-surface px-3 text-right text-sm font-extrabold text-content outline-none focus:border-primary"
                    />
                  </label>
                  <div className="mt-4 space-y-2 text-sm">
                    <SummaryLine label="Khách đưa" value={formatPrice(cashReceivedAmount)} />
                    <SummaryLine label="Tiền thối" value={formatPrice(cashChange)} strong />
                  </div>
                  {!cashIsEnough && (
                    <p className="mt-3 text-sm font-semibold text-warning">
                      Số tiền khách đưa chưa đủ để thanh toán.
                    </p>
                  )}
                </div>
              )}
              {createMutation.isError && (
                <p className="mt-4 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
                  {createMutation.error?.response?.data?.message || 'Không thể tạo đơn đặt vé trực tiếp.'}
                </p>
              )}
              <button
                type="button"
                onClick={submitBooking}
                disabled={!canSubmit || createMutation.isPending}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ReceiptText className="size-4" />}
                {paymentMethod === 'bank_transfer'
                  ? 'Tạo thanh toán PayOS'
                  : paymentMethod === 'cash'
                    ? 'Đã thanh toán - xuất vé'
                    : 'Xác nhận đã thanh toán'}
              </button>
            </StaffPanel>
          </aside>
        </div>
      )}
    </StaffPage>
  )
}

function BookingResult({ result, showDetail, setShowDetail, resetForm, onRefresh, refreshing }) {
  const quantity = result.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const isPendingPayos = result.order.status === 'PENDING'
  const canPrint = result.order.status === 'PAID' && result.tickets.length > 0
  return (
    <div className="space-y-5">
      <StaffPanel className="no-print">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={isPendingPayos ? 'yellow' : 'green'}>{paymentStatusLabel(result.order.status)}</Badge>
              <Badge tone="blue">{BOOKING_SOURCE_LABELS[result.order.booking_source] || 'Nguồn đặt vé khác'}</Badge>
            </div>
            <h2 className="mt-3 font-display text-2xl font-extrabold text-content">{result.order.order_code}</h2>
            <p className="mt-1 text-sm text-subtle">
              {result.order.buyer_name} · {result.event.title}
            </p>
            <p className="mt-2 text-sm font-semibold text-content">
              {result.confirmation_email_sent === false
                ? `Chưa thể gửi vé tới ${result.order.buyer_email}. Vui lòng kiểm tra cấu hình email.`
                : isPendingPayos
                ? `Vé sẽ được gửi tới ${result.order.buyer_email} sau khi thanh toán thành công.`
                : `Vé và mã QR được gửi tự động tới ${result.order.buyer_email}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!canPrint}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-extrabold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="size-4" />
              In vé
            </button>
            {isPendingPayos && (
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border-soft/50 px-4 py-2 text-sm font-bold text-content hover:border-primary hover:text-primary"
              >
                <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
                Kiểm tra PayOS
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowDetail((current) => !current)}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border-soft/50 px-4 py-2 text-sm font-bold text-content hover:border-primary hover:text-primary"
            >
              <ReceiptText className="size-4" />
              Xem chi tiết đơn đặt vé
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border-soft/50 px-4 py-2 text-sm font-bold text-content hover:border-primary hover:text-primary"
            >
              <RotateCcw className="size-4" />
              Tạo đơn đặt vé mới
            </button>
          </div>
        </div>
        {showDetail && (
          <div className="mt-5 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <SummaryBox label="Tên khách hàng" value={result.order.buyer_name} icon={UserRound} />
            <SummaryBox label="Loại vé" value={result.items.map((item) => item.ticket_type_name).join(', ')} icon={Ticket} />
            <SummaryBox label="Số lượng" value={`${quantity} vé`} icon={Ticket} />
            <SummaryBox label="Tổng tiền" value={formatPrice(result.order.total_amount)} icon={ReceiptText} />
          </div>
        )}
      </StaffPanel>

      {isPendingPayos && (
        <StaffPanel className="no-print">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
            <div>
              <h3 className="font-display text-xl font-extrabold text-content">Chờ thanh toán PayOS</h3>
              <p className="mt-2 text-sm text-subtle">
                Vé sẽ chỉ được sinh sau khi PayOS xác nhận giao dịch thành công.
              </p>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <SummaryLine label="Mã đơn đặt vé" value={result.order.order_code} />
                <SummaryLine label="Số tiền" value={formatPrice(result.payment.amount || result.order.total_amount)} strong />
                <SummaryLine label="Trạng thái" value={paymentStatusLabel(result.payment.status || result.order.status)} />
                <SummaryLine label="Khách hàng" value={result.order.buyer_name} />
              </div>
              {result.payment.checkout_url && (
                <a
                  href={result.payment.checkout_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-extrabold text-slate-950"
                >
                  <ExternalLink className="size-4" />
                  Mở trang PayOS
                </a>
              )}
            </div>
            <div className="mx-auto w-fit rounded-lg bg-white p-4">
              {result.payment.qr_code ? (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(result.payment.qr_code)}`}
                  alt="QR PayOS"
                  className="size-56"
                />
              ) : (
                <div className="grid size-56 place-items-center text-center text-sm font-semibold text-slate-500">
                  Đang chờ PayOS trả QR
                </div>
              )}
            </div>
          </div>
        </StaffPanel>
      )}

      {canPrint && <div className="direct-booking-print grid gap-5 xl:grid-cols-2">
        {result.tickets.map((ticket) => (
          <article key={ticket.id} className="direct-booking-ticket overflow-hidden rounded-xl border border-white/10 bg-[#101a33] text-white shadow-2xl shadow-slate-950/30">
            <div className="ticket-print-header flex items-center justify-between gap-4 border-b border-white/10 bg-[#0f172a] px-5 py-3">
              <img src="/images/LogoEH.png" alt="EventHub" className="ticket-print-logo h-10 w-44 object-contain object-left" />
              <span className="ticket-print-status rounded-full bg-success/15 px-3 py-1 text-[11px] font-extrabold uppercase text-success">Hợp lệ</span>
            </div>
            <div className="ticket-print-hero relative min-h-40 overflow-hidden">
              {(ticket.event.banner_url || ticket.event.thumbnail_url) ? (
                <img src={ticket.event.banner_url || ticket.event.thumbnail_url} alt="" className="ticket-print-banner absolute inset-0 h-full w-full object-cover opacity-65" />
              ) : (
                <div className="ticket-print-banner absolute inset-0 bg-[#101a33]" />
              )}
              <div className="ticket-print-gradient absolute inset-0 bg-gradient-to-t from-[#101a33] via-[#101a33]/60 to-transparent" />
              <div className="ticket-print-hero-content relative flex min-h-40 flex-col justify-end p-5">
                <span className="ticket-print-type w-fit rounded-full bg-white/10 px-3 py-1 text-[11px] font-extrabold uppercase text-slate-200">{ticket.ticket_type.name}</span>
                <h3 className="ticket-print-title mt-3 line-clamp-2 font-display text-2xl font-black leading-tight text-white">{ticket.event.title}</h3>
              </div>
            </div>
            <div className="space-y-5 p-5">
              <div className="ticket-print-details grid grid-cols-2 gap-4 text-sm">
                <PrintInfo label="Khách hàng" value={result.order.buyer_name} />
                <PrintInfo label="Email người mua" value={result.order.buyer_email} />
                <PrintInfo label="Loại vé" value={ticket.ticket_type.name} />
                <PrintInfo label="Ghế ngồi" value={ticket.seat?.label || 'Free seating'} />
                <PrintInfo label="Thời gian" value={formatDateTime(ticket.session.start_time)} />
                <PrintInfo label="Mã đơn đặt vé" value={result.order.order_code} />
                <PrintInfo label="Địa điểm" value={venueLine(ticket.venue)} wide />
              </div>
              <div className="ticket-print-separator relative border-t border-dashed border-white/10 pt-5 text-center before:absolute before:-left-8 before:top-0 before:size-6 before:-translate-y-1/2 before:rounded-full before:bg-white after:absolute after:-right-8 after:top-0 after:size-6 after:-translate-y-1/2 after:rounded-full after:bg-white">
                <div className="ticket-print-qr mx-auto w-fit rounded-xl bg-white p-3 shadow-[0_0_38px_rgba(147,197,253,0.35)]">
                  <img src={qrImageSrc(ticket)} alt="Mã QR soát vé" className="size-40 rounded-md" />
                </div>
                <p className="ticket-print-code mt-4 font-mono text-sm font-black tracking-wide text-white">{ticket.ticket_code}</p>
              </div>
            </div>
          </article>
        ))}
      </div>}
    </div>
  )
}

function SectionTitle({ step, title }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 place-items-center rounded-full bg-primary/15 text-sm font-extrabold text-primary">{step}</span>
      <h2 className="font-display text-lg font-extrabold text-content">{title}</h2>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text', required = false, hint }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-subtle">
        {label}{required ? ' *' : ''}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-md border border-border-soft/50 bg-panel-soft px-3 text-sm text-content outline-none transition focus:border-primary"
      />
      {hint ? <span className="mt-2 block text-xs text-subtle">{hint}</span> : null}
    </label>
  )
}

function SummaryLine({ label, value, strong }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-subtle">{label}</span>
      <span className={`text-right ${strong ? 'font-extrabold text-primary' : 'font-bold text-content'}`}>{value}</span>
    </div>
  )
}

function SummaryBox({ label, value, icon: Icon }) {
  return (
    <div className="rounded-lg border border-border-soft/40 bg-panel-soft p-4">
      <Icon className="size-4 text-primary" />
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 line-clamp-2 font-bold text-content">{value}</p>
    </div>
  )
}

function PrintInfo({ label, value, wide }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-subtle print:text-slate-500">{label}</p>
      <p className="mt-1 font-bold">{value || 'Không có'}</p>
    </div>
  )
}

// Legend: chú thích màu ghế — giống customer booking
function SeatLegend({ seats }) {
  const zones = useMemo(() => {
    const zoneMap = new Map()
    for (const seat of seats || []) {
      const color = seat.zone?.color || seat.seat_type?.color
      const name = seat.zone?.name || seat.seat_type?.name
      if (color && name && !zoneMap.has(name)) {
        zoneMap.set(name, color)
      }
    }
    return [...zoneMap.entries()]
  }, [seats])

  return (
    <div className="flex flex-wrap gap-4 text-xs font-semibold text-subtle">
      <span className="inline-flex items-center gap-2">
        <span className="size-3 rounded-sm border border-border-soft bg-panel-soft" />
        Còn trống
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="size-3 rounded-sm border border-orange-400 bg-orange-400" />
        Đang chọn
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="size-3 rounded-sm border border-slate-700 bg-slate-700" />
        Đã giữ/bán
      </span>
      {zones.map(([name, color]) => (
        <span key={name} className="inline-flex items-center gap-2">
          <span className="size-3 rounded-sm border" style={{ borderColor: color, backgroundColor: `${color}40` }} />
          {name}
        </span>
      ))}
    </div>
  )
}

function SeatMapCanvas({ seats, ticketTypes, selectedSeatIds, onToggleSeat }) {
  const seatWidth = calcSeatWidth(seats)
  // Tính spacing thực tế trong xy layout để ghế không overlap và đủ chỗ hiện label
  const xSpacing = calcXSpacing(seats)
  // xyWidth = min(spacing - 2, seatWidth dựa trên label) để luôn hiện đủ chữ
  const xyWidth = xSpacing ? Math.min(xSpacing - 2, Math.max(seatWidth, xSpacing - 2)) : seatWidth
  const xyLayout = buildXYLayout(seats, xyWidth)

  const renderSeat = (seat, overrideWidth, style = {}) => {
    const id = seat.session_seat_id
    const selected = selectedSeatIds.includes(id)
    const status = seat.is_disabled ? SEAT_STATUS.BLOCKED : (seat.status || SEAT_STATUS.AVAILABLE)
    const clickable = isClickable(status, selected)
    const label = getSeatLabel(seat)
    const zoneColor = seat.zone?.color || seat.seat_type?.color
    const w = overrideWidth || seatWidth

    const mappedTicketTypeIds = seat.ticket_type_ids || []
    const ticketType = mappedTicketTypeIds.length
      ? ticketTypes.find((type) => mappedTicketTypeIds.some((mappedId) => String(mappedId) === String(type.id)))
      : ticketTypes.find((type) => type.is_seated)

    const statusLabel = {
      AVAILABLE: 'Trống',
      SOLD: 'Đã bán',
      BOOKED: 'Đã đặt',
      HELD: 'Đang giữ',
      RESERVED: 'Đặt trước',
      BLOCKED: 'Khoá',
      MAINTENANCE: 'Bảo trì',
      DISABLED: 'Khoá',
    }[status] || status

    const tooltipText = `${label} - ${statusLabel}${ticketType ? ` (${ticketType.name})` : ''}${seat.zone?.name ? ` · ${seat.zone.name}` : ''}`

    // Zone color KHÔNG override border/text — chỉ dùng cho dải đáy (giống customer booking)
    // Ghế bán/held/blocked: xám hoàn toàn, không hiện zone

    return (
      <button
        key={id}
        type="button"
        disabled={!clickable}
        onClick={() => clickable && onToggleSeat(id)}
        title={tooltipText}
        style={{ width: w, height: SEAT_HEIGHT, flexShrink: 0, ...style }}
        className={`rounded-md border font-bold transition ${getSeatStatusClass(status, selected)}`}
      >
        <span
          className="block truncate px-0.5 leading-4"
          style={{ fontSize: w >= 36 ? '10px' : '9px' }}
        >
          {label}
        </span>
        {/* Dải màu zone ở đáy — CHỈ khi available và không đang chọn */}
        {!selected && status === SEAT_STATUS.AVAILABLE && zoneColor && (
          <span
            className="mx-auto block rounded-full"
            style={{ backgroundColor: zoneColor, height: 2, width: Math.max(4, w - 8), marginTop: 1 }}
          />
        )}
      </button>
    )
  }

  // Render theo tọa độ x,y thực tế — giữ spacing gốc của designer
  if (xyLayout) {
    return (
      <div className="space-y-3">
        <SeatLegend seats={seats} />
        <div
          className="relative rounded-lg border border-border-soft/40 bg-background/40"
          style={{ width: xyLayout.width, height: xyLayout.height, minWidth: 360 }}
        >
          {/* Sân khấu */}
          <div
            className="absolute left-1/2 top-4 -translate-x-1/2 rounded-b-2xl bg-gradient-to-r from-primary/80 via-sky-300 to-primary/80 text-center text-xs font-extrabold leading-10 text-slate-950 shadow-lg shadow-primary/20"
            style={{
              height: STAGE_HEIGHT,
              width: Math.min(Math.max(xyLayout.width * 0.7, 260), 600),
            }}
          >
            SÂN KHẤU
          </div>
          {seats.map((seat) => {
            const position = xyLayout.positions.get(seatId(seat))
            if (!position) return null
            // Trong xy layout: dùng xyWidth (đã tính từ spacing thực tế)
            return renderSeat(seat, xyWidth, {
              position: 'absolute',
              left: position.left,
              top: position.top,
            })
          })}
        </div>
      </div>
    )
  }

  // Fallback: render theo row + column thực tế, dùng dynamic seatWidth để hiện đủ label
  const rows = buildRowColLayout(seats)

  return (
    <div className="space-y-3">
      <SeatLegend seats={seats} />
      <div className="w-max rounded-lg border border-border-soft/40 bg-background/40 p-4">
        {/* Sân khấu */}
        <div className="mb-6 flex justify-center">
          <div
            className="rounded-b-2xl bg-gradient-to-r from-primary/80 via-sky-300 to-primary/80 px-12 py-2 text-xs font-extrabold text-slate-950 shadow-lg shadow-primary/20"
            style={{ minWidth: 200 }}
          >
            SÂN KHẤU
          </div>
        </div>
        {/* Các dãy ghế */}
        <div className="space-y-1.5">
          {rows.map(({ rowLabel, seats: rowSeats }) => (
            <div key={rowLabel} className="flex items-center gap-2">
              {/* Nhãn hàng */}
              <span className="w-6 shrink-0 text-right text-[10px] font-bold text-subtle">{rowLabel}</span>
              {/* Ghế trong hàng */}
              <div className="flex gap-1.5">
                {rowSeats.map((seat) => renderSeat(seat, seatWidth))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
