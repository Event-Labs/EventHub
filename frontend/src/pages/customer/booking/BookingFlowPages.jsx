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
import { cancelOrder, checkoutOrder, fetchOrderStatus } from '@/services/orders.js'
import { checkTicketAvailability, fetchSessionSeats, holdSeats } from '@/services/events.js'
import { getProfile } from '@/services/user.service.js'
import promotionService from '@/services/promotions.js'

function formatPrice(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0 \u0111'
  return `${number.toLocaleString('vi-VN')} \u0111`
}

function formatDateTime(value) {
  if (!value) return 'Ch\u01b0a c\u1eadp nh\u1eadt'
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

function requiresAttendeeInfo(cart) {
  return Boolean(cart?.requireAttendeeInfo ?? cart?.require_attendee_info)
}

function availabilityPayloadFromCart(cart) {
  return {
    event_id: cart.eventId,
    items: (cart.items || []).filter((item) => Number(item.quantity || 0) > 0).map((item) => ({
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

function seatMapMetrics(seats) {
  const layout = buildSeatLayout(seats)
  if (layout) return layout
  return null
}

const SEAT_WIDTH = 28
const SEAT_HEIGHT = 28
const SEAT_X_GAP = 8
const SEAT_Y_GAP = 8
const SEAT_LAYOUT_PADDING = 20
const STAGE_HEIGHT = 40
const STAGE_GAP = 28
const SAME_ROW_MESSAGE = 'Vui l\u00f2ng ch\u1ecdn c\u00e1c gh\u1ebf trong c\u00f9ng m\u1ed9t h\u00e0ng ngang.'
const ADJACENT_SEATS_MESSAGE = '\u0110\u1ec3 \u0111\u1ea3m b\u1ea3o tr\u1ea3i nghi\u1ec7m t\u1ed1t nh\u1ea5t, vui l\u00f2ng ch\u1ecdn c\u00e1c gh\u1ebf n\u1eb1m c\u1ea1nh nhau.'
const LONELY_SEAT_MESSAGE = 'L\u1ef1a ch\u1ecdn c\u1ee7a b\u1ea1n s\u1ebd \u0111\u1ec3 l\u1ea1i m\u1ed9t gh\u1ebf tr\u1ed1ng \u0111\u01a1n l\u1ebb b\u00ean c\u1ea1nh. Vui l\u00f2ng ch\u1ecdn gh\u1ebf li\u1ec1n k\u1ec1 ho\u1eb7c thay \u0111\u1ed5i v\u1ecb tr\u00ed \u0111\u1ec3 kh\u00f4ng b\u1ecf tr\u1ed1ng gh\u1ebf \u0111\u01a1n l\u1ebb nh\u00e9!'

function seatId(seat) {
  return String(seat?.session_seat_id || seat?.id || '')
}

function seatNumberValue(seat) {
  const parsed = Number.parseInt(String(seat?.seat_number || '').match(/\d+/)?.[0] || '', 10)
  if (Number.isFinite(parsed)) return parsed
  const x = Number(seat?.x_position)
  return Number.isFinite(x) ? x : 0
}

function rowLabel(seat) {
  return String(seat?.row_label || '')
}

function isSeatAvailable(seat) {
  return !seat?.is_disabled && seat?.status === 'AVAILABLE'
}

function normalizeSeatingRules(raw) {
  return {
    require_adjacent_seats: Boolean(raw?.require_adjacent_seats),
    require_same_row: Boolean(raw?.require_same_row),
    disallow_single_seat_left: Boolean(raw?.disallow_single_seat_left),
  }
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

function validateSeatSelection({ rules: rawRules, selectedSeatIds, seats }) {
  const rules = normalizeSeatingRules(rawRules)
  const selectedIds = new Set((selectedSeatIds || []).map(String))
  const selected = (seats || []).filter((seat) => selectedIds.has(seatId(seat)))
  const issues = []

  if (selected.length >= 2) {
    const selectedRows = new Set(selected.map(rowLabel))
    if ((rules.require_same_row || rules.require_adjacent_seats) && selectedRows.size > 1) {
      issues.push(SAME_ROW_MESSAGE)
    }

    if (rules.require_adjacent_seats && selectedRows.size === 1) {
      const sorted = [...selected].sort((a, b) => seatNumberValue(a) - seatNumberValue(b))
      const adjacent = sorted.every((seat, index) => index === 0 || seatNumberValue(seat) - seatNumberValue(sorted[index - 1]) === 1)
      if (!adjacent) {
        issues.push(ADJACENT_SEATS_MESSAGE)
      }
    }
  }

  if (rules.disallow_single_seat_left && selected.length > 0) {
    const affectedRows = new Set(selected.map(rowLabel))
    const rows = new Map()
    ;(seats || []).forEach((seat) => {
      const key = rowLabel(seat)
      if (!affectedRows.has(key)) return
      if (!rows.has(key)) rows.set(key, [])
      rows.get(key).push(seat)
    })

    for (const rowSeats of rows.values()) {
      const sorted = rowSeats.sort((a, b) => seatNumberValue(a) - seatNumberValue(b))
      let availableBlock = 0
      let previousNumber = null

      for (const seat of sorted) {
        const number = seatNumberValue(seat)
        const contiguous = previousNumber === null || number - previousNumber === 1
        const availableAfterSelection = isSeatAvailable(seat) && !selectedIds.has(seatId(seat))

        if (!availableAfterSelection || !contiguous) {
          if (availableBlock === 1) {
            issues.push(LONELY_SEAT_MESSAGE)
            return issues
          }
          availableBlock = availableAfterSelection ? 1 : 0
        } else {
          availableBlock += 1
        }
        previousNumber = number
      }

      if (availableBlock === 1) {
        issues.push(LONELY_SEAT_MESSAGE)
        return issues
      }
    }
  }

  return issues
}

function normalizeCart(cart) {
  return cart || null
}

const BOOKING_DRAFT_KEY = 'eventhub-booking-draft'

function readBookingDraft() {
  if (typeof window === 'undefined') return null
  try {
    return normalizeCart(JSON.parse(window.sessionStorage.getItem(BOOKING_DRAFT_KEY) || 'null'))
  } catch {
    return null
  }
}

function saveBookingDraft(cart) {
  if (typeof window === 'undefined' || !cart) return
  window.sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(cart))
}

function clearBookingDraft() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(BOOKING_DRAFT_KEY)
}

function bookingCartKey(cart) {
  const session = cart?.selectedSession || cart?.items?.[0]?.session
  return cart?.eventId && session?.id ? `${cart.eventId}:${session.id}` : ''
}

function initialCartFromLocation(location) {
  const locationCart = normalizeCart(location.state?.cart)
  const draftCart = readBookingDraft()
  const cart = locationCart && bookingCartKey(locationCart) !== bookingCartKey(draftCart)
    ? locationCart
    : draftCart || locationCart
  if (cart) saveBookingDraft(cart)
  return cart
}

function ticketTypeColor(ticketType, colorByTicketTypeId) {
  return (
    colorByTicketTypeId?.get(String(ticketType?.id)) ||
    ticketType?.color ||
    ticketType?.zone?.color ||
    ticketType?.seat_type?.color ||
    '#38bdf8'
  )
}

export function BookingTicketsPage() {
  return <NavigateBackToEvents />
}

export function BookingSeatsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [cart, setCart] = useState(() => initialCartFromLocation(location))
  const seatMapViewportRef = useRef(null)
  const session = cart?.selectedSession || cart?.items?.[0]?.session
  const ticketTypes = (cart?.availableTicketTypes || []).filter((ticketType) =>
    session ? String(ticketType.event_session_id) === String(session.id) : true,
  )
  const [selectedSeatIds, setSelectedSeatIds] = useState(
    cart?.selectedSeatIds || cart?.items?.flatMap((item) => item.sessionSeatIds || []) || [],
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
    const layout = seatMapMetrics(seatsQuery.data?.seats || [])
    const cols = Number(seatsQuery.data?.seat_map?.cols_count || 8)
    const estimatedSeatMapWidth = layout?.width || cols * (SEAT_WIDTH + SEAT_X_GAP) + SEAT_LAYOUT_PADDING * 2
    const viewportWidth = seatMapViewportRef.current.clientWidth
    const nextZoom = clamp((viewportWidth - 8) / estimatedSeatMapWidth, 0.45, 1)
    setSeatZoom(Number(nextZoom.toFixed(2)))
  }, [seatsQuery.data?.seat_map?.cols_count, seatsQuery.data?.seats])

  useEffect(() => {
    if (!seatsQuery.data?.seats?.length) return
    fitSeatMapToViewport()
  }, [fitSeatMapToViewport, seatsQuery.data?.seats?.length])

  const seatData = seatsQuery.data?.seats || []
  const seatingRules = cart?.seatingRules || cart?.seating_rules || {}
  const colorByTicketTypeId = useMemo(() => {
    const colors = new Map()
    ;(seatData || []).forEach((seat) => {
      const color = seat.zone?.color || seat.seat_type?.color
      if (!color) return
      const seatZoneId = seat.zone_id || seat.zone?.id
      ;(seat.ticket_type_ids || []).forEach((id) => {
        if (!colors.has(String(id))) colors.set(String(id), color)
      })
      ;(ticketTypes || []).forEach((ticketType) => {
        if (ticketType.zone_id && seatZoneId && String(ticketType.zone_id) === String(seatZoneId)) {
          colors.set(String(ticketType.id), color)
        }
      })
    })
    return colors
  }, [seatData, ticketTypes])
  const buildDisplayItems = (seatIds) => {
    if (!seatData.length) return []
    const seatsById = new Map(seatData.map((seat) => [seat.session_seat_id, seat]))
    const groups = {}
    seatIds.forEach((seatId) => {
      const seat = seatsById.get(seatId)
      if (!seat) return
      const mappedTicketTypeIds = seat.ticket_type_ids || []
      const ticketType = mappedTicketTypeIds.length
        ? ticketTypes.find((type) => mappedTicketTypeIds.some((id) => String(id) === String(type.id)))
        : ticketTypes.find((type) => type.is_seated !== false) || ticketTypes[0]

      if (ticketType) {
        if (!groups[ticketType.id]) {
          groups[ticketType.id] = {
            ticketType: {
              ...ticketType,
              color: seat.zone?.color || seat.seat_type?.color || ticketTypeColor(ticketType, colorByTicketTypeId),
            },
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
  }

  const displayItems = buildDisplayItems(selectedSeatIds)
  const displayTicketTypes = (cart?.availableTicketTypes || []).map((ticketType) => ({
    ...ticketType,
    color: ticketTypeColor(ticketType, colorByTicketTypeId),
  }))
  const seatRuleIssue = useMemo(() => validateSeatSelection({
    rules: seatingRules,
    selectedSeatIds,
    seats: seatData,
  })[0] || '', [seatData, seatingRules, selectedSeatIds])

  const displayCart = cart ? { ...cart, selectedSession: session, selectedSeatIds, availableTicketTypes: displayTicketTypes, items: displayItems } : cart

  useEffect(() => {
    if (!displayCart || !session) return
    saveBookingDraft(displayCart)
  }, [displayCart, session])

  if (!cart || !session) return <NavigateBackToEvents />

  const continueFlow = async () => {
    const nextCart = { ...displayCart }
    if (seatRuleIssue) {
      setAvailabilityError(seatRuleIssue)
      return
    }
    setAvailabilityError('')
    setCheckingAvailability(true)
    try {
      const hold = await holdSeats(availabilityPayloadFromCart(nextCart))
      const heldCart = {
        ...nextCart,
        holdExpiresAt: hold.hold_expires_at || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }
      saveBookingDraft(heldCart)
      navigate('/booking/attendees', { state: { cart: heldCart } })
    } catch (err) {
      setAvailabilityError(err.response?.data?.message || 'Kh\u00f4ng th\u1ec3 gi\u1eef gh\u1ebf b\u1ea1n \u0111\u00e3 ch\u1ecdn. Vui l\u00f2ng th\u1eed l\u1ea1i.')
      seatsQuery.refetch()
    } finally {
      setCheckingAvailability(false)
    }
  }

  const toggleSeat = (seatId) => {
    setAvailabilityError('')
    setSelectedSeatIds((current) => {
      const nextSeatIds = current.includes(seatId)
        ? current.filter((id) => id !== seatId)
        : [...current, seatId]

      if (nextSeatIds.length > 4) {
        setAvailabilityError('B\u1ea1n ch\u1ec9 \u0111\u01b0\u1ee3c ch\u1ecdn t\u1ed1i \u0111a 4 gh\u1ebf trong m\u1ed9t \u0111\u01a1n h\u00e0ng.')
        return current
      }

      const issue = validateSeatSelection({ rules: seatingRules, selectedSeatIds: nextSeatIds, seats: seatData })[0] || ''
      setAvailabilityError(issue)
      return nextSeatIds
    })
  }

  return (
    <BookingShell step={1} cart={displayCart}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <PageTitle
            title={'Ch\u1ecdn gh\u1ebf'}
            subtitle={'Ch\u1ecdn gh\u1ebf tr\u1ef1c ti\u1ebfp tr\u00ean s\u01a1 \u0111\u1ed3 s\u00e2n kh\u1ea5u'}
          />
          <Panel>
            {seatsQuery.isLoading ? (
              <p className="text-muted">{'\u0110ang t\u1ea3i s\u01a1 \u0111\u1ed3 gh\u1ebf...'}</p>
            ) : seatsQuery.data?.seats?.length ? (
              <>
                <div className="mb-5 flex flex-wrap justify-center gap-4 text-xs text-muted">
                  <Legend color="bg-primary" label={'\u0110ang ch\u1ecdn'} />
                  <Legend color="bg-panel-soft" label={'C\u00f2n tr\u1ed1ng'} />
                  <Legend color="bg-slate-700" label={'\u0110\u00e3 gi\u1eef/b\u00e1n'} />
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-surface/60 p-4">
                  <div ref={seatMapViewportRef} className="min-w-0 flex-1 overflow-auto">
                    <SeatMapCanvas
                      seats={seatsQuery.data?.seats || []}
                      ticketTypes={ticketTypes}
                      selectedSeatIds={selectedSeatIds}
                      onToggleSeat={toggleSeat}
                      seatZoom={seatZoom}
                      colsCount={seatsQuery.data?.seat_map?.cols_count || 8}
                    />
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
              <p className="text-muted text-center font-medium">{'S\u1ef1 ki\u1ec7n n\u00e0y hi\u1ec7n kh\u00f4ng c\u00f3 s\u01a1 \u0111\u1ed3 ch\u1ed7 ng\u1ed3i'}</p>
            )}

            {seatsQuery.data?.seats?.length > 0 && (
              <p className="mt-4 text-sm text-muted">
                {'\u0110\u00e3 ch\u1ecdn '}<span className="font-bold text-primary">{selectedSeatIds.length}</span>{' gh\u1ebf.'}
              </p>
            )}

            {(availabilityError || seatRuleIssue) && (
              <p className="mt-3 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
                {availabilityError || seatRuleIssue}
              </p>
            )}
          </Panel>
        </section>
        <OrderCard
          cart={displayCart}
          setCart={setCart}
          colorByTicketTypeId={colorByTicketTypeId}
          cta={'Ti\u1ebfp t\u1ee5c'}
          onClick={continueFlow}
          disabled={checkingAvailability || displayItems.length === 0 || Boolean(seatRuleIssue)}
        />
      </div>
    </BookingShell>
  )
}

export function BookingAttendeesPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [cart, setCart] = useState(() => initialCartFromLocation(location))
  const attendeeSlots = useMemo(() => expandAttendeeSlots(cart), [cart])
  const collectAttendees = requiresAttendeeInfo(cart)
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
      showFormError('Vui l\u00f2ng nh\u1eadp \u0111\u1ea7y \u0111\u1ee7 th\u00f4ng tin ng\u01b0\u1eddi mua.')
      return
    }

    if (!isEmail(cleanBuyer.email)) {
      showFormError('Email ng\u01b0\u1eddi mua kh\u00f4ng h\u1ee3p l\u1ec7.')
      return
    }

    const cleanAttendees = {}
    if (collectAttendees) {
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
        showFormError(`Vui l\u00f2ng nh\u1eadp \u0111\u1ea7y \u0111\u1ee7 h\u1ecd t\u00ean v\u00e0 email h\u1ee3p l\u1ec7 cho v\u00e9 ${invalidSlotIndex + 1}.`)
        return
      }
    }
    const nextCart = { ...cart, attendees: cleanAttendees, buyer: cleanBuyer }
    saveBookingDraft(nextCart)
    navigate('/booking/review', { state: { cart: nextCart } })
  }

  return (
    <BookingShell step={2} cart={cart}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <PageTitle
            title={collectAttendees ? 'Th\u00f4ng tin ng\u01b0\u1eddi tham gia' : 'Th\u00f4ng tin ng\u01b0\u1eddi mua'}
            subtitle={collectAttendees ? 'Th\u00f4ng tin n\u00e0y s\u1ebd \u0111\u01b0\u1ee3c d\u00f9ng khi xu\u1ea5t v\u00e9 sau thanh to\u00e1n' : 'V\u00e9 s\u1ebd ghi nh\u1eadn theo th\u00f4ng tin ng\u01b0\u1eddi mua'}
          />
          {formError && (
            <p ref={formErrorRef} className="rounded-md border border-error/30 bg-error/10 p-3 text-sm font-semibold text-error">
              {formError}
            </p>
          )}
          <Panel>
            <h2 className="mb-4 font-display text-xl font-bold text-white">{'Ng\u01b0\u1eddi mua'}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Input label={'H\u1ecd v\u00e0 t\u00ean'} value={buyer.name} onChange={(value) => { setFormError(''); setBuyer((current) => ({ ...current, name: value })) }} />
              <Input label="Email" type="email" value={buyer.email} onChange={(value) => { setFormError(''); setBuyer((current) => ({ ...current, email: value })) }} />
              <Input label={'S\u1ed1 \u0111i\u1ec7n tho\u1ea1i'} value={buyer.phone} onChange={(value) => { setFormError(''); setBuyer((current) => ({ ...current, phone: value })) }} />
            </div>
          </Panel>
          {collectAttendees && attendeeSlots.map((slot, index) => (
            <Panel key={slot.id}>
              <h3 className="mb-4 font-bold text-white">
                {'V\u00e9'} {index + 1} <span className="text-sm text-muted">({slot.ticketName})</span>
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label={'H\u1ecd v\u00e0 t\u00ean'}
                  value={attendees[slot.id]?.name ?? ''}
                  onChange={(value) => updateAttendee(slot.id, 'name', value)}
                  placeholder={'Nh\u1eadp t\u00ean ng\u01b0\u1eddi tham gia'}
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
        <OrderCard cart={cart} setCart={setCart} cta={'Ki\u1ec3m tra \u0111\u01a1n'} onClick={continueFlow} hideUnselectedTickets />
      </div>
    </BookingShell>
  )
}

export function BookingReviewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [cart, setCart] = useState(() => initialCartFromLocation(location))
  const [promoCode, setPromoCode] = useState(cart?.promoCode || '')
  const [selectedPromo, setSelectedPromo] = useState(cart?.promo || null)
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [checkingAvailability, setCheckingAvailability] = useState(false)


  if (!cart?.items?.length) return <NavigateBackToEvents />

  const collectAttendees = requiresAttendeeInfo(cart)

  const continueFlow = async () => {
    const nextCart = { ...cart, promoCode, promo: selectedPromo }
    setAvailabilityError('')
    setCheckingAvailability(true)
    try {
      const result = await checkTicketAvailability(availabilityPayloadFromCart(nextCart))
      if (!result.available) {
        setAvailabilityError(result.message || 'V\u00e9/gh\u1ebf b\u1ea1n ch\u1ecdn kh\u00f4ng c\u00f2n kh\u1ea3 d\u1ee5ng. Vui l\u00f2ng ch\u1ecdn l\u1ea1i.')
        return
      }
      saveBookingDraft(nextCart)
      navigate('/booking/payment', { state: { cart: nextCart } })
    } catch (err) {
      setAvailabilityError(err.response?.data?.message || 'Kh\u00f4ng th\u1ec3 ki\u1ec3m tra t\u00ecnh tr\u1ea1ng v\u00e9/gh\u1ebf. Vui l\u00f2ng th\u1eed l\u1ea1i.')
    } finally {
      setCheckingAvailability(false)
    }
  }

  return (
    <BookingShell step={3} cart={cart}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <PageTitle title={'Ki\u1ec3m tra v\u00e9'} subtitle={collectAttendees ? 'Vui l\u00f2ng ki\u1ec3m tra k\u1ef9 v\u00e9, ng\u01b0\u1eddi tham gia, th\u1eddi gian v\u00e0 \u0111\u1ecba \u0111i\u1ec3m' : 'Vui l\u00f2ng ki\u1ec3m tra k\u1ef9 v\u00e9, ng\u01b0\u1eddi mua, th\u1eddi gian v\u00e0 \u0111\u1ecba \u0111i\u1ec3m'} />
          <Panel>
            <h2 className="mb-4 font-display text-xl font-bold text-white">{'Th\u00f4ng tin s\u1ef1 ki\u1ec7n'}</h2>
            <div className="grid gap-3 text-sm text-muted md:grid-cols-2">
              <InfoLine label={'S\u1ef1 ki\u1ec7n'} value={cart.eventTitle} />
              <InfoLine label={'Th\u1eddi gian'} value={`${formatDateTime(cart.eventStartTime)} - ${formatDateTime(cart.eventEndTime)}`} />
              <InfoLine label={'\u0110\u1ecba \u0111i\u1ec3m'} value={cart.venueSummary || '\u0110ang c\u1eadp nh\u1eadt'} wide />
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-4 font-display text-xl font-bold text-white">{'Th\u00f4ng tin v\u00e9'}</h2>
            <div className="space-y-3">
              {cart.items.map((item) => (
                <div key={item.ticketType.id} className="rounded-md bg-panel-soft p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="font-bold text-white">{item.ticketType.name}</p>
                      <p className="mt-1 text-sm text-muted">{'S\u1ed1 l\u01b0\u1ee3ng'}: {item.quantity}</p>
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
            <h2 className="mb-4 font-display text-xl font-bold text-white">{collectAttendees ? 'Ng\u01b0\u1eddi tham gia' : 'Ng\u01b0\u1eddi mua'}</h2>
            {collectAttendees ? (
              <div className="grid gap-3 md:grid-cols-2">
                {expandAttendeeSlots(cart).map((slot, index) => (
                  <div key={slot.id} className="rounded-md border border-border-soft bg-surface p-3">
                    <p className="text-xs font-bold uppercase text-primary">{'V\u00e9'} {index + 1}</p>
                    <p className="mt-1 font-semibold text-white">{cart.attendees?.[slot.id]?.name || 'Ch\u01b0a nh\u1eadp'}</p>
                    <p className="text-sm text-muted">{cart.attendees?.[slot.id]?.email || 'Ch\u01b0a nh\u1eadp'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-border-soft bg-surface p-3">
                <p className="mt-1 font-semibold text-white">{cart.buyer?.name || 'Ch\u01b0a nh\u1eadp'}</p>
                <p className="text-sm text-muted">{cart.buyer?.email || 'Ch\u01b0a nh\u1eadp'}</p>
                <p className="text-sm text-muted">{cart.buyer?.phone || 'Ch\u01b0a nh\u1eadp'}</p>
              </div>
            )}
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
          cta={'X\u00e1c nh\u1eadn v\u00e0 thanh to\u00e1n'}
          onClick={continueFlow}
          disabled={checkingAvailability}
          hideUnselectedTickets
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
  const [cart, setCart] = useState(() => initialCartFromLocation(location))
  const [checkout, setCheckout] = useState(location.state?.checkout || null)
  const [error, setError] = useState('')
  const checkoutStartedRef = useRef(Boolean(location.state?.checkout || existingOrderId))
  const orderId = existingOrderId || checkout?.order?.id

  const checkoutMutation = useMutation({
    mutationFn: checkoutOrder,
    onSuccess: (data) => {
      setError('')
      setCheckout(data)
      setCart((current) => ({ ...current, holdExpiresAt: data.order?.expired_at || current?.holdExpiresAt }))
      navigate(`/booking/payment?orderId=${data.order.id}`, { replace: true, state: { cart, checkout: data } })
    },
    onError: (err) => {
      setError(err.response?.data?.message || 'Kh\u00f4ng th\u1ec3 t\u1ea1o thanh to\u00e1n PayOS. Vui l\u00f2ng th\u1eed l\u1ea1i.')
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
      clearBookingDraft()
      navigate(ticketId ? `/tickets/${ticketId}` : '/my-tickets', { replace: true })
    }
  }, [navigate, order?.status, statusQuery.data])

  useEffect(() => {
    if (!cart?.items?.length || orderId || checkoutMutation.isPending || checkoutStartedRef.current) return
    checkoutStartedRef.current = true
    checkoutMutation.mutate({
      event_id: cart.eventId,
      buyer_name: cart.buyer?.name || '',
      buyer_email: cart.buyer?.email || '',
      buyer_phone: cart.buyer?.phone || null,
      promo_code: cart.promoCode?.trim() || null,
      attendees: buildAttendeesPayload(cart),
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
          <PageTitle title={'Thanh to\u00e1n'} subtitle={'Qu\u00e9t QR ho\u1eb7c m\u1edf PayOS \u0111\u1ec3 ho\u00e0n t\u1ea5t giao d\u1ecbch.'} />
          <Panel>
            {checkoutMutation.isPending && <p className="text-muted">{'\u0110ang gi\u1eef v\u00e9 v\u00e0 t\u1ea1o thanh to\u00e1n PayOS...'}</p>}
            {error && <p className="text-error">{error}</p>}
            {payment && (
              <div className="text-center">
                <p className="text-sm font-bold uppercase tracking-widest text-muted">{'S\u1ed1 ti\u1ec1n c\u1ea7n thanh to\u00e1n'}</p>
                <p className="mt-2 font-display text-4xl font-extrabold text-white">{formatPrice(order.total_amount)}</p>
                {payment.qr_code ? (
                  <div className="mx-auto mt-6 w-fit rounded-lg bg-white p-4">
                    <img src={paymentQrImageSrc(payment.qr_code)} alt="QR PayOS" className="size-56" />
                  </div>
                ) : (
                  <div className="mx-auto mt-6 grid size-56 place-items-center rounded-lg border border-dashed border-border-soft text-sm text-muted">
                    {'QR s\u1ebd hi\u1ec3n th\u1ecb khi PayOS tr\u1ea3 d\u1eef li\u1ec7u.'}
                  </div>
                )}
                {payment.checkout_url && (
                  <a
                    href={payment.checkout_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-bold text-slate-950"
                  >
                    {'M\u1edf trang PayOS'}
                    <ExternalLink className="size-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => statusQuery.refetch()}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-border-soft py-3 text-sm font-bold text-white hover:border-primary hover:text-primary"
                >
                  <RefreshCw className="size-4" />
                  {'Ki\u1ec3m tra tr\u1ea1ng th\u00e1i'}
                </button>
              </div>
            )}
          </Panel>
        </section>
        <OrderCard cart={cart} setCart={setCart} cta={'\u0110ang ch\u1edd thanh to\u00e1n'} disabled onCancel={() => (orderId ? cancelOrder(orderId) : undefined)} hideUnselectedTickets />
      </div>
    </BookingShell>
  )
}

function BookingShell({ step, cart, children }) {
  const labels = ['Gh\u1ebf', 'Th\u00f4ng tin', 'Ki\u1ec3m tra', 'Thanh to\u00e1n']
  const navigate = useNavigate()
  const [tick, setTick] = useState(0)
  const remaining = secondsLeft(cart?.holdExpiresAt) + tick * 0

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
            {cart.holdExpiresAt && (
              <div className="rounded-md bg-background px-4 py-2 font-mono text-lg font-bold text-tertiary">
                {formatCountdown(remaining)}
              </div>
            )}
          </div>
        )}
        <div className="mb-4">
          <button
            type="button"
            onClick={goBackStep}
            className="flex w-fit items-center gap-2 text-sm font-bold text-muted transition hover:text-primary"
          >
            <ArrowLeft className="size-4" />
            {'Quay v\u1ec1 b\u01b0\u1edbc tr\u01b0\u1edbc'}
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function OrderCard({ cart, cta, onClick, disabled, onCancel, colorByTicketTypeId, hideUnselectedTickets = false }) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const visibleTicketTypes = (cart?.availableTicketTypes || []).filter((ticketType) => {
    if (!hideUnselectedTickets) return true
    const item = (cart?.items || []).find((i) => String(i.ticketType.id) === String(ticketType.id))
    return Number(item?.quantity || 0) > 0
  })

  return (
    <aside className="glass-panel h-fit rounded-lg p-5 lg:sticky lg:top-24">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-white">{'Th\u00f4ng tin \u0111\u1eb7t v\u00e9'}</h2>
        </div>
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          className="text-sm font-bold text-primary hover:text-sky-300"
        >
          {'Ch\u1ecdn l\u1ea1i v\u00e9'}
        </button>
      </div>
      <div className="space-y-3 border-y border-border-soft py-4">
        {visibleTicketTypes.map((ticketType) => {
          const item = (cart?.items || []).find((i) => String(i.ticketType.id) === String(ticketType.id))
          const qty = item?.quantity || 0

          return (
            <div key={ticketType.id} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
              <div className="flex min-w-0 items-start gap-2">
                <span
                  className="mt-1 size-3 shrink-0 rounded-sm border border-white/20"
                  style={{ backgroundColor: ticketTypeColor(item?.ticketType || ticketType, colorByTicketTypeId) }}
                />
                <div className="min-w-0">
                  <p className={qty > 0 ? 'font-semibold text-white' : 'font-semibold text-slate-400'}>{ticketType.name}</p>
                {qty > 0 ? (
                  <p className="text-primary">
                    {formatPrice(ticketType.price)} {'\u00d7'} {String(qty).padStart(2, '0')}
                  </p>
                ) : (
                  <p className="text-slate-500">{formatPrice(ticketType.price)} / {'v\u00e9'}</p>
                )}
                {item?.seatLabels?.length > 0 && (
                  <p className="mt-2 inline-flex max-w-full rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                    {'Gh\u1ebf'}: <span className="ml-1 truncate">{item.seatLabels.join(', ')}</span>
                  </p>
                )}
                </div>
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
          {'M\u00e3 khuy\u1ebfn m\u00e3i'}: {cart.promoCode}
        </div>
      )}
      <Line label={`T\u1ed5ng c\u1ed9ng ${(cart?.items || []).reduce((sum, item) => sum + item.quantity, 0)} v\u00e9`} value={formatPrice(cartTotal(cart))} large />
      {promoDiscount(cart) > 0 && (
        <Line label={'Gi\u1ea3m gi\u00e1'} value={`-${formatPrice(promoDiscount(cart))}`} tone="discount" />
      )}
      {promoDiscount(cart) > 0 && (
        <Line label={'T\u1ed5ng thanh to\u00e1n'} value={formatPrice(payableTotal(cart))} large />
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
        {'H\u1ee7y \u0111\u1eb7t v\u00e9'}
      </button>
      <p className="mt-3 flex items-center justify-center gap-1 text-xs text-muted">
        <ShieldCheck className="size-3" /> {'Thanh to\u00e1n qua PayOS c\u1ee7a ban t\u1ed5 ch\u1ee9c'}
      </p>

      {cancelOpen && (
        <CancelBookingModal
          onStay={() => setCancelOpen(false)}
          onCancel={() => {
            setCancelOpen(false)
            Promise.resolve(onCancel?.()).finally(() => {
              clearBookingDraft()
              window.location.href = `/events/${cart.eventSlug || cart.eventId}`
            })
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
        <h2 className="font-display text-xl font-bold text-white">{'M\u00e3 khuy\u1ebfn m\u00e3i'}</h2>
        <button type="button" onClick={onOpenVoucher} className="text-sm font-bold text-primary">
          {'Ch\u1ecdn voucher'}
        </button>
      </div>
      <button
        type="button"
        onClick={onOpenVoucher}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-border-soft px-4 py-2 text-muted hover:border-primary hover:text-primary"
      >
        <Tag className="size-4" />
        {promoCode || 'Th\u00eam khuy\u1ebfn m\u00e3i'}
      </button>
    </section>
  )
}

function formatDateOnly(value) {
  if (!value) return 'Ch\u01b0a c\u1eadp nh\u1eadt'
  return new Intl.DateTimeFormat('vi-VN').format(new Date(value))
}

function formatPromoTitle(promo) {
  if (promo.discount_type === 'PERCENTAGE') {
    const cap = promo.max_discount !== null && promo.max_discount !== undefined
      ? `, t\u1ed1i \u0111a ${formatPrice(promo.max_discount)}`
      : ''
    return `Gi\u1ea3m ${Number(promo.discount_value || 0)}%${cap}`
  }
  return `Gi\u1ea3m ${formatPrice(promo.discount_value || 0)}`
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
        <h2 className="text-xl font-bold text-slate-900">{'Ch\u1ecdn 1 voucher'}</h2>
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
            placeholder={'Nh\u1eadp m\u00e3 voucher'}
            className="w-full outline-none"
          />
        </div>
        <button type="button" onClick={applyDraft} className="rounded-md bg-slate-200 px-5 font-bold text-slate-600">
          {'\u00c1p d\u1ee5ng'}
        </button>
      </div>

      <h3 className="mt-6 font-bold text-slate-900">{'Voucher t\u1eeb Ban t\u1ed5 ch\u1ee9c'}</h3>
      <div className="mt-4 space-y-3">
        {promosQuery.isLoading && (
          <p className="py-8 text-center text-lg font-semibold text-slate-400">{'\u0110ang t\u1ea3i voucher...'}</p>
        )}
        {!promosQuery.isLoading && organizerPromos.length === 0 && (
          <p className="py-8 text-center text-lg font-semibold text-slate-400">{'Ch\u01b0a c\u00f3 voucher n\u00e0o'}</p>
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
                <p className="mt-1 text-sm text-slate-600">{'M\u00e3'}: {promo.code}</p>
                <p className="mt-1 text-sm text-slate-600">{'\u0110\u01a1n t\u1ed1i thi\u1ec3u'} {formatPrice(promo.min_order_value || 0)}</p>
                {promo.discount_type === 'PERCENTAGE' && promo.max_discount !== null && promo.max_discount !== undefined && (
                  <p className="mt-1 text-sm text-slate-600">{'Gi\u1ea3m t\u1ed1i \u0111a'} {formatPrice(promo.max_discount)}</p>
                )}
                <p className="mt-2 text-sm text-primary">HSD: {formatDateOnly(promo.end_time)}</p>
                {!usable && (
                  <p className="mt-2 text-xs font-bold text-error">{'\u0110\u01a1n h\u00e0ng ch\u01b0a \u0111\u1ee7 \u0111i\u1ec1u ki\u1ec7n \u00e1p d\u1ee5ng'}</p>
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
          {'H\u1ee7y b\u1ecf'}
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
        <h2 className="text-xl font-bold text-slate-900">{'Ch\u1ecdn t\u1ed1i \u0111a 2 voucher'}</h2>
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
            placeholder={'Nh\u1eadp m\u00e3 voucher'}
            className="w-full outline-none"
          />
        </div>
        <button type="button" onClick={() => setPromoCode(draft)} className="rounded-md bg-slate-200 px-5 font-bold text-slate-600">
          {'\u00c1p d\u1ee5ng'}
        </button>
      </div>
      <h3 className="mt-6 font-bold text-slate-900">{'Voucher t\u1eeb Ban t\u1ed5 ch\u1ee9c'}</h3>
      <p className="mt-5 text-center text-lg font-semibold text-slate-400">{'Ch\u01b0a c\u00f3 voucher n\u00e0o'}</p>
      <div className="my-6 border-t border-slate-200" />
      <h3 className="font-bold text-slate-900">{'Voucher t\u1eeb EventHub'}</h3>
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
              <p className="font-bold text-slate-900">{'Gi\u1ea3m'} {code === 'BLUE50' ? '50.000\u0111' : '100.000\u0111'}</p>
              <p className="mt-1 text-sm text-slate-600">{'\u0110\u01a1n t\u1ed1i thi\u1ec3u 300.000\u0111'}</p>
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
          {'H\u1ee7y b\u1ecf'}
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
        <h2 className="text-center text-2xl font-bold">{'H\u1ee7y \u0111\u01a1n h\u00e0ng?'}</h2>
        <p className="mt-4 text-center text-lg">{'B\u1ea1n c\u00f3 ch\u1eafc ch\u1eafn mu\u1ed1n ti\u1ebfp t\u1ee5c?'}</p>
        <ul className="mx-auto mt-4 max-w-xs list-disc text-slate-700">
          <li>{'B\u1ea1n s\u1ebd m\u1ea5t v\u1ecb tr\u00ed m\u00ecnh \u0111\u00e3 l\u1ef1a ch\u1ecdn.'}</li>
          <li>{'\u0110\u01a1n h\u00e0ng \u0111ang thanh to\u00e1n c\u00f3 th\u1ec3 b\u1ecb h\u1ee7y.'}</li>
        </ul>
        <div className="mt-7 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="rounded-md border border-error py-3 font-bold text-error">
            {'H\u1ee7y \u0111\u01a1n'}
          </button>
          <button type="button" onClick={onStay} className="rounded-md bg-tertiary py-3 font-bold text-white">
            {'\u1ede l\u1ea1i'}
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

function SeatMapCanvas({ seats, ticketTypes, selectedSeatIds, onToggleSeat, seatZoom, colsCount }) {
  const metrics = seatMapMetrics(seats)
  const renderSeat = (seat, style = {}) => {
    const selected = selectedSeatIds.includes(seat.session_seat_id)
    const disabled = seat.status !== 'AVAILABLE' && !selected
    const mappedTicketTypeIds = seat.ticket_type_ids || []
    const ticketType = mappedTicketTypeIds.length
      ? ticketTypes.find((type) => mappedTicketTypeIds.some((id) => String(id) === String(type.id)))
      : ticketTypes.find((type) => type.is_seated !== false) || ticketTypes[0]
    const title = `${seat.label}${ticketType ? ` - ${ticketType.name}` : ''}${seat.zone?.name ? ` - ${seat.zone.name}` : ''}`
    const zoneColor = seat.zone?.color || seat.seat_type?.color

    return (
      <button
        key={seat.session_seat_id}
        type="button"
        disabled={disabled}
        onClick={() => onToggleSeat(seat.session_seat_id)}
        title={title}
        style={{ width: SEAT_WIDTH, height: SEAT_HEIGHT, ...style }}
        className={`rounded-md border text-[10px] font-bold transition ${
          selected
            ? 'border-primary bg-primary text-slate-950 shadow-md shadow-primary/30'
            : disabled
              ? 'cursor-not-allowed border-slate-700 bg-slate-700 text-slate-500'
              : 'border-border-soft bg-panel-soft text-subtle hover:border-primary hover:text-primary'
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
        style={{ gridTemplateColumns: `repeat(${colsCount || 8}, ${SEAT_WIDTH}px)`, gap: SEAT_X_GAP, zoom: seatZoom }}
      >
        {seats.map((seat) => renderSeat(seat))}
      </div>
    )
  }

  return (
    <div
      className="relative w-max rounded-lg border border-border-soft/40 bg-background/40"
      style={{ width: metrics.width * seatZoom, height: metrics.height * seatZoom }}
    >
      <div
        className="relative origin-top-left"
        style={{ width: metrics.width, height: metrics.height, transform: `scale(${seatZoom})` }}
      >
        <div
          className="absolute left-1/2 top-5 h-10 -translate-x-1/2 rounded-b-full bg-gradient-to-r from-primary via-sky-300 to-primary text-center text-xs font-extrabold leading-10 text-slate-950 shadow-lg shadow-primary/20"
          style={{ width: Math.min(Math.max(metrics.width * 0.72, 280), 640) }}
        >
          {'S\u00c2N KH\u1ea4U'}
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
    </div>
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
    const seatIds = item.sessionSeatIds || item.session_seat_ids || []
    for (let index = 0; index < item.quantity; index += 1) {
      const sessionSeatId = seatIds[index] || null
      slots.push({
        id: `${item.ticketType.id}-${sessionSeatId || index}-${slots.length}`,
        ticketTypeId: item.ticketType.id,
        sessionSeatId,
        ticketName: item.ticketType.name,
      })
    }
  })
  return slots
}

function buildAttendeesPayload(cart) {
  if (!requiresAttendeeInfo(cart)) return []
  return expandAttendeeSlots(cart).map((slot) => ({
    ticket_type_id: slot.ticketTypeId,
    session_seat_id: slot.sessionSeatId,
    name: cart.attendees?.[slot.id]?.name || '',
    email: cart.attendees?.[slot.id]?.email || '',
  }))
}

function NavigateBackToEvents() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-muted">{'Kh\u00f4ng t\u00ecm th\u1ea5y th\u00f4ng tin \u0111\u1eb7t v\u00e9.'}</p>
      <Link to="/events" className="mt-4 inline-block font-bold text-primary">
        {'Ch\u1ecdn s\u1ef1 ki\u1ec7n'}
      </Link>
    </div>
  )
}

