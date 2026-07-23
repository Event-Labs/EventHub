import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
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
import { checkTicketAvailability, fetchSessionSeats, holdSeats, releaseSeatHolds } from '@/services/events.js'
import { getProfile } from '@/services/user.service.js'
import promotionService from '@/services/promotions.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

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

function seatMapMetrics(seats, seatMap) {
  const layout = buildSeatLayout(seats, seatMap)
  if (layout) return layout
  return null
}

const SEAT_WIDTH = 28
const SEAT_HEIGHT = 28
const SEAT_X_GAP = 8
const SEAT_LAYOUT_PADDING = 20
const SAME_ROW_MESSAGE = 'C\u00e1c gh\u1ebf trong c\u00f9ng m\u1ed9t \u0111\u01a1n ph\u1ea3i thu\u1ed9c c\u00f9ng m\u1ed9t h\u00e0ng.'
const ADJACENT_SEATS_MESSAGE = 'Vui l\u00f2ng ch\u1ecdn c\u00e1c gh\u1ebf li\u1ec1n k\u1ec1 nhau.'
const AISLE_SEATS_MESSAGE = 'C\u00e1c gh\u1ebf \u0111\u00e3 ch\u1ecdn b\u1ecb ng\u0103n c\u00e1ch b\u1edfi l\u1ed1i \u0111i.'
const LONELY_SEAT_MESSAGE = 'L\u1ef1a ch\u1ecdn n\u00e0y s\u1ebd \u0111\u1ec3 l\u1ea1i m\u1ed9t gh\u1ebf tr\u1ed1ng \u0111\u01a1n l\u1ebb. Vui l\u00f2ng ch\u1ecdn c\u1ea3 hai gh\u1ebf ho\u1eb7c ch\u1ecdn v\u1ecb tr\u00ed kh\u00e1c.'
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

function buildSeatLayout(seats, seatMap) {
  const positioned = (seats || []).filter((seat) => Number.isFinite(Number(seat.x_position)) && Number.isFinite(Number(seat.y_position)))
  if (!positioned.length) return null

  const config = seatMap?.config || {}
  const auxiliaryElements = Array.isArray(config.auxiliaryElements) ? config.auxiliaryElements : []
  const standingAreas = Array.isArray(config.standingAreas) ? config.standingAreas : []
  const stagePosition = config.stagePosition || seatMap?.stage_position
  const stage = stagePosition && stagePosition !== 'HIDDEN' ? {
    position: stagePosition,
    label: config.stageLabel || 'SÂN KHẤU',
    x: Number(config.stageX ?? seatMap?.custom_stage_x ?? 0),
    y: Number(config.stageY ?? seatMap?.custom_stage_y ?? 0),
    w: Number(config.stageWidth ?? seatMap?.custom_stage_width ?? 900),
    h: Number(config.stageHeight ?? seatMap?.custom_stage_height ?? 52),
    rotation: Number(config.stageRotation || 0),
    color: config.stageColor || '#3B82F6',
    shape: config.stageShape || 'RECTANGLE',
  } : null
  const allX = positioned.flatMap((seat) => [Number(seat.x_position), Number(seat.x_position) + SEAT_WIDTH])
  const allY = positioned.flatMap((seat) => [Number(seat.y_position), Number(seat.y_position) + SEAT_HEIGHT])
  if (stage) {
    allX.push(stage.x, stage.x + stage.w)
    allY.push(stage.y, stage.y + stage.h)
  }
  auxiliaryElements.forEach((element) => {
    allX.push(Number(element.x), Number(element.x) + Number(element.w))
    allY.push(Number(element.y), Number(element.y) + Number(element.h))
  })
  standingAreas.forEach((area) => {
    allX.push(Number(area.x), Number(area.x) + Number(area.w))
    allY.push(Number(area.y), Number(area.y) + Number(area.h))
  })
  const minX = Math.min(...allX)
  const minY = Math.min(...allY)
  const maxX = Math.max(...allX)
  const maxY = Math.max(...allY)
  const positions = new Map()

  positioned.forEach((seat) => {
    positions.set(seatId(seat), {
      left: Number(seat.x_position) - minX + SEAT_LAYOUT_PADDING,
      top: Number(seat.y_position) - minY + SEAT_LAYOUT_PADDING,
    })
  })

  return {
    positions,
    width: Math.max(320, maxX - minX + SEAT_LAYOUT_PADDING * 2),
    height: Math.max(220, maxY - minY + SEAT_LAYOUT_PADDING * 2),
    stage: stage ? { ...stage, x: stage.x - minX + SEAT_LAYOUT_PADDING, y: stage.y - minY + SEAT_LAYOUT_PADDING } : null,
    auxiliaryElements: auxiliaryElements.map((element) => ({
      ...element,
      x: Number(element.x) - minX + SEAT_LAYOUT_PADDING,
      y: Number(element.y) - minY + SEAT_LAYOUT_PADDING,
      w: Number(element.w),
      h: Number(element.h),
      rotation: Number(element.rotation || 0),
    })),
    standingAreas: standingAreas.map((area) => ({
      ...area,
      x: Number(area.x) - minX + SEAT_LAYOUT_PADDING,
      y: Number(area.y) - minY + SEAT_LAYOUT_PADDING,
      w: Number(area.w),
      h: Number(area.h),
      rotation: Number(area.rotation || 0),
    })),
    canvasBg: config.canvasBg || '#0F172A',
  }
}

