import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Tag,
  Ticket,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { checkoutOrder, fetchOrderStatus } from '@/services/orders.js'
import { checkTicketAvailability, fetchSessionSeats } from '@/services/events.js'
import { getProfile } from '@/services/user.service.js'
import promotionService from '@/services/promotions.js'

function formatPrice(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0 đ'
  return `${number.toLocaleString('vi-VN')} đ`
}

function formatDateTime(value) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function secondsLeft(expiredAt) {
  if (!expiredAt) return 0
  return Math.max(0, Math.floor((new Date(expiredAt).getTime() - Date.now()) / 1000))
}

function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function paymentQrImageSrc(qrCode) {
  if (!qrCode) return ''
  if (/^(https?:|data:image\/)/i.test(qrCode)) return qrCode
  return `https://api.qrserver.com/v1/create-qr-code/?size=224x224&data=${encodeURIComponent(qrCode)}`
}

function firstTicketIdFromOrderStatus(data) {
  return data?.items?.find((item) => item.ticket?.id)?.ticket?.id
}

function availabilityPayloadFromCart(cart) {
  return {
    event_id: cart.eventId,
    items: (cart.items || []).map((item) => ({
      ticket_type_id: item.ticketType.id,
      quantity: item.quantity,
      session_seat_ids: item.sessionSeatIds || [],
    })),
  }
}

function cartTotal(cart) {
  return (cart?.items || []).reduce(
    (sum, item) => sum + Number(item.ticketType.price || 0) * Number(item.quantity || 0),
    0,
  )
}

function promoDiscount(cart) {
  const promo = cart?.promo
  const subtotal = cartTotal(cart)
  if (!promo || subtotal <= 0 || subtotal < Number(promo.min_order_value || 0)) return 0

  let cappedDiscount =
    promo.discount_type === 'PERCENTAGE'
      ? Math.round((subtotal * Number(promo.discount_value || 0)) / 100)
      : Number(promo.discount_value || 0)

  if (
    promo.discount_type === 'PERCENTAGE' &&
    promo.max_discount !== null &&
    promo.max_discount !== undefined
  ) {
    cappedDiscount = Math.min(cappedDiscount, Number(promo.max_discount))
  }

  return Math.min(Math.max(0, cappedDiscount), subtotal)
}

