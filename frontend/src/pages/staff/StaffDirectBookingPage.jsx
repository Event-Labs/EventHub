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
  return [venue.name, venue.address_line, venue.district, venue.city].filter(Boolean).join(', ') || 'Địa điểm cập nhật sau'
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

const SEAT_WIDTH = 28
const SEAT_HEIGHT = 28
const SEAT_X_GAP = 8
const SEAT_LAYOUT_PADDING = 20
const STAGE_HEIGHT = 40
const STAGE_GAP = 28

function seatId(seat) {
  return String(seat?.session_seat_id || seat?.id || '')
}

function buildSeatLayout(seats) {
  const positioned = (seats || []).filter((seat) => Number.isFinite(Number(seat.x_position)) && Number.isFinite(Number(seat.y_position)))
  if (!positioned.length) return null

  const minX = Math.min(...positioned.map((seat) => Number(seat.x_position)))
  const minY = Math.min(...positioned.map((seat) => Number(seat.y_position)))
  const maxX = Math.max(...positioned.map((seat) => Number(seat.x_position)))
  const maxY = Math.max(...positioned.map((seat) => Number(seat.y_position)))
  const positions = new Map()

  positioned.forEach((seat) => {
    positions.set(seatId(seat), {
      left: Number(seat.x_position) - minX + SEAT_LAYOUT_PADDING,
      top: Number(seat.y_position) - minY + SEAT_LAYOUT_PADDING + STAGE_HEIGHT + STAGE_GAP,
    })
  })

  return {
    positions,
    width: Math.max(320, maxX - minX + SEAT_WIDTH + SEAT_LAYOUT_PADDING * 2),
    height: Math.max(220, maxY - minY + SEAT_HEIGHT + SEAT_LAYOUT_PADDING * 2 + STAGE_HEIGHT + STAGE_GAP),
  }
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
      toast.success('Đã tạo đơn đặt vé trực tiếp.')
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

  const events = eventsQuery.data || []
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
  const canSubmit = selectedEvent && buyer.name.trim().length >= 2 && buyer.phone.trim() && selectedItems.length > 0 && cashIsEnough

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
      buyer_email: buyer.email.trim() || null,
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
      title="Book vé trực tiếp"
      description="Tạo booking paid và in vé cho khách tại quầy."
      action={
        result ? (
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border-soft/50 px-4 py-2 text-sm font-bold text-content hover:border-primary hover:text-primary"
          >
            <RotateCcw className="size-4" />
            Tạo booking mới
          </button>
        ) : null
      }
    >
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .direct-booking-print, .direct-booking-print * { visibility: visible !important; }
          .direct-booking-print {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            padding: 0 !important;
            background: white !important;
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
                  const image = event.thumbnail_url || event.banner_url
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
                      className={`overflow-hidden rounded-lg border text-left transition ${
                        active ? 'border-primary bg-primary/10' : 'border-border-soft/40 bg-panel-soft hover:border-primary/60'
                      }`}
                    >
                      <div className="h-28 bg-surface">
                        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="p-4">
                        <h3 className="line-clamp-2 font-bold text-content">{event.title}</h3>
                        <p className="mt-2 text-xs text-subtle">{formatDateTime(event.start_time)}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
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
                <Input label="Email nếu có" value={buyer.email} onChange={(value) => setBuyer((current) => ({ ...current, email: value }))} />
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
                            colsCount={seatsQuery.data?.seat_map?.cols_count || 8}
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
              <SectionTitle step="5" title="Xác nhận booking" />
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
                  {createMutation.error?.response?.data?.message || 'Không thể tạo booking trực tiếp.'}
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
              <Badge tone={isPendingPayos ? 'yellow' : 'green'}>{result.order.status}</Badge>
              <Badge tone="blue">{result.order.booking_source}</Badge>
            </div>
            <h2 className="mt-3 font-display text-2xl font-extrabold text-content">{result.order.order_code}</h2>
            <p className="mt-1 text-sm text-subtle">
              {result.order.buyer_name} · {result.event.title}
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
              Xem chi tiết booking
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border-soft/50 px-4 py-2 text-sm font-bold text-content hover:border-primary hover:text-primary"
            >
              <RotateCcw className="size-4" />
              Tạo booking mới
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
                <SummaryLine label="Mã booking" value={result.order.order_code} />
                <SummaryLine label="Số tiền" value={formatPrice(result.payment.amount || result.order.total_amount)} strong />
                <SummaryLine label="Trạng thái" value={result.payment.status || result.order.status} />
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

      {canPrint && <div className="direct-booking-print grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {result.tickets.map((ticket) => (
          <article key={ticket.id} className="overflow-hidden rounded-xl border border-border-soft/40 bg-surface text-content shadow-lg print:break-inside-avoid print:border-slate-300 print:bg-white print:text-slate-950">
            <div className="relative h-32 overflow-hidden bg-panel-soft print:h-24 print:bg-slate-100">
              {(ticket.event.banner_url || ticket.event.thumbnail_url) && (
                <img src={ticket.event.banner_url || ticket.event.thumbnail_url} alt="" className="h-full w-full object-cover opacity-80 print:hidden" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent print:hidden" />
              <div className="absolute bottom-3 left-4 right-4">
                <Badge tone="green">PAID</Badge>
                <h3 className="mt-2 line-clamp-2 font-display text-lg font-extrabold text-white print:text-slate-950">{ticket.event.title}</h3>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <PrintInfo label="Khách hàng" value={result.order.buyer_name} />
                <PrintInfo label="Loại vé" value={ticket.ticket_type.name} />
                <PrintInfo label="Thời gian" value={formatDateTime(ticket.session.start_time)} />
                <PrintInfo label="Mã booking" value={result.order.order_code} />
                <PrintInfo label="Địa điểm" value={venueLine(ticket.venue)} wide />
              </div>
              <div className="border-t border-dashed border-border-soft/50 pt-4 text-center print:border-slate-300">
                <div className="mx-auto w-fit rounded-lg bg-white p-2">
                  <img src={qrImageSrc(ticket)} alt="QR check-in" className="size-36" />
                </div>
                <p className="mt-3 font-mono text-sm font-black tracking-wide">{ticket.ticket_code}</p>
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

function Input({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-subtle">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-md border border-border-soft/50 bg-panel-soft px-3 text-sm text-content outline-none transition focus:border-primary"
      />
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
      <p className="mt-1 font-bold">{value || 'N/A'}</p>
    </div>
  )
}

function SeatMapCanvas({ seats, ticketTypes, selectedSeatIds, onToggleSeat, colsCount }) {
  const metrics = buildSeatLayout(seats)

  const renderSeat = (seat, style = {}) => {
    const id = seat.session_seat_id
    const selected = selectedSeatIds.includes(id)
    const disabled = seat.status !== 'AVAILABLE' && !selected
    const mappedTicketTypeIds = seat.ticket_type_ids || []
    const ticketType = mappedTicketTypeIds.length
      ? ticketTypes.find((type) => mappedTicketTypeIds.some((mappedId) => String(mappedId) === String(type.id)))
      : ticketTypes.find((type) => type.is_seated)
    const zoneColor = seat.zone?.color || seat.seat_type?.color

    return (
      <button
        key={id}
        type="button"
        disabled={disabled}
        onClick={() => onToggleSeat(id)}
        title={`${seat.label || ''}${ticketType ? ` - ${ticketType.name}` : ''}`}
        style={{ width: SEAT_WIDTH, height: SEAT_HEIGHT, ...style }}
        className={`rounded-md border text-[10px] font-bold transition ${
          selected
            ? 'border-primary bg-primary text-slate-950 shadow-md shadow-primary/30'
            : disabled
              ? 'cursor-not-allowed border-slate-700 bg-slate-700 text-slate-500'
              : 'border-border-soft bg-surface text-subtle hover:border-primary hover:text-primary'
        }`}
      >
        <span className="block truncate px-0.5 leading-4">{seat.row_label || seat.label}</span>
        {!selected && !disabled && zoneColor && (
          <span className="mx-auto mt-0.5 block h-0.5 w-4 rounded-full" style={{ backgroundColor: zoneColor }} />
        )}
      </button>
    )
  }

  if (!metrics) {
    return (
      <div
        className="grid w-max gap-2"
        style={{ gridTemplateColumns: `repeat(${colsCount || 8}, ${SEAT_WIDTH}px)`, gap: SEAT_X_GAP }}
      >
        {seats.map((seat) => renderSeat(seat))}
      </div>
    )
  }

  return (
    <div className="relative w-max rounded-lg border border-border-soft/40 bg-background/40" style={{ width: metrics.width, height: metrics.height }}>
      <div
        className="absolute left-1/2 top-5 h-10 -translate-x-1/2 rounded-b-full bg-gradient-to-r from-primary via-sky-300 to-primary text-center text-xs font-extrabold leading-10 text-slate-950 shadow-lg shadow-primary/20"
        style={{ width: Math.min(Math.max(metrics.width * 0.72, 280), 640) }}
      >
        SÂN KHẤU
      </div>
      {seats.map((seat) => {
        const position = metrics.positions.get(seatId(seat))
        if (!position) return null
        return renderSeat(seat, {
          position: 'absolute',
          left: position.left,
          top: position.top,
          width: SEAT_WIDTH,
        })
      })}
    </div>
  )
}