function sortedPhysicalSeats(seats) {
  return [...seats].sort((a, b) => {
    const left = Number(a.x_position)
    const right = Number(b.x_position)
    if (Number.isFinite(left) && Number.isFinite(right)) return left - right
    return seatNumberValue(a) - seatNumberValue(b)
  })
}

function physicalPosition(seat) {
  const x = Number(seat?.x_position)
  return Number.isFinite(x) ? x : seatNumberValue(seat)
}

function normalSeatGap(rowSeats) {
  const sorted = sortedPhysicalSeats(rowSeats)
  const gaps = sorted.slice(1).map((seat, index) => physicalPosition(seat) - physicalPosition(sorted[index])).filter((gap) => gap > 0).sort((a, b) => a - b)
  return gaps.length ? gaps[Math.floor((gaps.length - 1) / 2)] : null
}

function physicalNeighborInfo(left, right, rowSeats) {
  if (!left || !right || rowLabel(left) !== rowLabel(right)) return { adjacent: false, aisle: false }
  const leftBlock = left.block_id || left.blockId
  const rightBlock = right.block_id || right.blockId
  if (leftBlock && rightBlock && String(leftBlock) !== String(rightBlock)) return { adjacent: false, aisle: true }

  const explicitRight = left.right_neighbor_id || left.rightNeighborId
  const explicitLeft = right.left_neighbor_id || right.leftNeighborId
  if (explicitRight || explicitLeft) {
    const linked = (!explicitRight || [seatId(right), String(right.seat_id || '')].includes(String(explicitRight))) &&
      (!explicitLeft || [seatId(left), String(left.seat_id || '')].includes(String(explicitLeft)))
    return { adjacent: linked, aisle: !linked }
  }

  const sorted = sortedPhysicalSeats(rowSeats)
  const leftIndex = sorted.findIndex((seat) => seatId(seat) === seatId(left))
  const rightIndex = sorted.findIndex((seat) => seatId(seat) === seatId(right))
  if (leftIndex < 0 || rightIndex !== leftIndex + 1) return { adjacent: false, aisle: false }
  const standardGap = normalSeatGap(rowSeats)
  const gap = physicalPosition(right) - physicalPosition(left)
  const aisle = standardGap !== null && gap > standardGap * 1.6
  return { adjacent: !aisle, aisle }
}

function physicalSegments(rowSeats) {
  const sorted = sortedPhysicalSeats(rowSeats)
  const segments = []
  let current = []
  sorted.forEach((seat, index) => {
    if (index > 0 && !physicalNeighborInfo(sorted[index - 1], seat, sorted).adjacent) {
      if (current.length) segments.push(current)
      current = []
    }
    current.push(seat)
  })
  if (current.length) segments.push(current)
  return segments
}

function singletonSeatIds(rowSeats, selectedIds = new Set()) {
  const singletons = new Set()
  physicalSegments(rowSeats).forEach((segment) => {
    let run = []
    const flush = () => {
      if (run.length === 1) singletons.add(seatId(run[0]))
      run = []
    }
    segment.forEach((seat) => {
      if (isSeatAvailable(seat) && !selectedIds.has(seatId(seat))) run.push(seat)
      else flush()
    })
    flush()
  })
  return singletons
}