function payableTotal(cart) {
  return Math.max(0, cartTotal(cart) - promoDiscount(cart))
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeCart(cart) {
  if (!cart) return cart
  return {
    ...cart,
    holdExpiresAt: cart.holdExpiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }
}

export function BookingTicketsPage() {
  return <NavigateBackToEvents />
}

export function BookingSeatsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [cart, setCart] = useState(() => normalizeCart(location.state?.cart))
  const seatMapViewportRef = useRef(null)
  const session = cart?.selectedSession || cart?.items?.[0]?.session
  const ticketTypes = (cart?.availableTicketTypes || []).filter((ticketType) =>
    session ? String(ticketType.event_session_id) === String(session.id) : true,
  )
  const [selectedSeatIds, setSelectedSeatIds] = useState(
    cart?.items?.flatMap((item) => item.sessionSeatIds || []) || [],
  )
  const [availabilityError, setAvailabilityError] = useState('')
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [seatZoom, setSeatZoom] = useState(1)

  const seatsQuery = useQuery({
    queryKey: ['session-seats', session?.id],
    queryFn: () => fetchSessionSeats(session.id),
    enabled: Boolean(session),
  })

  const fitSeatMapToViewport = useCallback(() => {
    if (!seatMapViewportRef.current) return
    const cols = Number(seatsQuery.data?.seat_map?.cols_count || 8)
    const estimatedSeatMapWidth = cols * 56 + 32
    const viewportWidth = seatMapViewportRef.current.clientWidth
    const nextZoom = clamp((viewportWidth - 8) / estimatedSeatMapWidth, 0.5, 1)
    setSeatZoom(Number(nextZoom.toFixed(2)))
  }, [seatsQuery.data?.seat_map?.cols_count])

  useEffect(() => {
    if (!seatsQuery.data?.seats?.length) return
    fitSeatMapToViewport()
  }, [fitSeatMapToViewport, seatsQuery.data?.seats?.length])

  const seatData = seatsQuery.data?.seats || []
  const displayItems = (() => {
    if (!seatData.length) return []
    const seatsById = new Map(seatData.map((seat) => [seat.session_seat_id, seat]))
    const groups = {}
    selectedSeatIds.forEach((seatId) => {
      const seat = seatsById.get(seatId)
      if (!seat) return
      const mappedTicketTypeIds = seat.ticket_type_ids || []
      const ticketType = mappedTicketTypeIds.length
        ? ticketTypes.find((type) => mappedTicketTypeIds.some((id) => String(id) === String(type.id)))
        : ticketTypes.find((type) => type.is_seated !== false) || ticketTypes[0]

      if (ticketType) {
        if (!groups[ticketType.id]) {
          groups[ticketType.id] = {
            ticketType,
            sessionSeatIds: [],
            seatLabels: [],
          }
        }
        groups[ticketType.id].sessionSeatIds.push(seatId)
        groups[ticketType.id].seatLabels.push(seat.label)
      }
    })

    return Object.values(groups).map((group) => ({
      ticketType: group.ticketType,
      quantity: group.sessionSeatIds.length,
      sessionSeatIds: group.sessionSeatIds,
      seatLabels: group.seatLabels,
      session,
    }))
  })()

  const displayCart = cart ? { ...cart, selectedSession: session, items: displayItems } : cart

  if (!cart || !session) return <NavigateBackToEvents />

  const continueFlow = async () => {
    const nextCart = { ...displayCart }
    setAvailabilityError('')
    setCheckingAvailability(true)
    try {
      const result = await checkTicketAvailability(availabilityPayloadFromCart(nextCart))
      if (!result.available) {
        setAvailabilityError(result.message || 'Vé/ghế bạn chọn không còn khả dụng. Vui lòng chọn lại.')
        seatsQuery.refetch()
        return
      }
      navigate('/booking/attendees', { state: { cart: nextCart } })
    } catch (err) {
      setAvailabilityError(err.response?.data?.message || 'Không thể kiểm tra tình trạng vé/ghế. Vui lòng thử lại.')
    } finally {
      setCheckingAvailability(false)
    }
  }

  const toggleSeat = (seatId) => {
    setAvailabilityError('')
    setSelectedSeatIds((current) => {
      if (current.includes(seatId)) return current.filter((id) => id !== seatId)
      return [...current, seatId]
    })
  }

  return (
    <BookingShell step={1} cart={displayCart}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <PageTitle
            title="Chọn ghế"
            subtitle="Chọn ghế trực tiếp trên sơ đồ sân khấu"
          />
          <Panel>
            {seatsQuery.isLoading ? (
              <p className="text-muted">Đang tải sơ đồ ghế...</p>
            ) : seatsQuery.data?.seats?.length ? (
              <>
                <div className="mx-auto mb-8 h-8 max-w-lg rounded-b-full bg-gradient-to-r from-primary via-sky-300 to-primary text-center text-xs font-extrabold leading-8 text-slate-950 shadow-lg shadow-primary/20">
                  SÂN KHẤU
                </div>
                <div className="mb-5 flex flex-wrap gap-4 text-xs text-muted">
                  <Legend color="bg-primary" label="Đang chọn" />
                  <Legend color="bg-panel-soft" label="Còn trống" />
                  <Legend color="bg-slate-700" label="Đã giữ/bán" />
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-surface/60 p-4">
                  <div ref={seatMapViewportRef} className="min-w-0 flex-1 overflow-auto">
                    <div
                      className="grid w-max gap-2"
                      style={{
                        gridTemplateColumns: `repeat(${seatsQuery.data?.seat_map?.cols_count || 8}, 48px)`,
                        zoom: seatZoom,
                      }}
                    >
                      {(seatsQuery.data?.seats || []).map((seat) => {
                        const selected = selectedSeatIds.includes(seat.session_seat_id)
                        const disabled = seat.status !== 'AVAILABLE'
                        const mappedTicketTypeIds = seat.ticket_type_ids || []
                        const ticketType = mappedTicketTypeIds.length
                          ? ticketTypes.find((type) => mappedTicketTypeIds.some((id) => String(id) === String(type.id)))
                          : ticketTypes.find((type) => type.is_seated !== false) || ticketTypes[0]
                        const title = `${seat.label}${ticketType ? ` - ${ticketType.name}` : ''}`

                        return (
                          <button
                            key={seat.session_seat_id}
                            type="button"
                            disabled={disabled}
                            onClick={() => toggleSeat(seat.session_seat_id)}
                            title={title}
                            className={`h-10 rounded-t-lg border text-xs font-bold transition ${
                              selected
                                ? 'border-primary bg-primary text-slate-950 shadow-md shadow-primary/30'
                                : disabled
                                  ? 'cursor-not-allowed border-slate-700 bg-slate-700 text-slate-500'
                                  : 'border-border-soft bg-panel-soft text-subtle hover:border-primary hover:text-primary'
                            }`}
                          >
                            {seat.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSeatZoom((value) => clamp(Number((value + 0.1).toFixed(2)), 0.5, 1.6))}
                      className="grid size-8 place-items-center rounded-full border border-primary bg-background/90 text-primary shadow-md shadow-slate-950/20 transition hover:bg-primary hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-600 disabled:text-slate-600"
                      disabled={seatZoom >= 1.6}
                      title={'Ph\u00f3ng to'}
                    >
                      <Plus className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={fitSeatMapToViewport}
                      className="grid size-8 place-items-center rounded-full border border-primary bg-background/90 text-primary shadow-md shadow-slate-950/20 transition hover:bg-primary hover:text-slate-950"
                      title={'V\u1eeba khung'}
                    >
                      <RefreshCw className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeatZoom((value) => clamp(Number((value - 0.1).toFixed(2)), 0.5, 1.6))}
                      className="grid size-8 place-items-center rounded-full border border-primary bg-background/90 text-primary shadow-md shadow-slate-950/20 transition hover:bg-primary hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-600 disabled:text-slate-600"
                      disabled={seatZoom <= 0.5}
                      title={'Thu nh\u1ecf'}
                    >
                      <Minus className="size-4" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-muted text-center font-medium">Sự kiện này hiện không có sơ đồ chỗ ngồi</p>
            )}
            
            {seatsQuery.data?.seats?.length > 0 && (
              <p className="mt-4 text-sm text-muted">
                Đã chọn <span className="font-bold text-primary">{selectedSeatIds.length}</span> ghế.
              </p>
            )}

            {availabilityError && (
              <p className="mt-3 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
                {availabilityError}
              </p>
            )}
          </Panel>
        </section>
        <OrderCard
          cart={displayCart}
          setCart={setCart}
          cta="Tiếp tục"
          onClick={continueFlow}
          disabled={checkingAvailability || displayItems.length === 0}
        />
      </div>
    </BookingShell>
  )
}

export function BookingAttendeesPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [cart, setCart] = useState(() => normalizeCart(location.state?.cart))
  const attendeeSlots = useMemo(() => expandAttendeeSlots(cart), [cart])
  const [attendees, setAttendees] = useState(cart?.attendees || {})
  const [buyer, setBuyer] = useState(cart?.buyer || { name: '', email: '', phone: '' })
  const [formError, setFormError] = useState('')
  const formErrorRef = useRef(null)

  useEffect(() => {
    if (!buyer.email) {
      getProfile()
        .then((profile) => {
          setBuyer({
            name: profile.full_name || '',
            email: profile.email || '',
            phone: profile.phone || '',
          })
        })
        .catch(() => {})
    }
  }, [buyer.email])

  if (!cart?.items?.length) return <NavigateBackToEvents />

  const showFormError = (message) => {
    setFormError(message)
    window.requestAnimationFrame(() => {
      formErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  const updateAttendee = (slotId, field, value) => {
    setFormError('')
    setAttendees((current) => ({
      ...current,
      [slotId]: {
        ...current[slotId],
        [field]: value,
      },
    }))
  }

  const continueFlow = () => {
    const cleanBuyer = {
      name: buyer.name?.trim() || '',
      email: buyer.email?.trim() || '',
      phone: buyer.phone?.trim() || '',
    }

    if (!cleanBuyer.name || !cleanBuyer.email || !cleanBuyer.phone) {
      showFormError('Vui lòng nhập đầy đủ thông tin người mua.')
      return
    }

    if (!isEmail(cleanBuyer.email)) {
      showFormError('Email người mua không hợp lệ.')
      return
    }

    const cleanAttendees = {}
    const invalidSlotIndex = attendeeSlots.findIndex((slot) => {
      const attendee = attendees[slot.id] || {}
      const cleanAttendee = {
        name: attendee.name?.trim() || '',
        email: attendee.email?.trim() || '',
      }
      cleanAttendees[slot.id] = cleanAttendee
      return !cleanAttendee.name || !cleanAttendee.email || !isEmail(cleanAttendee.email)
    })

    if (invalidSlotIndex >= 0) {
      showFormError(`Vui lòng nhập đầy đủ họ tên và email hợp lệ cho vé ${invalidSlotIndex + 1}.`)
      return
    }

    navigate('/booking/review', { state: { cart: { ...cart, attendees: cleanAttendees, buyer: cleanBuyer } } })
  }

  return (
    <BookingShell step={2} cart={cart}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <PageTitle title="Thông tin người tham gia" subtitle="Thông tin này sẽ được dùng khi xuất vé sau thanh toán" />
          {formError && (
            <p ref={formErrorRef} className="rounded-md border border-error/30 bg-error/10 p-3 text-sm font-semibold text-error">
              {formError}
            </p>
          )}
          <Panel>
            <h2 className="mb-4 font-display text-xl font-bold text-white">Người mua</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Họ và tên" value={buyer.name} onChange={(value) => { setFormError(''); setBuyer((current) => ({ ...current, name: value })) }} />
              <Input label="Email" type="email" value={buyer.email} onChange={(value) => { setFormError(''); setBuyer((current) => ({ ...current, email: value })) }} />
              <Input label="Số điện thoại" value={buyer.phone} onChange={(value) => { setFormError(''); setBuyer((current) => ({ ...current, phone: value })) }} />
            </div>
          </Panel>
          {attendeeSlots.map((slot, index) => (
            <Panel key={slot.id}>
              <h3 className="mb-4 font-bold text-white">
                Vé {index + 1} <span className="text-sm text-muted">({slot.ticketName})</span>
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Họ và tên"
                  value={attendees[slot.id]?.name ?? ''}
                  onChange={(value) => updateAttendee(slot.id, 'name', value)}
                  placeholder="Nhập tên người tham gia"
                />
                <Input
                  label="Email"
                  type="email"
                  value={attendees[slot.id]?.email ?? ''}
                  onChange={(value) => updateAttendee(slot.id, 'email', value)}
                  placeholder="email@example.com"
                />
              </div>
            </Panel>
          ))}
        </section>
        <OrderCard cart={cart} setCart={setCart} cta="Kiểm tra đơn" onClick={continueFlow} />
      </div>
    </BookingShell>
  )
}

export function BookingReviewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [cart, setCart] = useState(() => normalizeCart(location.state?.cart))
  const [promoCode, setPromoCode] = useState(cart?.promoCode || '')
  const [selectedPromo, setSelectedPromo] = useState(cart?.promo || null)
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [checkingAvailability, setCheckingAvailability] = useState(false)

  if (!cart?.items?.length) return <NavigateBackToEvents />

  const continueFlow = async () => {
    const nextCart = { ...cart, promoCode, promo: selectedPromo }
    setAvailabilityError('')
    setCheckingAvailability(true)
    try {
      const result = await checkTicketAvailability(availabilityPayloadFromCart(nextCart))
      if (!result.available) {
        setAvailabilityError(result.message || 'Vé/ghế bạn chọn không còn khả dụng. Vui lòng chọn lại.')
        return
      }
      navigate('/booking/payment', { state: { cart: nextCart } })
    } catch (err) {
      setAvailabilityError(err.response?.data?.message || 'Không thể kiểm tra tình trạng vé/ghế. Vui lòng thử lại.')
    } finally {
      setCheckingAvailability(false)
    }
  }

  return (
    <BookingShell step={3} cart={cart}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <PageTitle title="Kiểm tra vé" subtitle="Vui lòng kiểm tra kỹ vé, người tham gia, thời gian và địa điểm" />
          <Panel>
            <h2 className="mb-4 font-display text-xl font-bold text-white">Thông tin sự kiện</h2>
            <div className="grid gap-3 text-sm text-muted md:grid-cols-2">
              <InfoLine label="Sự kiện" value={cart.eventTitle} />
              <InfoLine label="Thời gian" value={`${formatDateTime(cart.eventStartTime)} - ${formatDateTime(cart.eventEndTime)}`} />
              <InfoLine label="Địa điểm" value={cart.venueSummary || 'Đang cập nhật'} wide />
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-4 font-display text-xl font-bold text-white">Thông tin vé</h2>
            <div className="space-y-3">
              {cart.items.map((item) => (
                <div key={item.ticketType.id} className="rounded-md bg-panel-soft p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="font-bold text-white">{item.ticketType.name}</p>
                      <p className="mt-1 text-sm text-muted">Số lượng: {item.quantity}</p>
                    </div>
                    <p className="font-bold text-primary">
                      {formatPrice(Number(item.ticketType.price || 0) * item.quantity)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-4 font-display text-xl font-bold text-white">Người tham gia</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {expandAttendeeSlots(cart).map((slot, index) => (
                <div key={slot.id} className="rounded-md border border-border-soft bg-surface p-3">
                  <p className="text-xs font-bold uppercase text-primary">Vé {index + 1}</p>
                  <p className="mt-1 font-semibold text-white">{cart.attendees?.[slot.id]?.name || cart.buyer?.name || 'Chưa nhập'}</p>
                  <p className="text-sm text-muted">{cart.attendees?.[slot.id]?.email || cart.buyer?.email || 'Chưa nhập'}</p>
                </div>
              ))}
            </div>
          </Panel>
          <PromoPanel
            promoCode={promoCode}
            onOpenVoucher={() => setVoucherOpen(true)}
          />
          {availabilityError && (
            <p className="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
              {availabilityError}
            </p>
          )}
        </section>
        <OrderCard
          cart={{ ...cart, promoCode, promo: selectedPromo }}
          setCart={setCart}
          cta="Xác nhận và thanh toán"
          onClick={continueFlow}
          disabled={checkingAvailability}
        />
      </div>
      {voucherOpen && (
        <OrganizerVoucherModal
          promoCode={promoCode}
          setPromoCode={setPromoCode}
          selectedPromo={selectedPromo}
          setSelectedPromo={setSelectedPromo}
          cart={cart}
          onClose={() => setVoucherOpen(false)}
        />
      )}
    </BookingShell>
  )
}

export function BookingPaymentPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const existingOrderId = searchParams.get('orderId')
  const [cart, setCart] = useState(() => normalizeCart(location.state?.cart))
  const [checkout, setCheckout] = useState(location.state?.checkout || null)
  const [error, setError] = useState('')
  const orderId = existingOrderId || checkout?.order?.id

  const checkoutMutation = useMutation({
    mutationFn: checkoutOrder,
    onSuccess: (data) => {
      setCheckout(data)
      navigate(`/booking/payment?orderId=${data.order.id}`, { replace: true, state: { cart, checkout: data } })
    },
    onError: (err) => {
      setError(err.response?.data?.message || 'Không thể tạo thanh toán PayOS. Vui lòng thử lại.')
    },
  })

  const statusQuery = useQuery({
    queryKey: ['order-status', orderId],
    queryFn: () => fetchOrderStatus(orderId),
    enabled: Boolean(orderId),
    initialData: checkout
      ? {
          order: checkout.order,
          payment: checkout.payment,
          items: checkout.items,
        }
      : undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.order?.status
      return status === 'PENDING' ? 5000 : false
    },
  })

  const payment = statusQuery.data?.payment || checkout?.payment
  const order = statusQuery.data?.order || checkout?.order

  useEffect(() => {
    if (payment) setError('')
  }, [payment])

  useEffect(() => {
    if (order?.status === 'PAID') {
      const ticketId = firstTicketIdFromOrderStatus(statusQuery.data)
      navigate(ticketId ? `/tickets/${ticketId}` : '/my-tickets', { replace: true })
    }
  }, [navigate, order?.status, statusQuery.data])

  useEffect(() => {
    if (!cart?.items?.length || orderId || checkoutMutation.isPending) return
    checkoutMutation.mutate({
      event_id: cart.eventId,
      buyer_name: cart.buyer?.name || '',
      buyer_email: cart.buyer?.email || '',
      buyer_phone: cart.buyer?.phone || null,
      promo_code: cart.promoCode?.trim() || null,
      items: cart.items.map((item) => ({
        ticket_type_id: item.ticketType.id,
        quantity: item.quantity,
        session_seat_ids: item.sessionSeatIds || [],
      })),
    })
  }, [cart, checkoutMutation, orderId])

  if (!cart?.items?.length) return <NavigateBackToEvents />

  return (
    <BookingShell step={4} cart={cart}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <PageTitle title="Thanh toán" subtitle="Quét QR hoặc mở PayOS để hoàn tất giao dịch." />
          <Panel>
            {checkoutMutation.isPending && <p className="text-muted">Đang giữ vé và tạo thanh toán PayOS...</p>}
            {error && <p className="text-error">{error}</p>}
            {payment && (
              <div className="text-center">
                <p className="text-sm font-bold uppercase tracking-widest text-muted">Số tiền cần thanh toán</p>
                <p className="mt-2 font-display text-4xl font-extrabold text-white">{formatPrice(order.total_amount)}</p>
                {payment.qr_code ? (
                  <div className="mx-auto mt-6 w-fit rounded-lg bg-white p-4">
                    <img src={paymentQrImageSrc(payment.qr_code)} alt="QR PayOS" className="size-56" />
                  </div>
                ) : (
                  <div className="mx-auto mt-6 grid size-56 place-items-center rounded-lg border border-dashed border-border-soft text-sm text-muted">
                    QR sẽ hiển thị khi PayOS trả dữ liệu.
                  </div>
                )}
                {payment.checkout_url && (
                  <a
                    href={payment.checkout_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-bold text-slate-950"
                  >
                    Mở trang PayOS
                    <ExternalLink className="size-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => statusQuery.refetch()}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-border-soft py-3 text-sm font-bold text-white hover:border-primary hover:text-primary"
                >
                  <RefreshCw className="size-4" />
                  Kiểm tra trạng thái
                </button>
              </div>
            )}
          </Panel>
        </section>
        <OrderCard cart={cart} setCart={setCart} cta="Đang chờ thanh toán" disabled />
      </div>
    </BookingShell>
  )
}

function BookingShell({ step, cart, children }) {
  const labels = ['Ghế', 'Thông tin', 'Kiểm tra', 'Thanh toán']
  const navigate = useNavigate()
  const [tick, setTick] = useState(0)
  const remaining = secondsLeft(cart?.holdExpiresAt)

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const goBackStep = () => {
    const previousPathByStep = {
      2: '/booking/seats',
      3: '/booking/attendees',
      4: '/booking/review',
    }
    const previousPath = previousPathByStep[step]

    if (previousPath && cart) {
      navigate(previousPath, { state: { cart } })
      return
    }

    window.history.back()
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background text-content">
      <div className="border-b border-border-soft bg-[#08111f]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-7 sm:px-6 lg:px-8">
          {labels.map((label, index) => {
            const active = index + 1 === step
            const done = index + 1 < step
            return (
              <div key={label} className="flex flex-col items-center gap-2">
                <div
                  className={`grid size-11 place-items-center rounded-full text-sm font-bold transition ${
                    active
                      ? 'bg-tertiary text-white shadow-lg shadow-tertiary/30'
                      : done
                        ? 'bg-tertiary/20 text-tertiary'
                        : 'bg-panel-soft text-muted'
                  }`}
                >
                  {done ? <Check className="size-4" /> : index + 1}
                </div>
                <span className="text-sm font-extrabold text-white">{label}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {cart?.eventTitle && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/10 p-4">
            <div>
              <p className="text-xs font-bold uppercase text-tertiary">Booking</p>
              <h2 className="font-display text-xl font-bold text-white">{cart.eventTitle}</h2>
            </div>
            <div className="rounded-md bg-background px-4 py-2 font-mono text-lg font-bold text-tertiary">
              {formatCountdown(secondsLeft(cart.holdExpiresAt) || remaining + tick * 0)}
            </div>
          </div>
        )}
        <div className="mb-4">
          <button
            type="button"
            onClick={goBackStep}
            className="flex w-fit items-center gap-2 text-sm font-bold text-muted transition hover:text-primary"
          >
            <ArrowLeft className="size-4" />
            Quay về bước trước
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function OrderCard({ cart, cta, onClick, disabled }) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const remaining = secondsLeft(cart?.holdExpiresAt)

  return (
    <aside className="glass-panel h-fit rounded-lg p-5 lg:sticky lg:top-24">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-white">Thông tin đặt vé</h2>
        </div>
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          className="text-sm font-bold text-primary hover:text-sky-300"
        >
          Chọn lại vé
        </button>
      </div>
      <div className="space-y-3 border-y border-border-soft py-4">
        {(cart?.availableTicketTypes || []).map((ticketType) => {
          const item = (cart?.items || []).find((i) => i.ticketType.id === ticketType.id)
          const qty = item?.quantity || 0

          return (
            <div key={ticketType.id} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
              <div>
                <p className={qty > 0 ? 'font-semibold text-white' : 'font-semibold text-slate-400'}>{ticketType.name}</p>
                {qty > 0 ? (
                  <p className="text-primary">
                    {formatPrice(ticketType.price)} × {String(qty).padStart(2, '0')}
                  </p>
                ) : (
                  <p className="text-slate-500">{formatPrice(ticketType.price)} / vé</p>
                )}
                {item?.seatLabels?.length > 0 && (
                  <p className="mt-1 text-xs text-muted">Ghế: {item.seatLabels.join(', ')}</p>
                )}
              </div>
              <p className={qty > 0 ? 'font-bold text-primary' : 'font-bold text-slate-500'}>
                {qty > 0 ? formatPrice(Number(ticketType.price || 0) * qty) : '-'}
              </p>
            </div>
          )
        })}
      </div>
      {cart?.promoCode && (
        <div className="mt-4 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
          Mã khuyến mãi: {cart.promoCode}
        </div>
      )}
      <Line label={`Tổng cộng ${(cart?.items || []).reduce((sum, item) => sum + item.quantity, 0)} vé`} value={formatPrice(cartTotal(cart))} large />
      {promoDiscount(cart) > 0 && (
        <Line label="Giảm giá" value={`-${formatPrice(promoDiscount(cart))}`} tone="discount" />
      )}
      {promoDiscount(cart) > 0 && (
        <Line label="Tổng thanh toán" value={formatPrice(payableTotal(cart))} large />
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mt-5 flex w-full items-center justify-center rounded-md bg-tertiary py-4 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cta}
      </button>
      <button
        type="button"
        onClick={() => setCancelOpen(true)}
        className="mt-3 w-full rounded-md border border-border-soft py-3 text-sm font-bold text-muted hover:border-error hover:text-error"
      >
        Hủy đặt vé
      </button>
      <p className="mt-3 flex items-center justify-center gap-1 text-xs text-muted">
        <ShieldCheck className="size-3" /> Thanh toán qua PayOS của ban tổ chức
      </p>

      {cancelOpen && (
        <CancelBookingModal
          onStay={() => setCancelOpen(false)}
          onCancel={() => {
            setCancelOpen(false)
            window.location.href = `/events/${cart.eventSlug || cart.eventId}`
          }}
        />
      )}
    </aside>
  )
}

function PromoPanel({ promoCode, onOpenVoucher }) {
  return (
    <section className="rounded-lg border border-border-soft bg-panel p-5 shadow-lg shadow-slate-950/10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-xl font-bold text-white">Mã khuyến mãi</h2>
        <button type="button" onClick={onOpenVoucher} className="text-sm font-bold text-primary">
          Chọn voucher
        </button>
      </div>
      <button
        type="button"
        onClick={onOpenVoucher}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-border-soft px-4 py-2 text-muted hover:border-primary hover:text-primary"
      >
        <Tag className="size-4" />
        {promoCode || 'Thêm khuyến mãi'}
      </button>
    </section>
  )
}

function formatDateOnly(value) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN').format(new Date(value))
}

function formatPromoTitle(promo) {
  if (promo.discount_type === 'PERCENTAGE') {
    const cap = promo.max_discount !== null && promo.max_discount !== undefined
      ? `, tối đa ${formatPrice(promo.max_discount)}`
      : ''
    return `Giảm ${Number(promo.discount_value || 0)}%${cap}`
  }
  return `Giảm ${formatPrice(promo.discount_value || 0)}`
}

function isPromoUsable(promo, subtotal) {
  return subtotal >= Number(promo.min_order_value || 0)
}

function OrganizerVoucherModal({ promoCode, setPromoCode, selectedPromo, setSelectedPromo, cart, onClose }) {
  const [draft, setDraft] = useState(promoCode || '')
  const subtotal = cartTotal(cart)
  const promosQuery = useQuery({
    queryKey: ['available-event-promos', cart?.eventId],
    queryFn: async () => {
      const response = await promotionService.getAvailableEventPromos(cart.eventId)
      return response.data.data || []
    },
    enabled: Boolean(cart?.eventId),
  })
  const organizerPromos = promosQuery.data || []
  const promoByCode = useMemo(
    () => new Map(organizerPromos.map((promo) => [String(promo.code).toUpperCase(), promo])),
    [organizerPromos],
  )
  const draftPromo = promoByCode.get(draft.trim().toUpperCase()) || null

  const applyDraft = () => {
    const nextCode = draft.trim()
    setPromoCode(nextCode)
    setSelectedPromo(draftPromo)
  }

  const choosePromo = (promo) => {
    if (!isPromoUsable(promo, subtotal)) return
    setDraft(promo.code)
    setPromoCode(promo.code)
    setSelectedPromo(promo)
  }

  return (
    <ModalFrame onClose={onClose} light>
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-900">Chọn 1 voucher</h2>
        <button type="button" onClick={onClose} className="text-slate-500">
          <X className="size-5" />
        </button>
      </div>
      <div className="mt-5 flex gap-3">
        <div className="flex min-h-12 flex-1 items-center gap-3 rounded-md border border-slate-300 px-3">
          <Ticket className="size-5 text-slate-500" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Nhập mã voucher"
            className="w-full outline-none"
          />
        </div>
        <button type="button" onClick={applyDraft} className="rounded-md bg-slate-200 px-5 font-bold text-slate-600">
          Áp dụng
        </button>
      </div>

      <h3 className="mt-6 font-bold text-slate-900">Voucher từ Ban tổ chức</h3>
      <div className="mt-4 space-y-3">
        {promosQuery.isLoading && (
          <p className="py-8 text-center text-lg font-semibold text-slate-400">Đang tải voucher...</p>
        )}
        {!promosQuery.isLoading && organizerPromos.length === 0 && (
          <p className="py-8 text-center text-lg font-semibold text-slate-400">Chưa có voucher nào</p>
        )}
        {organizerPromos.map((promo) => {
          const checked =
            selectedPromo?.id === promo.id ||
            draft.trim().toUpperCase() === String(promo.code).toUpperCase()
          const usable = isPromoUsable(promo, subtotal)

          return (
            <button
              key={promo.id}
              type="button"
              disabled={!usable}
              onClick={() => choosePromo(promo)}
              className={`flex w-full items-center justify-between rounded-lg border p-4 text-left transition ${
                checked ? 'border-primary bg-primary/10' : 'border-slate-200'
              } ${usable ? 'hover:border-primary' : 'cursor-not-allowed bg-slate-100 opacity-70'}`}
            >
              <div>
                <p className="font-bold text-slate-900">{formatPromoTitle(promo)}</p>
                <p className="mt-1 text-sm text-slate-600">Mã: {promo.code}</p>
                <p className="mt-1 text-sm text-slate-600">Đơn tối thiểu {formatPrice(promo.min_order_value || 0)}</p>
                {promo.discount_type === 'PERCENTAGE' && promo.max_discount !== null && promo.max_discount !== undefined && (
                  <p className="mt-1 text-sm text-slate-600">Giảm tối đa {formatPrice(promo.max_discount)}</p>
                )}
                <p className="mt-2 text-sm text-primary">HSD: {formatDateOnly(promo.end_time)}</p>
                {!usable && (
                  <p className="mt-2 text-xs font-bold text-error">Đơn hàng chưa đủ điều kiện áp dụng</p>
                )}
              </div>
              <span className="grid size-8 place-items-center rounded-full border border-primary">
                {checked && <span className="size-4 rounded-full bg-primary" />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className="rounded-md border border-primary py-3 font-bold text-primary">
          Hủy bỏ
        </button>
        <button
          type="button"
          onClick={() => {
            applyDraft()
            onClose()
          }}
          className="rounded-md bg-primary py-3 font-bold text-slate-950"
        >
          Xong
        </button>
      </div>
    </ModalFrame>
  )
}

function VoucherModal({ promoCode, setPromoCode, selectedPromo, setSelectedPromo, cart, onClose }) {
  return (
    <OrganizerVoucherModal
      promoCode={promoCode}
      setPromoCode={setPromoCode}
      selectedPromo={selectedPromo}
      setSelectedPromo={setSelectedPromo}
      cart={cart}
      onClose={onClose}
    />
  )

  const [draft, setDraft] = useState(promoCode || '')
  const subtotal = cartTotal(cart)
  const promosQuery = useQuery({
    queryKey: ['available-event-promos', cart?.eventId],
    queryFn: async () => {
      const response = await promotionService.getAvailableEventPromos(cart.eventId)
      return response.data.data || []
    },
    enabled: Boolean(cart?.eventId),
  })
  const organizerPromos = promosQuery.data || []
  const promoByCode = useMemo(
    () => new Map(organizerPromos.map((promo) => [String(promo.code).toUpperCase(), promo])),
    [organizerPromos],
  )
  const draftPromo = promoByCode.get(draft.trim().toUpperCase()) || null

  const applyDraft = () => {
    const nextCode = draft.trim()
    setPromoCode(nextCode)
    setSelectedPromo(draftPromo)
  }

  const choosePromo = (promo) => {
    if (!isPromoUsable(promo, subtotal)) return
    setDraft(promo.code)
    setPromoCode(promo.code)
    setSelectedPromo(promo)
  }

  return (
    <ModalFrame onClose={onClose} light>
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-900">Chọn tối đa 2 voucher</h2>
        <button type="button" onClick={onClose} className="text-slate-500">
          <X className="size-5" />
        </button>
      </div>
      <div className="mt-5 flex gap-3">
        <div className="flex min-h-12 flex-1 items-center gap-3 rounded-md border border-slate-300 px-3">
          <Ticket className="size-5 text-slate-500" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Nhập mã voucher"
            className="w-full outline-none"
          />
        </div>
        <button type="button" onClick={() => setPromoCode(draft)} className="rounded-md bg-slate-200 px-5 font-bold text-slate-600">
          Áp dụng
        </button>
      </div>
      <h3 className="mt-6 font-bold text-slate-900">Voucher từ Ban tổ chức</h3>
      <p className="mt-5 text-center text-lg font-semibold text-slate-400">Chưa có voucher nào</p>
      <div className="my-6 border-t border-slate-200" />
      <h3 className="font-bold text-slate-900">Voucher từ EventHub</h3>
      <div className="mt-4 space-y-3">
        {suggested.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setDraft(code)}
            className={`flex w-full items-center justify-between rounded-lg border p-4 text-left ${
              draft === code ? 'border-primary bg-primary/10' : 'border-slate-200'
            }`}
          >
            <div>
              <p className="font-bold text-slate-900">Giảm {code === 'BLUE50' ? '50.000đ' : '100.000đ'}</p>
              <p className="mt-1 text-sm text-slate-600">Đơn tối thiểu 300.000đ</p>
              <p className="mt-2 text-sm text-primary">HSD: 30/06/2026</p>
            </div>
            <span className="grid size-8 place-items-center rounded-full border border-primary">
              {draft === code && <span className="size-4 rounded-full bg-primary" />}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className="rounded-md border border-primary py-3 font-bold text-primary">
          Hủy bỏ
        </button>
        <button
          type="button"
          onClick={() => {
            setPromoCode(draft)
            onClose()
          }}
          className="rounded-md bg-primary py-3 font-bold text-slate-950"
        >
          Xong
        </button>
      </div>
    </ModalFrame>
  )
}

function CancelBookingModal({ onStay, onCancel }) {
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-7 text-slate-900 shadow-2xl">
        <h2 className="text-center text-2xl font-bold">Hủy đơn hàng?</h2>
        <p className="mt-4 text-center text-lg">Bạn có chắc chắn muốn tiếp tục?</p>
        <ul className="mx-auto mt-4 max-w-xs list-disc text-slate-700">
          <li>Bạn sẽ mất vị trí mình đã lựa chọn.</li>
          <li>Đơn hàng đang thanh toán có thể bị hủy.</li>
        </ul>
        <div className="mt-7 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="rounded-md border border-error py-3 font-bold text-error">
            Hủy đơn
          </button>
          <button type="button" onClick={onStay} className="rounded-md bg-tertiary py-3 font-bold text-white">
            Ở lại
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ModalFrame({ children, onClose, light = false }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4">
      <div className={`max-h-[90vh] w-full max-w-xl overflow-auto rounded-lg p-6 shadow-2xl ${light ? 'bg-white text-slate-900' : 'bg-surface text-white'}`}>
        {!light && (
          <button type="button" onClick={onClose} className="float-right text-muted hover:text-white">
            <X className="size-5" />
          </button>
        )}
        {children}
      </div>
    </div>
  )
}

function Panel({ children }) {
  return <section className="rounded-lg border border-border-soft bg-panel p-5 shadow-lg shadow-slate-950/10">{children}</section>
}

function PageTitle({ title, subtitle }) {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-white">{title}</h1>
      <p className="mt-2 text-muted">{subtitle}</p>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded-md border border-border-soft bg-surface px-3 outline-none focus:border-primary"
      />
    </label>
  )
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`size-3 rounded-sm ${color}`} />
      {label}
    </span>
  )
}

function InfoLine({ label, value, wide }) {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <p className="text-xs font-bold uppercase text-primary">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  )
}

function Line({ label, value, large, tone }) {
  return (
    <div className={`mt-4 flex justify-between gap-4 ${large ? 'font-display text-xl font-bold' : 'text-sm'}`}>
      <span className="text-muted">{label}</span>
      <span className={tone === 'discount' ? 'font-semibold text-primary' : large ? 'text-primary' : 'font-semibold text-white'}>{value}</span>
    </div>
  )
}

function expandAttendeeSlots(cart) {
  const slots = []
  ;(cart?.items || []).forEach((item) => {
    for (let index = 0; index < item.quantity; index += 1) {
      slots.push({
        id: `${item.ticketType.id}-${index}`,
        ticketName: item.ticketType.name,
      })
    }
  })
  return slots
}

function NavigateBackToEvents() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-muted">Không tìm thấy thông tin đặt vé.</p>
      <Link to="/events" className="mt-4 inline-block font-bold text-primary">
        Chọn sự kiện
      </Link>
    </div>
  )
}

