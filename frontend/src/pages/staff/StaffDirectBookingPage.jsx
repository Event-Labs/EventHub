import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, CircleCheck, ExternalLink, Gift, Info, Loader2, Mail, MapPin, Minus, Phone, Plus, Printer, ReceiptText, RefreshCw, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Ticket, UserRound, UsersRound } from 'lucide-react'
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
  const [isReviewing, setIsReviewing] = useState(false)

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
  const hasSelectedItems = selectedItems.length > 0
  const isFreeSelection = hasSelectedItems && totalAmount === 0
  const cashReceivedAmount = Number(String(cashReceived).replace(/[^\d]/g, '') || 0)
  const cashChange = Math.max(0, cashReceivedAmount - totalAmount)
  const cashIsEnough = paymentMethod !== 'cash' || totalAmount === 0 || cashReceivedAmount >= totalAmount
  const buyerEmail = buyer.email.trim().toLowerCase()
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)
  const phoneIsValid = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/.test(buyer.phone.trim())
  const phoneError = buyer.phone.trim() && !phoneIsValid ? 'Số điện thoại không đúng định dạng.' : ''
  const emailError = buyer.email.trim() && !emailIsValid ? 'Email không đúng định dạng.' : ''
  const canReview = selectedEvent && buyer.name.trim().length >= 2 && phoneIsValid && emailIsValid && selectedItems.length > 0
  const canSubmit = canReview && cashIsEnough

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
    setIsReviewing(false)
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
      className="direct-booking-page"
      title={isReviewing ? null : 'Đặt vé trực tiếp'}
      description={isReviewing ? null : 'Chọn vé, tính tạm và kiểm tra lại trước khi nhận thanh toán và xuất vé cho khách.'}
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
      ) : isReviewing ? (
        <BookingReview
          buyer={buyer}
          selectedEvent={selectedEvent}
          selectedSession={selectedSession}
          selectedItems={selectedItems}
          totalQuantity={totalQuantity}
          totalAmount={totalAmount}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          cashReceived={cashReceived}
          setCashReceived={setCashReceived}
          cashReceivedAmount={cashReceivedAmount}
          cashChange={cashChange}
          cashIsEnough={cashIsEnough}
          canSubmit={canSubmit}
          createMutation={createMutation}
          onBack={() => {
            setIsReviewing(false)
            createMutation.reset()
          }}
          onConfirm={submitBooking}
        />
      ) : (
        <div className="mx-auto grid max-w-[1280px] gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
          <div className="space-y-5">
            <StaffPanel className="border-sky-900/45 bg-[linear-gradient(145deg,rgba(8,20,44,0.88),rgba(10,24,53,0.72))] p-5 sm:p-6">
              <SectionTitle step="1" title="Chọn sự kiện đang mở bán" />
              <div className="mt-5 flex gap-3">
                <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm sự kiện"
                  className="h-11 w-full rounded-lg border border-sky-900/60 bg-sky-950/30 pl-10 pr-3 text-sm text-content outline-none transition focus:border-violet-400"
                />
                </div>
                <button type="button" className="grid size-11 shrink-0 place-items-center rounded-lg border border-sky-900/60 bg-sky-950/30 text-subtle transition hover:border-violet-400 hover:text-content" aria-label="Bộ lọc sự kiện">
                  <SlidersHorizontal className="size-4" />
                </button>
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
              <div className="mt-4 grid gap-3">
                {filteredEvents.map((event) => {
                  const active = event.id === selectedEventId
                  const image = event.banner_url || event.thumbnail_url
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
                      className={`flex min-h-40 items-stretch gap-4 overflow-hidden rounded-lg border p-2 text-left transition sm:gap-5 sm:p-3 ${
                        active ? 'border-violet-500 bg-violet-500/[0.06] shadow-[0_0_0_1px_rgba(139,92,246,0.2)]' : 'border-sky-900/50 bg-sky-950/25 hover:border-violet-400/70'
                      }`}
                    >
                      <div className="h-32 w-40 shrink-0 overflow-hidden rounded-md bg-surface sm:h-36 sm:w-56">
                        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-sky-950" />}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-center py-2 pr-2">
                        <h3 className="line-clamp-2 break-words font-display text-lg font-black leading-6 text-content">{event.title}</h3>
                        <p className="mt-3 flex items-center gap-2 text-xs text-subtle"><CalendarDays className="size-3.5" />{formatDateTime(event.start_time)}</p>
                        <p className="mt-2 flex items-center gap-2 text-xs text-subtle"><MapPin className="size-3.5" />{venueLine(event.venue)}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge tone="green">Đang mở bán</Badge>
                          <Badge tone="orange">{event.ticket_types.length} loại vé</Badge>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </StaffPanel>

            <StaffPanel className="border-sky-900/45 bg-[linear-gradient(145deg,rgba(8,20,44,0.88),rgba(10,24,53,0.72))] p-5 sm:p-6">
              <SectionTitle step="2" title="Thông tin khách hàng" />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input label="Họ và tên" value={buyer.name} onChange={(value) => setBuyer((current) => ({ ...current, name: value }))} required hint="Nhập họ và tên" />
                <Input label="Số điện thoại" value={buyer.phone} onChange={(value) => setBuyer((current) => ({ ...current, phone: value }))} required hint="Nhập số điện thoại" error={phoneError} />
                <Input
                  label="Email nhận vé"
                  value={buyer.email}
                  onChange={(value) => setBuyer((current) => ({ ...current, email: value }))}
                  type="email"
                  required
                  hint="Nhập email"
                  error={emailError}
                />
                <Input label="Ghi chú" value={buyer.note} onChange={(value) => setBuyer((current) => ({ ...current, note: value }))} hint="Nhập ghi chú nếu có" />
              </div>
              <p className="mt-4 text-xs text-subtle">Thông tin này sẽ được gửi về hóa đơn cho khách hàng.</p>
            </StaffPanel>

            <StaffPanel className="border-sky-900/45 bg-[linear-gradient(145deg,rgba(8,20,44,0.88),rgba(10,24,53,0.72))] p-5 sm:p-6">
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
                    <div key={ticketType.id} className={`grid gap-3 rounded-lg border p-4 transition md:grid-cols-[minmax(0,1fr)_160px] md:items-center ${
                      selectedItems.some((item) => item.ticketType.id === ticketType.id)
                        ? 'border-violet-500 bg-violet-500/[0.06]'
                        : 'border-sky-900/50 bg-sky-950/25 hover:border-violet-400/60'
                    }`}>
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 grid size-5 shrink-0 place-items-center rounded-full border ${
                          selectedItems.some((item) => item.ticketType.id === ticketType.id) ? 'border-violet-400 bg-violet-500/20 text-violet-300' : 'border-slate-500 text-transparent'
                        }`}><span className="size-2 rounded-full bg-violet-400" /></span>
                        <div>
                          <h3 className="font-bold text-content">{ticketType.name}</h3>
                          <p className="mt-1 text-sm text-subtle">
                            {formatPrice(ticketType.price)} · {ticketType.is_seated ? 'chọn ghế' : 'vé tự do'} · còn {ticketType.available_quantity} vé
                          </p>
                        </div>
                      </div>
                      {ticketType.is_seated ? (
                        <span className="rounded-lg border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-center text-sm font-bold text-violet-200">
                          {selectedItems.find((item) => item.ticketType.id === ticketType.id)?.quantity || 0} ghế
                        </span>
                      ) : (
                        <div className="flex h-10 items-center justify-end">
                          <button type="button" onClick={() => updateQuantity(ticketType, Number(quantities[ticketType.id] || 0) - 1)} className="grid size-9 place-items-center rounded-l-lg border border-sky-800 bg-sky-950/50 text-subtle hover:text-content"><Minus className="size-4" /></button>
                          <span className="grid h-9 min-w-10 place-items-center border-y border-sky-800 bg-sky-950/50 text-sm font-bold text-content">{quantities[ticketType.id] || 0}</span>
                          <button type="button" onClick={() => updateQuantity(ticketType, Number(quantities[ticketType.id] || 0) + 1)} className="grid size-9 place-items-center rounded-r-lg border border-sky-800 bg-sky-950/50 text-subtle hover:text-content"><Plus className="size-4" /></button>
                        </div>
                      )}
                    </div>
                  ))}

                  {hasSeatedTickets && (
                    <div className="rounded-lg border border-sky-900/50 bg-sky-950/20 p-4">
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
                        <div className="mt-4 overflow-auto rounded-lg border border-sky-900/50 bg-slate-950/25 p-4">
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

          <aside className="xl:sticky xl:top-24 xl:self-start">
            <StaffPanel className="border-sky-900/45 bg-[linear-gradient(145deg,rgba(8,20,44,0.92),rgba(10,24,53,0.78))] p-5 sm:p-6">
              <SectionTitle step="4" title="Tóm tắt đơn đặt vé" />
              <div className="mt-6 space-y-5 text-sm">
                <div>
                  <p className="text-xs font-semibold text-subtle">Sự kiện</p>
                  <p className="mt-3 font-extrabold leading-6 text-content">{selectedEvent?.title || 'Chưa chọn sự kiện'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-subtle">Thời gian</p>
                  <p className="mt-3 font-semibold text-content">{selectedSession ? formatDateTime(selectedSession.start_time) : 'Chưa chọn suất diễn'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-subtle">Khu vực</p>
                  <p className="mt-3 font-semibold text-content">{selectedItems[0]?.ticketType?.name || 'Chưa chọn loại vé'}</p>
                </div>
              </div>

              <div className="my-6 border-t border-sky-900/50" />
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-extrabold text-content">Chi tiết vé</h3>
                <span className="rounded-lg border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-xs font-bold text-violet-200">{totalQuantity} vé</span>
              </div>
              <div className="mt-4 space-y-3">
                {selectedItems.length === 0 ? <p className="text-sm text-subtle">Chưa chọn vé</p> : selectedItems.map((item) => (
                  <div key={item.ticketType.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-subtle">{item.ticketType.name}</span>
                    <span className="text-right font-semibold text-content">{item.quantity} x {formatPrice(item.ticketType.price)}</span>
                  </div>
                ))}
              </div>

              <div className="my-6 border-t border-sky-900/50" />
              <div className="flex items-center justify-between gap-3">
                <span className="font-extrabold text-content">Tổng tiền</span>
                <span className="font-display text-2xl font-black text-violet-400">{hasSelectedItems ? formatPrice(totalAmount) : '0 đ'}</span>
              </div>
              {isFreeSelection && <span className="mt-3 ml-auto block w-fit rounded-lg border border-violet-400/40 bg-violet-500/15 px-3 py-1 text-xs font-bold text-violet-200">Miễn phí</span>}

              <p className="mt-6 flex gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-3 text-xs leading-5 text-violet-200">
                <Info className="mt-0.5 size-4 shrink-0 text-violet-400" />
                {isFreeSelection ? 'Vé miễn phí sẽ được gửi qua email cho khách hàng sau khi xác nhận.' : 'Chưa thu tiền và chưa xuất vé. Hãy kiểm tra lại trước khi tiếp tục.'}
              </p>
              <button
                type="button"
                onClick={() => setIsReviewing(true)}
                disabled={!canReview}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-orange-950/30 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CircleCheck className="size-4" />
                Xác nhận và xem lại vé
              </button>
            </StaffPanel>
          </aside>
        </div>
      )}
    </StaffPage>
  )
}

function BookingReview({
  buyer,
  selectedEvent,
  selectedSession,
  selectedItems,
  totalQuantity,
  totalAmount,
  paymentMethod,
  setPaymentMethod,
  cashReceived,
  setCashReceived,
  cashReceivedAmount,
  cashChange,
  cashIsEnough,
  canSubmit,
  createMutation,
  onBack,
  onConfirm,
}) {
  const isFree = selectedItems.length > 0 && totalAmount === 0
  const confirmLabel = paymentMethod === 'bank_transfer'
    ? 'Tạo mã thanh toán'
    : isFree
      ? 'Xác nhận xuất vé'
      : 'Xác nhận đã thanh toán và xuất vé'

  return (
    <div className="mx-auto max-w-[1280px]">
      <button
        type="button"
        onClick={onBack}
        disabled={createMutation.isPending}
        className="no-print inline-flex items-center gap-2 text-sm font-semibold text-subtle transition hover:text-content disabled:opacity-50"
      >
        <ArrowLeft className="size-4" />
        Quay lại chỉnh sửa
      </button>

      <div className="mt-5">
        <h2 className="font-display text-3xl font-black tracking-tight text-content">Xem lại vé đã chọn</h2>
        <p className="mt-2 text-base text-subtle">Kiểm tra thông tin vé và khách hàng trước khi xác nhận thanh toán và xuất vé.</p>
      </div>

      <div className="mt-7 grid items-start gap-7 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-sky-900/45 bg-[linear-gradient(145deg,rgba(8,20,44,0.88),rgba(10,24,53,0.72))] shadow-[0_18px_55px_rgba(0,0,0,0.24)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-900/40 px-5 py-5 sm:px-7">
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-emerald-400">
              Đơn tạm · Chưa thanh toán
            </span>
            <span className="rounded-full border border-orange-400/35 bg-orange-400/10 px-3 py-1 text-xs font-extrabold uppercase text-orange-400">
              {totalQuantity} vé
            </span>
          </div>

          <div className="border-b border-sky-900/40 px-5 py-6 sm:px-7">
            <h3 className="font-display text-xl font-extrabold text-content">Thông tin khách hàng</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ReviewInfoCard icon={UserRound} label="Khách hàng" value={buyer.name} />
              <ReviewInfoCard icon={Mail} label="Email nhận vé" value={buyer.email} />
              <ReviewInfoCard icon={Phone} label="Số điện thoại" value={buyer.phone} />
              <ReviewInfoCard icon={CalendarDays} label="Sự kiện" value={selectedEvent?.title} />
            </div>
          </div>

          <div className="px-5 py-6 sm:px-7">
            <h3 className="font-display text-xl font-extrabold text-content">Thông tin vé</h3>
            <div className="mt-4 overflow-hidden rounded-xl border border-sky-900/45 bg-sky-950/25">
              <ReviewTicketRow label="Suất diễn" value={selectedSession?.session_name || formatDateTime(selectedSession?.start_time)} />
              {selectedItems.map((item) => (
                <ReviewTicketRow
                  key={item.ticketType.id}
                  label="Loại vé"
                  value={`${item.quantity} x ${item.ticketType.name}`}
                />
              ))}
              <div className="flex items-center justify-between gap-4 bg-sky-900/20 px-4 py-4 text-sm sm:px-5">
                <span className="font-extrabold text-content">Tổng tạm tính</span>
                <div className="flex items-center gap-3">
                  <span className="text-base font-black text-content">{isFree ? '0 đ' : formatPrice(totalAmount)}</span>
                  {isFree && (
                    <span className="rounded-full border border-emerald-400/25 bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-300">
                      Miễn phí
                    </span>
                  )}
                </div>
              </div>
            </div>

            {buyer.note ? (
              <div className="mt-4 rounded-xl border border-sky-900/40 bg-sky-950/20 px-4 py-3 text-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-subtle">Ghi chú nội bộ</p>
                <p className="mt-1 whitespace-pre-wrap text-content">{buyer.note}</p>
              </div>
            ) : null}

            {isFree && (
              <div className="mt-5 flex gap-3 rounded-xl border border-violet-500/35 bg-violet-500/10 px-4 py-4 text-sm text-violet-200">
                <Info className="mt-0.5 size-5 shrink-0 text-violet-400" />
                <p>Vé miễn phí không cần thanh toán. Vui lòng kiểm tra thông tin trước khi xác nhận xuất vé.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="xl:sticky xl:top-24">
          <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-sky-400 p-px shadow-[0_20px_70px_rgba(79,70,229,0.2)]">
            <section className="rounded-[15px] bg-[linear-gradient(145deg,rgba(7,18,40,0.98),rgba(9,27,57,0.98))] p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-violet-600/25 font-black text-violet-200">5</span>
                <h3 className="font-display text-2xl font-black text-content">Xác nhận xuất vé</h3>
              </div>

              <div className="mt-6 space-y-3">
                <ConfirmStep
                  icon={CircleCheck}
                  tone="green"
                  title="Kiểm tra thông tin"
                  description="Đảm bảo thông tin khách hàng và vé chính xác."
                  marker={<CircleCheck className="size-6 text-emerald-400" />}
                />
                <ConfirmStep
                  icon={UsersRound}
                  tone="purple"
                  title="Xác nhận xuất vé"
                  description="Vé sẽ được xuất và gửi đến email của khách."
                  marker="2"
                />
              </div>

              {isFree ? (
                <div className="mt-6 flex gap-3 rounded-xl border border-orange-400/20 bg-orange-400/[0.08] px-4 py-4">
                  <Gift className="mt-0.5 size-6 shrink-0 text-orange-400" />
                  <div>
                    <p className="font-extrabold text-content">Vé miễn phí</p>
                    <p className="mt-1 text-sm leading-6 text-subtle">Vé không mất phí. Sau khi xác nhận, vé sẽ được gửi qua email cho khách hàng.</p>
                  </div>
                </div>
              ) : (
                <div className="mt-6">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-subtle">Phương thức thanh toán</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        key={method.value}
                        type="button"
                        disabled={createMutation.isPending}
                        onClick={() => {
                          setPaymentMethod(method.value)
                          createMutation.reset()
                        }}
                        className={`rounded-xl border px-2 py-3 text-xs font-extrabold transition ${
                          paymentMethod === method.value
                            ? 'border-violet-400 bg-violet-500/15 text-violet-200'
                            : 'border-sky-900/50 bg-sky-950/25 text-subtle hover:border-violet-400/60 hover:text-content'
                        }`}
                      >
                        {method.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!isFree && paymentMethod === 'cash' && (
                <div className="mt-5 rounded-xl border border-sky-900/50 bg-sky-950/30 p-4">
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-subtle">Số tiền khách đưa</span>
                    <input
                      inputMode="numeric"
                      value={cashReceived}
                      onChange={(event) => setCashReceived(event.target.value)}
                      placeholder="Nhập số tiền"
                      className="mt-2 h-11 w-full rounded-lg border border-sky-900/60 bg-slate-950/35 px-3 text-right text-sm font-extrabold text-content outline-none transition focus:border-violet-400"
                    />
                  </label>
                  <div className="mt-4 space-y-2 text-sm">
                    <SummaryLine label="Khách đưa" value={formatPrice(cashReceivedAmount)} />
                    <SummaryLine label="Tiền thối" value={formatPrice(cashChange)} strong />
                  </div>
                  {!cashIsEnough && <p className="mt-3 text-sm font-semibold text-warning">Số tiền khách đưa chưa đủ để thanh toán.</p>}
                </div>
              )}

              {!isFree && paymentMethod !== 'cash' && (
                <div className="mt-5 rounded-xl border border-sky-900/45 bg-sky-950/25 px-4 py-3 text-sm leading-6 text-subtle">
                  {paymentMethod === 'bank_transfer'
                    ? 'Tạo mã để khách chuyển khoản. Vé chỉ được xuất sau khi PayOS xác nhận thanh toán.'
                    : 'Chỉ xác nhận xuất vé sau khi khách đã thanh toán bằng thẻ.'}
                </div>
              )}

              {createMutation.isError && (
                <p className="mt-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
                  {createMutation.error?.response?.data?.message || 'Không thể tạo đơn đặt vé trực tiếp.'}
                </p>
              )}

              <button
                type="button"
                onClick={onConfirm}
                disabled={!canSubmit || createMutation.isPending}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-4 text-base font-black text-white shadow-lg shadow-orange-950/30 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending ? <Loader2 className="size-5 animate-spin" /> : <Ticket className="size-5" />}
                {confirmLabel}
              </button>

              <p className="mt-5 flex items-center justify-center gap-2 text-xs text-subtle">
                <ShieldCheck className="size-4" />
                Thông tin được bảo mật tuyệt đối
              </p>
            </section>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ReviewInfoCard({ icon: Icon, label, value }) {
  return (
    <div className="flex min-h-24 items-center gap-4 rounded-xl border border-sky-900/45 bg-[linear-gradient(135deg,rgba(20,40,78,0.66),rgba(16,35,68,0.42))] px-4 py-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-violet-600/25 text-violet-300">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-subtle">{label}</p>
        <p className="mt-1 break-words text-sm font-bold leading-5 text-content">{value || 'Chưa cập nhật'}</p>
      </div>
    </div>
  )
}

function ReviewTicketRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-sky-900/40 px-4 py-3.5 text-sm last:border-0 sm:px-5">
      <span className="text-subtle">{label}</span>
      <span className="max-w-[70%] text-right font-semibold text-content">{value}</span>
    </div>
  )
}

function ConfirmStep({ icon: Icon, tone, title, description, marker }) {
  const isGreen = tone === 'green'
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-3.5 ${
      isGreen ? 'border-emerald-500/25 bg-emerald-500/[0.07]' : 'border-sky-900/50 bg-sky-950/25'
    }`}>
      <span className={`grid size-11 shrink-0 place-items-center rounded-full ${
        isGreen ? 'bg-emerald-500/25 text-emerald-300' : 'bg-violet-600/25 text-violet-300'
      }`}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold text-content">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-subtle">{description}</p>
      </div>
      {typeof marker === 'string' ? (
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-600/35 text-xs font-bold text-violet-200">{marker}</span>
      ) : marker}
    </div>
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
                <PrintInfo label="Ghế ngồi" value={ticket.seat?.label || 'Không có ghế cố định'} />
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

function Input({ label, value, onChange, type = 'text', required = false, hint, error = '' }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-subtle">
        {label}{required ? ' *' : ''}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={hint || ''}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 h-11 w-full rounded-lg border bg-sky-950/25 px-3 text-sm text-content outline-none transition placeholder:text-slate-500 focus:border-violet-400 ${error ? 'border-error/70' : 'border-sky-900/60'}`}
      />
      {error ? <span className="mt-2 block text-xs font-semibold text-error">{error}</span> : null}
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