function validateSeatSelection({ rules: rawRules, selectedSeatIds, seats }) {
  const rules = normalizeSeatingRules(rawRules)
  const selectedIds = new Set((selectedSeatIds || []).map(String))
  const selected = (seats || []).filter((seat) => selectedIds.has(seatId(seat)))
  if (!selected.length) return []

  const selectedRows = new Set(selected.map(rowLabel))
  if ((rules.require_same_row || rules.require_adjacent_seats) && selectedRows.size > 1) return [SAME_ROW_MESSAGE]

  if (rules.require_adjacent_seats && selected.length >= 2) {
    const rowSeats = (seats || []).filter((seat) => rowLabel(seat) === rowLabel(selected[0]))
    const sorted = sortedPhysicalSeats(selected)
    for (let index = 1; index < sorted.length; index += 1) {
      const relation = physicalNeighborInfo(sorted[index - 1], sorted[index], rowSeats)
      if (!relation.adjacent) return [relation.aisle ? AISLE_SEATS_MESSAGE : ADJACENT_SEATS_MESSAGE]
    }
  }

  if (rules.disallow_single_seat_left) {
    const affectedRows = new Set(selected.map(rowLabel))
    for (const affectedRow of affectedRows) {
      const rowSeats = (seats || []).filter((seat) => rowLabel(seat) === affectedRow)
      const before = singletonSeatIds(rowSeats)
      const after = singletonSeatIds(rowSeats, selectedIds)
      if ([...after].some((id) => !before.has(id))) return [LONELY_SEAT_MESSAGE]
    }
  }

  return []
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

function hasActiveSeatHold(cart) {
  return Boolean(
    (cart?.holdExpiresAt || cart?.hold_expires_at) &&
    secondsLeft(cart.holdExpiresAt || cart.hold_expires_at) > 0 &&
    (cart.selectedSeatIds?.length || cart.items?.some((item) => item.sessionSeatIds?.length)),
  )
}

function initialCartFromLocation(location) {
  const locationCart = normalizeCart(location.state?.cart)
  const draftCart = readBookingDraft()
  const restoredCart = locationCart || draftCart
  const cart = location.pathname === '/booking/seats' && hasActiveSeatHold(restoredCart)
    ? { ...restoredCart, selectedSeatIds: [], items: [] }
    : restoredCart
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
  const toast = useToast()
  const [cart, setCart] = useState(() => initialCartFromLocation(location))
  const seatMapViewportRef = useRef(null)
  const session = cart?.selectedSession || cart?.items?.[0]?.session
  const ticketTypes = (cart?.availableTicketTypes || []).filter((ticketType) =>
    session ? String(ticketType.event_session_id) === String(session.id) : true,
  )
  const [selectedSeatIds, setSelectedSeatIds] = useState(
    cart?.selectedSeatIds || cart?.items?.flatMap((item) => item.sessionSeatIds || []) || [],
  )
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [seatZoom, setSeatZoom] = useState(1)
  const [invalidSeatId, setInvalidSeatId] = useState(null)
  const [standingTicketType, setStandingTicketType] = useState(null)
  const [resettingSelection, setResettingSelection] = useState(false)

  const seatsQuery = useQuery({
    queryKey: ['session-seats', session?.id],
    queryFn: () => fetchSessionSeats(session.id),
    enabled: Boolean(session),
  })

  useEffect(() => {
    if (seatsQuery.isError) {
      toast.error(getApiMessage(seatsQuery.error, 'Không thể tải sơ đồ ghế. Vui lòng thử lại.'))
    }
  }, [seatsQuery.error, seatsQuery.isError, toast])

  const fitSeatMapToViewport = useCallback(() => {
    if (!seatMapViewportRef.current) return
    const layout = seatMapMetrics(seatsQuery.data?.seats || [], seatsQuery.data?.seat_map)
    const cols = Number(seatsQuery.data?.seat_map?.cols_count || 8)
    const estimatedSeatMapWidth = layout?.width || cols * (SEAT_WIDTH + SEAT_X_GAP) + SEAT_LAYOUT_PADDING * 2
    const viewportWidth = seatMapViewportRef.current.clientWidth
    const nextZoom = clamp((viewportWidth - 8) / estimatedSeatMapWidth, 0.45, 1)
    setSeatZoom(Number(nextZoom.toFixed(2)))
  }, [seatsQuery.data?.seat_map, seatsQuery.data?.seats])

  useEffect(() => {
    if (!seatsQuery.data?.seats?.length) return
    fitSeatMapToViewport()
  }, [fitSeatMapToViewport, seatsQuery.data?.seats?.length])

  const seatData = seatsQuery.data?.seats || []
  const seatingRules = cart?.seatingRules || cart?.seating_rules || {}
  const colorByTicketTypeId = useMemo(() => {
    const colors = new Map()
      ; (seatData || []).forEach((seat) => {
        const color = seat.zone?.color || seat.seat_type?.color
        if (!color) return
        const seatZoneId = seat.zone_id || seat.zone?.id
          ; (seat.ticket_type_ids || []).forEach((id) => {
            if (!colors.has(String(id))) colors.set(String(id), color)
          })
          ; (ticketTypes || []).forEach((ticketType) => {
            if (ticketType.zone_id && seatZoneId && String(ticketType.zone_id) === String(seatZoneId)) {
              colors.set(String(ticketType.id), color)
            }
          })
      })
    const standingAreas = seatsQuery.data?.seat_map?.config?.standingAreas || []
    ; (ticketTypes || []).forEach((ticketType) => {
      if (ticketType.is_seated !== false) return
      const area = standingAreas.find(
        (item) => item.name?.trim().toLowerCase() === ticketType.name?.trim().toLowerCase(),
      )
      if (area?.color) colors.set(String(ticketType.id), area.color)
    })
    return colors
  }, [seatData, seatsQuery.data?.seat_map?.config?.standingAreas, ticketTypes])
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

  const seatedItems = buildDisplayItems(selectedSeatIds)
  const unseatedItems = (cart?.items || []).filter(
    (item) => item.ticketType?.is_seated === false && Number(item.quantity || 0) > 0,
  )
  const displayItems = [...seatedItems, ...unseatedItems]
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
      toast.error(seatRuleIssue)
      return
    }
    setCheckingAvailability(true)
    try {
      const hold = await holdSeats(availabilityPayloadFromCart(nextCart))
      const hasSelectedSeats = nextCart.items.some((item) => item.sessionSeatIds?.length > 0)
      const heldCart = {
        ...nextCart,
        holdExpiresAt: hold.hold_expires_at || (hasSelectedSeats
          ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
          : null),
      }
      saveBookingDraft(heldCart)
      navigate('/booking/attendees', { state: { cart: heldCart } })
    } catch (err) {
      toast.error(getApiMessage(err, 'Không thể giữ ghế bạn đã chọn. Vui lòng thử lại.'))
      seatsQuery.refetch()
    } finally {
      setCheckingAvailability(false)
    }
  }

  const resetSelection = async () => {
    setResettingSelection(true)
    try {
      if (hasActiveSeatHold(displayCart)) {
        await releaseSeatHolds({
          event_id: displayCart.eventId,
          session_seat_ids: displayCart.items.flatMap((item) => item.sessionSeatIds || []),
        })
      }

      const resetCart = {
        ...displayCart,
        selectedSeatIds: [],
        items: [],
        attendees: {},
        holdExpiresAt: null,
        hold_expires_at: null,
        promo: null,
        promoCode: '',
      }
      setSelectedSeatIds([])
      setStandingTicketType(null)
      setCart(resetCart)
      saveBookingDraft(resetCart)
      await seatsQuery.refetch()
      toast.success('Đã xóa các vé đã chọn. Bạn có thể chọn lại ngay bây giờ.')
    } catch (err) {
      toast.error(getApiMessage(err, 'Chưa thể xóa các vé đã chọn. Vui lòng thử lại.'))
      throw err
    } finally {
      setResettingSelection(false)
    }
  }
  const toggleSeat = (seatId) => {
    const nextSeatIds = selectedSeatIds.includes(seatId)
      ? selectedSeatIds.filter((id) => id !== seatId)
      : [...selectedSeatIds, seatId]

    const issue = validateSeatSelection({ rules: seatingRules, selectedSeatIds: nextSeatIds, seats: seatData })[0] || ''
    if (issue) {
      setInvalidSeatId(seatId)
      toast.error(issue)
      window.setTimeout(() => setInvalidSeatId((currentId) => currentId === seatId ? null : currentId), 1200)
      return
    }

    setInvalidSeatId(null)
    setSelectedSeatIds(nextSeatIds)
  }

  const updateUnseatedQuantity = (ticketType, delta) => {
    setCart((current) => {
      const coloredTicketType = {
        ...ticketType,
        color: ticketTypeColor(ticketType, colorByTicketTypeId),
      }
      const items = [...(current?.items || [])]
      const itemIndex = items.findIndex(
        (item) => String(item.ticketType.id) === String(ticketType.id),
      )
      const existing = itemIndex >= 0
        ? items[itemIndex]
        : { ticketType: coloredTicketType, quantity: 0, sessionSeatIds: [], seatLabels: [], session }
      const available = Math.max(0, Number(ticketType.available_quantity ?? ticketType.quantity ?? 0))
      const perOrder = Math.max(1, Number(ticketType.max_per_order || 20))
      const maximum = Math.min(available, perOrder)
      const quantity = clamp(Number(existing.quantity || 0) + delta, 0, maximum)
      const nextItem = { ...existing, ticketType: coloredTicketType, quantity }

      if (itemIndex >= 0) items[itemIndex] = nextItem
      else if (quantity > 0) items.push(nextItem)

      return {
        ...current,
        items: items.filter((item) => Number(item.quantity || 0) > 0),
      }
    })
  }

  const unseatedTicketTypes = ticketTypes.filter((ticketType) => ticketType.is_seated === false)
  const hasSeatMap = seatData.length > 0

  return (
    <BookingShell step={1} cart={displayCart}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <PageTitle
            title={hasSeatMap ? 'Ch\u1ecdn gh\u1ebf' : 'Ch\u1ecdn v\u00e9'}
            subtitle={hasSeatMap
              ? 'Ch\u1ecdn gh\u1ebf tr\u1ef1c ti\u1ebfp tr\u00ean s\u01a1 \u0111\u1ed3 s\u00e2n kh\u1ea5u'
              : 'Ch\u1ecdn lo\u1ea1i v\u00e9 v\u00e0 s\u1ed1 l\u01b0\u1ee3ng mong mu\u1ed1n'}
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
                      seatMap={seatsQuery.data?.seat_map}
                      invalidSeatId={invalidSeatId}
                      onSelectStandingArea={(area, index) => {
                        const ticketType = unseatedTicketTypes.find(
                          (type) => type.name?.trim().toLowerCase() === area.name?.trim().toLowerCase(),
                        ) || unseatedTicketTypes[index]
                        if (ticketType) setStandingTicketType(ticketType)
                      }}
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
            ) : unseatedTicketTypes.length === 0 ? (
              <p className="text-muted text-center font-medium">{'S\u1ef1 ki\u1ec7n n\u00e0y hi\u1ec7n kh\u00f4ng c\u00f3 s\u01a1 \u0111\u1ed3 ch\u1ed7 ng\u1ed3i'}</p>
            ) : null}

            {!hasSeatMap && unseatedTicketTypes.length > 0 && (
              <div className={'space-y-3'}>
                {unseatedTicketTypes.map((ticketType) => (
                  <UnseatedTicketRow
                    key={ticketType.id}
                    ticketType={ticketType}
                    quantity={Number((cart?.items || []).find(
                      (item) => String(item.ticketType.id) === String(ticketType.id),
                    )?.quantity || 0)}
                    onDecrease={() => updateUnseatedQuantity(ticketType, -1)}
                    onIncrease={() => updateUnseatedQuantity(ticketType, 1)}
                  />
                ))}
              </div>
            )}

            {seatsQuery.data?.seats?.length > 0 && (
              <p className="mt-4 text-sm text-muted">
                {'\u0110\u00e3 ch\u1ecdn '}<span className="font-bold text-primary">{selectedSeatIds.length}</span>{' gh\u1ebf.'}
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
          onReset={resetSelection}
          resetDisabled={resettingSelection || displayItems.length === 0}
        />
      </div>
      {standingTicketType && (
        <StandingQuantityModal
          ticketType={standingTicketType}
          quantity={Number((cart?.items || []).find(
            (item) => String(item.ticketType.id) === String(standingTicketType.id),
          )?.quantity || 0)}
          onDecrease={() => updateUnseatedQuantity(standingTicketType, -1)}
          onIncrease={() => updateUnseatedQuantity(standingTicketType, 1)}
          onClose={() => setStandingTicketType(null)}
        />
      )}
    </BookingShell>
  )
}

export function BookingAttendeesPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const [cart, setCart] = useState(() => initialCartFromLocation(location))
  const attendeeSlots = useMemo(() => expandAttendeeSlots(cart), [cart])
  const collectAttendees = requiresAttendeeInfo(cart)
  const [attendees, setAttendees] = useState(cart?.attendees || {})
  const [buyer, setBuyer] = useState(cart?.buyer || { name: '', email: '', phone: '' })


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
        .catch(() => { })
    }
  }, [buyer.email])

  if (!cart?.items?.length) return <NavigateBackToEvents />

  const showFormError = (message) => {
    toast.error(message)
  }

  const updateAttendee = (slotId, field, value) => {
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
          <Panel>
            <h2 className="mb-4 font-display text-xl font-bold text-white">{'Ng\u01b0\u1eddi mua'}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Input label={'H\u1ecd v\u00e0 t\u00ean'} value={buyer.name} onChange={(value) => setBuyer((current) => ({ ...current, name: value }))} />
              <Input label="Email" type="email" value={buyer.email} onChange={(value) => setBuyer((current) => ({ ...current, email: value }))} />
              <Input label={'S\u1ed1 \u0111i\u1ec7n tho\u1ea1i'} value={buyer.phone} onChange={(value) => setBuyer((current) => ({ ...current, phone: value }))} />
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
  const toast = useToast()
  const [cart, setCart] = useState(() => initialCartFromLocation(location))
  const [promoCode, setPromoCode] = useState(cart?.promoCode || '')
  const [selectedPromo, setSelectedPromo] = useState(cart?.promo || null)
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [checkingAvailability, setCheckingAvailability] = useState(false)


  if (!cart?.items?.length) return <NavigateBackToEvents />

  const collectAttendees = requiresAttendeeInfo(cart)

  const continueFlow = async () => {
    const nextCart = { ...cart, promoCode, promo: selectedPromo }
    setCheckingAvailability(true)
    try {
      const result = await checkTicketAvailability(availabilityPayloadFromCart(nextCart))
      if (!result.available) {
        const message = result.message || 'Vé/ghế bạn chọn không còn khả dụng. Vui lòng chọn lại.'
        toast.error(message)
        navigate('/booking/seats', { state: { cart: nextCart } })
        return
      }
      saveBookingDraft(nextCart)
      navigate('/booking/payment', { state: { cart: nextCart } })
    } catch (err) {
      const message = getApiMessage(err, 'Không thể kiểm tra tình trạng vé/ghế. Vui lòng thử lại.')
      toast.error(message)
      navigate('/booking/seats', { state: { cart: nextCart } })
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
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const existingOrderId = searchParams.get('orderId')
  const [cart, setCart] = useState(() => initialCartFromLocation(location))
  const [checkout, setCheckout] = useState(location.state?.checkout || null)
  const checkoutStartedRef = useRef(Boolean(location.state?.checkout || existingOrderId))
  const orderId = existingOrderId || checkout?.order?.id

  const checkoutMutation = useMutation({
    mutationFn: checkoutOrder,
    onSuccess: (data) => {
      toast.success('Đã tạo thanh toán PayOS. Vui lòng hoàn tất thanh toán trong thời gian giữ vé.')
      setCheckout(data)
      const paymentCart = { ...cart, holdExpiresAt: data.order?.expired_at || cart?.holdExpiresAt }
      setCart(paymentCart)
      saveBookingDraft(paymentCart)
      navigate(`/booking/payment?orderId=${data.order.id}`, { replace: true, state: { cart: paymentCart, checkout: data } })
    },
    onError: (err) => {
      const message = getApiMessage(err, 'Không thể tạo thanh toán PayOS. Vui lòng thử lại.')
      toast.error(message)
    },
  })

  const handleCancelOrder = async () => {
    if (!orderId) return
    try {
      await cancelOrder(orderId)
      toast.success('Đã hủy đặt vé.')
    } catch (err) {
      toast.error(getApiMessage(err, 'Không thể hủy đặt vé. Vui lòng thử lại.'))
      throw err
    }
  }

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
    if (statusQuery.isError) {
      toast.error(getApiMessage(statusQuery.error, 'Không thể kiểm tra trạng thái thanh toán.'))
    }
  }, [statusQuery.error, statusQuery.isError, toast])

  useEffect(() => {
    if (order?.status === 'PAID') {
      clearBookingDraft()
      navigate('/my-tickets', { replace: true })
    }
  }, [navigate, order?.status])

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
        <OrderCard cart={cart} setCart={setCart} cta={'\u0110ang ch\u1edd thanh to\u00e1n'} disabled onCancel={handleCancelOrder} />
      </div>
    </BookingShell>
  )
}

function BookingShell({ step, cart, children }) {
  const labels = ['Gh\u1ebf', 'Th\u00f4ng tin', 'Ki\u1ec3m tra', 'Thanh to\u00e1n']
  const navigate = useNavigate()
  const [tick, setTick] = useState(0)
  const holdExpiresAt = cart?.holdExpiresAt || cart?.hold_expires_at
  const remaining = secondsLeft(holdExpiresAt) + tick * 0

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
                  className={`grid size-11 place-items-center rounded-full text-sm font-bold transition ${active
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
              <p className="text-xs font-bold uppercase text-tertiary">{'\u0110\u1eb7t v\u00e9'}</p>
              <h2 className="font-display text-xl font-bold text-white">{cart.eventTitle}</h2>
            </div>
            {holdExpiresAt && (
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

function OrderCard({ cart, cta, onClick, disabled, onCancel, onReset, resetDisabled = false, colorByTicketTypeId, hideUnselectedTickets = false }) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
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
          onClick={() => onReset ? setResetOpen(true) : setCancelOpen(true)}
          disabled={Boolean(onReset) && resetDisabled}
          className="text-sm font-bold text-primary hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {'Chọn lại vé'}
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
                  style={{ backgroundColor: ticketTypeColor(ticketType, colorByTicketTypeId) }}
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
      {resetOpen && (
        <ResetSelectionModal
          onStay={() => setResetOpen(false)}
          onReset={() => {
            Promise.resolve(onReset()).then(() => setResetOpen(false)).catch(() => {})
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
    <ModalFrame>
      <div className="flex items-center justify-between border-b border-border-soft/50 pb-5">
        <div>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-content">{'Ch\u1ecdn voucher'}</h2>
        </div>
        <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-panel-soft hover:text-content" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <div className="flex min-h-12 flex-1 items-center gap-3 rounded-lg border border-border-soft bg-background/60 px-4 transition focus-within:border-primary">
          <Ticket className="size-5 text-primary" />
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={'Nh\u1eadp m\u00e3 voucher'} className="w-full bg-transparent text-content outline-none placeholder:text-muted" />
        </div>
        <button type="button" onClick={applyDraft} className="rounded-lg bg-tertiary px-6 py-3 font-bold text-white transition hover:bg-orange-600">{'\u00c1p d\u1ee5ng'}</button>
      </div>

      <h3 className="mt-6 font-display text-lg font-bold text-content">{'Voucher t\u1eeb Ban t\u1ed5 ch\u1ee9c'}</h3>
      <div className="mt-4 space-y-3">
        {promosQuery.isLoading && <p className="rounded-lg border border-border-soft bg-panel py-8 text-center font-semibold text-muted">{'\u0110ang t\u1ea3i voucher...'}</p>}
        {!promosQuery.isLoading && organizerPromos.length === 0 && <p className="rounded-lg border border-dashed border-border-soft bg-panel/60 py-8 text-center font-semibold text-muted">{'Ch\u01b0a c\u00f3 voucher n\u00e0o'}</p>}
        {organizerPromos.map((promo) => {
          const checked = selectedPromo?.id === promo.id || draft.trim().toUpperCase() === String(promo.code).toUpperCase()
          const usable = isPromoUsable(promo, subtotal)
          return (
            <button key={promo.id} type="button" disabled={!usable} onClick={() => choosePromo(promo)} className={`flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition ${checked ? 'border-primary bg-primary/10 shadow-lg shadow-primary/5' : 'border-border-soft bg-panel'} ${usable ? 'hover:border-primary/70 hover:bg-panel-soft' : 'cursor-not-allowed opacity-50'}`}>
              <div>
                <p className="font-bold text-content">{formatPromoTitle(promo)}</p>
                <p className="mt-1 text-sm text-muted">{'M\u00e3'}: <span className="font-mono font-semibold text-primary">{promo.code}</span></p>
                <p className="mt-1 text-sm text-muted">{'\u0110\u01a1n t\u1ed1i thi\u1ec3u'} {formatPrice(promo.min_order_value || 0)}</p>
                {promo.discount_type === 'PERCENTAGE' && promo.max_discount !== null && promo.max_discount !== undefined && <p className="mt-1 text-sm text-muted">{'Gi\u1ea3m t\u1ed1i \u0111a'} {formatPrice(promo.max_discount)}</p>}
                <p className="mt-2 text-sm text-primary">HSD: {formatDateOnly(promo.end_time)}</p>
                {!usable && <p className="mt-2 text-xs font-bold text-error">{'\u0110\u01a1n h\u00e0ng ch\u01b0a \u0111\u1ee7 \u0111i\u1ec1u ki\u1ec7n \u00e1p d\u1ee5ng'}</p>}
              </div>
              <span className={`grid size-7 shrink-0 place-items-center rounded-full border-2 ${checked ? 'border-primary' : 'border-border-soft'}`}>
                {checked && <Check className="size-4 text-primary" />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 border-t border-border-soft/50 pt-5 sm:grid-cols-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-border-soft py-3 font-bold text-muted transition hover:border-content/40 hover:text-content">{'H\u1ee7y b\u1ecf'}</button>
        <button type="button" onClick={() => { applyDraft(); onClose() }} className="rounded-lg bg-tertiary py-3 font-bold text-white transition hover:bg-orange-600">Xong</button>
      </div>
    </ModalFrame>
  )
}

function CancelBookingModal({ onStay, onCancel }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onStay()}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="cancel-booking-title" className="w-full max-w-md rounded-2xl border border-border-soft/50 bg-surface p-6 text-content shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-error/15"><AlertTriangle className="size-5 text-error" /></span>
          <div>
            <h2 id="cancel-booking-title" className="font-display text-xl font-extrabold">{'H\u1ee7y \u0111\u01a1n h\u00e0ng?'}</h2>
            <p className="mt-1 text-sm text-muted">{'B\u1ea1n c\u00f3 ch\u1eafc ch\u1eafn mu\u1ed1n ti\u1ebfp t\u1ee5c?'}</p>
          </div>
        </div>
        <ul className="mt-5 space-y-2 rounded-xl border border-error/20 bg-error/5 p-4 text-sm text-muted">
          <li className="flex gap-2"><span className="text-error">&bull;</span><span>{'B\u1ea1n s\u1ebd m\u1ea5t v\u1ecb tr\u00ed m\u00ecnh \u0111\u00e3 l\u1ef1a ch\u1ecdn.'}</span></li>
          <li className="flex gap-2"><span className="text-error">&bull;</span><span>{'\u0110\u01a1n h\u00e0ng \u0111ang thanh to\u00e1n c\u00f3 th\u1ec3 b\u1ecb h\u1ee7y.'}</span></li>
        </ul>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onStay} className="rounded-lg border border-border-soft px-5 py-3 font-bold text-muted transition hover:border-content/40 hover:text-content">{'\u1ede l\u1ea1i'}</button>
          <button type="button" onClick={onCancel} className="rounded-lg bg-error px-5 py-3 font-bold text-white transition hover:bg-error/90">{'H\u1ee7y \u0111\u01a1n'}</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function ResetSelectionModal({ onStay, onReset }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onStay()}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="reset-selection-title" className="w-full max-w-md rounded-2xl border border-border-soft/50 bg-surface p-6 text-content shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-tertiary/15"><RefreshCw className="size-5 text-tertiary" /></span>
          <div>
            <h2 id="reset-selection-title" className="font-display text-xl font-extrabold">Bạn muốn chọn lại vé?</h2>
            <p className="mt-1 text-sm text-muted">Các vé bạn đang chọn sẽ được xóa để bạn chọn lại từ đầu.</p>
          </div>
        </div>
        <p className="mt-5 rounded-xl border border-tertiary/20 bg-tertiary/5 p-4 text-sm text-muted">
          Ghế và số lượng vé đã chọn sẽ được xóa. Bạn vẫn ở trang này và có thể chọn vé mới ngay.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onStay} className="rounded-lg border border-border-soft px-5 py-3 font-bold text-muted transition hover:border-content/40 hover:text-content">Giữ vé đã chọn</button>
          <button type="button" onClick={onReset} className="rounded-lg bg-tertiary px-5 py-3 font-bold text-white transition hover:bg-orange-600">Chọn lại từ đầu</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
function ModalFrame({ children }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl border border-border-soft/50 bg-surface p-6 text-content shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        {children}
      </section>
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

function StandingQuantityModal({ ticketType, quantity, onDecrease, onIncrease, onClose }) {
  return createPortal(
    <div className={'fixed inset-0 z-50 grid place-items-center bg-black/70 p-4'} onClick={onClose}>
      <div className={'w-full max-w-md rounded-xl border border-border-soft bg-panel p-6 shadow-2xl'} onClick={(event) => event.stopPropagation()}>
        <div className={'flex items-start justify-between gap-4'}>
          <div><p className={'text-xs font-bold uppercase text-tertiary'}>{'Khu vực đứng'}</p><h3 className={'mt-1 text-xl font-bold text-white'}>{ticketType.name}</h3></div>
          <button type={'button'} onClick={onClose} className={'text-muted hover:text-white'}><X className={'size-5'} /></button>
        </div>
        <p className={'mt-4 whitespace-pre-line text-sm leading-6 text-muted'}>{ticketType.description || 'Khu vực đứng, không có ghế ngồi cố định.'}</p>
        <div className={'mt-5 flex items-center justify-between gap-4'}>
          <p className={'font-bold text-primary'}>{formatPrice(ticketType.price)} / vé</p>
          <QuantityStepper quantity={quantity} onDecrease={onDecrease} onIncrease={onIncrease} />
        </div>
        <button
          type={'button'}
          onClick={onClose}
          className={'mt-6 w-full rounded-md bg-tertiary py-3 font-bold text-white shadow-lg shadow-tertiary/30 transition duration-200 hover:-translate-y-0.5 hover:bg-orange-500 hover:shadow-xl hover:shadow-tertiary/40 active:translate-y-0'}
        >
          {'Xong'}
        </button>
      </div>
    </div>,
    document.body,
  )
}

function QuantityStepper({ quantity, onDecrease, onIncrease, className = '' }) {
  return (
    <div className={`flex items-center justify-end gap-4 ${className}`}>
      <button type={'button'} onClick={onDecrease} disabled={quantity <= 0} className={'grid size-9 place-items-center rounded-full border border-border-soft text-white disabled:opacity-40'}><Minus className={'size-4'} /></button>
      <span className={'min-w-8 text-center text-xl font-bold text-white'}>{quantity}</span>
      <button type={'button'} onClick={onIncrease} className={'grid size-9 place-items-center rounded-full bg-tertiary text-white'}><Plus className={'size-4'} /></button>
    </div>
  )
}

function UnseatedTicketRow({ ticketType, quantity, onDecrease, onIncrease }) {
  return (
    <div className={'px-2 py-1'}>
      <div className={'flex items-start justify-between gap-4'}>
        <div><p className={'font-bold text-white'}>{ticketType.name}</p><p className={'mt-1 text-sm text-muted'}>{ticketType.description}</p></div>
        <p className={'font-bold text-primary'}>{formatPrice(ticketType.price)}</p>
      </div>
      <QuantityStepper className={'mt-4'} quantity={quantity} onDecrease={onDecrease} onIncrease={onIncrease} />
    </div>
  )
}

function stageShapeStyle(shape) {
  if (shape === 'CIRCLE') return { borderRadius: '50%' }
  if (shape === 'SEMI_CIRCLE') return { borderRadius: '999px 999px 0 0' }
  if (shape === 'DIAMOND') return { clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' }
  if (shape === 'T_STAGE') return { clipPath: 'polygon(0 0, 100% 0, 100% 45%, 70% 45%, 70% 100%, 30% 100%, 30% 45%, 0 45%)' }
  return { borderRadius: 8 }
}

function SeatMapCanvas({ seats, ticketTypes, selectedSeatIds, onToggleSeat, onSelectStandingArea, seatZoom, colsCount, seatMap, invalidSeatId }) {
  const metrics = seatMapMetrics(seats, seatMap)
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
        className={`rounded-md border text-[10px] font-bold transition ${String(invalidSeatId) === String(seat.session_seat_id) ? 'ring-2 ring-error/70 ' : ''}${selected
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
      style={{
        width: metrics.width * seatZoom,
        height: metrics.height * seatZoom,
        backgroundColor: metrics.canvasBg,
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
        backgroundSize: `${20 * seatZoom}px ${20 * seatZoom}px`,
      }}
    >
      <div
        className="relative origin-top-left"
        style={{ width: metrics.width, height: metrics.height, transform: `scale(${seatZoom})` }}
      >
        {metrics.stage && (
          <div
            className="absolute grid place-items-center overflow-hidden border-2 border-white/30 px-2 text-center text-xs font-extrabold text-white shadow-lg shadow-slate-950/20"
            style={{
              left: metrics.stage.x,
              top: metrics.stage.y,
              width: metrics.stage.w,
              height: metrics.stage.h,
              transform: metrics.stage.rotation ? `rotate(${metrics.stage.rotation}deg)` : undefined,
              transformOrigin: 'center',
              backgroundColor: metrics.stage.color,
              ...stageShapeStyle(metrics.stage.shape),
            }}
          >
            <span style={{ transform: metrics.stage.h > metrics.stage.w ? 'rotate(-90deg)' : undefined }}>
              {metrics.stage.label}
            </span>
          </div>
        )}
        {metrics.standingAreas.map((area, index) => (
          <button
            key={area.id || index}
            type={'button'}
            title={area.name}
            aria-label={area.name}
            style={{
              position: 'absolute',
              left: area.x,
              top: area.y,
              width: area.w,
              height: area.h,
              color: '#ffffff',
              background: `color-mix(in srgb, ${area.color || '#EF4444'} 25%, transparent)`,
              borderColor: area.color || '#EF4444',
              borderStyle: 'dashed',
              transform: area.rotation ? `rotate(${area.rotation}deg)` : undefined,
            }}
            className={'flex flex-col items-center justify-center rounded-xl border-2 text-xs font-extrabold text-white shadow-lg'}
            onClick={() => onSelectStandingArea?.(area, index)}
          >
            <span>{area.name}</span>
            <span className={'mt-1 text-[10px] font-semibold text-white/85'}>Sức chứa: {area.capacity || 0} người</span>
          </button>
        ))}
        {metrics.auxiliaryElements.map((element, index) => (
          <div
            key={element.id || `aux-${index}`}
            className="absolute grid place-items-center overflow-hidden rounded-md border border-border-soft bg-panel-soft px-2 text-center text-[11px] font-bold text-content"
            style={{
              left: element.x,
              top: element.y,
              width: element.w,
              height: element.h,
              transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
              transformOrigin: 'center',
            }}
          >
            {element.label}
          </div>
        ))}
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
    ; (cart?.items || []).forEach((item) => {
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

