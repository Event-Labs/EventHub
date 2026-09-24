import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  ExternalLink,
  FileText,
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
import { checkTicketAvailability, fetchEventDetail, fetchSessionSeats, holdSeats, releaseSeatHolds } from '@/services/events.js'
import { getProfile } from '@/services/user.service.js'
import promotionService from '@/services/promotions.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { generateRefundPolicyLines } from '@/utils/refundPolicy.js'
import {
  clearBookingDraft,
  formatCountdown,
  hasActiveSeatHold,
  readBookingDraft,
  saveBookingDraft,
  secondsLeft,
} from '@/utils/bookingDraft.js'

function formatPrice(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0 \u0111'
  return `${number.toLocaleString('vi-VN')} \u0111`
}

function formatFileSize(bytes) {
  const size = Number(bytes)
  if (!size || isNaN(size)) return ''
  const kb = size / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function ticketAvailability(ticketType) {
  const total = Math.max(0, Number(ticketType?.quantity ?? 0))
  const available = Math.min(
    total,
    Math.max(0, Number(ticketType?.available_quantity ?? total)),
  )
  return { available, total }
}

function formatDateTime(value) {
  if (!value) return 'Chưa cập nhật'
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return 'Chưa cập nhật'
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d)
  } catch {
    return 'Chưa cập nhật'
  }
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
    max_tickets_per_order: Number.isInteger(Number(raw?.max_tickets_per_order)) && Number(raw?.max_tickets_per_order) > 0
      ? Number(raw?.max_tickets_per_order)
      : 10,
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

function initialCartFromLocation(location) {
  const locationCart = normalizeCart(location.state?.cart)
  const draftCart = readBookingDraft()
  let restoredCart = null

  if (locationCart) {
    restoredCart = (draftCart && String(draftCart.eventId) === String(locationCart.eventId))
      ? { ...draftCart, ...locationCart }
      : locationCart
  } else {
    restoredCart = draftCart
  }

  if (restoredCart) {
    const expiresAt =
      restoredCart.holdExpiresAt ||
      restoredCart.hold_expires_at ||
      draftCart?.holdExpiresAt ||
      draftCart?.hold_expires_at
    if (expiresAt) {
      if (secondsLeft(expiresAt) <= 0) {
        restoredCart.holdExpiresAt = null
        restoredCart.hold_expires_at = null
        restoredCart.selectedSeatIds = []
        restoredCart.items = []
        clearBookingDraft()
      } else {
        restoredCart.holdExpiresAt = expiresAt
        restoredCart.hold_expires_at = expiresAt
        saveBookingDraft(restoredCart)
      }
    }
  }

  return restoredCart
}
const TICKET_COLOR_PALETTE = [
  '#38bdf8',
  '#f97316',
  '#a855f7',
  '#22c55e',
  '#eab308',
  '#ef4444',
  '#14b8a6',
  '#ec4899',
]

function fallbackTicketTypeColor(ticketType) {
  const identity = String(ticketType?.id || ticketType?.name || 'ticket')
  const hash = [...identity].reduce(
    (result, character) => ((result * 31) + character.charCodeAt(0)) >>> 0,
    0,
  )
  return TICKET_COLOR_PALETTE[hash % TICKET_COLOR_PALETTE.length]
}

function ticketTypeColor(ticketType, colorByTicketTypeId) {
  return (
    colorByTicketTypeId?.get(String(ticketType?.id)) ||
    ticketType?.color ||
    ticketType?.zone?.color ||
    ticketType?.seat_type?.color ||
    fallbackTicketTypeColor(ticketType)
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

  useEffect(() => {
    if (location.state?.cart) {
      const nextCart = location.state.cart
      setCart(nextCart)
      setSelectedSeatIds(nextCart.selectedSeatIds || [])
    }
  }, [location.state])

  useEffect(() => {
    if (cart?.holdExpiresAt && secondsLeft(cart.holdExpiresAt) <= 0) {
      setCart((prev) => ({
        ...prev,
        selectedSeatIds: [],
        items: [],
        holdExpiresAt: null,
        hold_expires_at: null,
      }))
      setSelectedSeatIds([])
      clearBookingDraft()
    }
  }, [cart?.holdExpiresAt])

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
    const seatsById = new Map(
      seatData.flatMap((seat) => [
        [seatId(seat), seat],
        [seat.session_seat_id, seat],
        [seat.id, seat],
      ].filter(([k]) => Boolean(k)))
    )
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
      const holdExpiresAt = hold.hold_expires_at || new Date(Date.now() + 15 * 60 * 1000).toISOString()
      const heldCart = {
        ...nextCart,
        holdExpiresAt,
        hold_expires_at: holdExpiresAt,
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
  const maxTicketsAllowed = Number(seatingRules?.max_tickets_per_order) > 0
    ? Number(seatingRules.max_tickets_per_order)
    : 10

  const toggleSeat = (seatId) => {
    const isDeselecting = selectedSeatIds.includes(seatId)
    if (!isDeselecting && selectedSeatIds.length >= maxTicketsAllowed) {
      toast.error(`Bạn chỉ được chọn tối đa ${maxTicketsAllowed} ghế trong một lần đặt.`)
      return
    }

    const nextSeatIds = isDeselecting
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
      const currentTotalTickets = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
      if (delta > 0 && currentTotalTickets >= maxTicketsAllowed) {
        toast.error(`Bạn chỉ được mua tối đa ${maxTicketsAllowed} vé trong một lần đặt.`)
        return current
      }

      const itemIndex = items.findIndex(
        (item) => String(item.ticketType.id) === String(ticketType.id),
      )
      const existing = itemIndex >= 0
        ? items[itemIndex]
        : { ticketType: coloredTicketType, quantity: 0, sessionSeatIds: [], seatLabels: [], session }
      const available = Math.max(0, Number(ticketType.available_quantity ?? ticketType.quantity ?? 0))
      const perOrder = Math.min(Math.max(1, Number(ticketType.max_per_order || 20)), maxTicketsAllowed)
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <section className="space-y-5">
          <Panel unstyled={!hasSeatMap && unseatedTicketTypes.length > 0}>
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
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                <p>
                  Đã chọn <span className="font-bold text-primary">{selectedSeatIds.length}</span>/{maxTicketsAllowed} ghế
                </p>
                <span className="text-xs text-subtle">
                  (Tối đa {maxTicketsAllowed} vé/ghế mỗi lần đặt)
                </span>
              </div>
            )}

          </Panel>
        </section>
        <OrderCard
          cart={displayCart}
          setCart={setCart}
          colorByTicketTypeId={colorByTicketTypeId}
          cta={'Tiếp tục'}
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

  const { data: eventDetail } = useQuery({
    queryKey: ['booking-attendees-event-detail', cart?.eventId],
    queryFn: () => fetchEventDetail(cart.eventId),
    enabled: Boolean(cart?.eventId),
    staleTime: 1000 * 60 * 5,
  })

  const collectAttendees = Boolean(
    cart?.requireAttendeeInfo ??
    cart?.require_attendee_info ??
    eventDetail?.require_attendee_info
  )

  const attendeeSlots = useMemo(() => expandAttendeeSlots(cart), [cart])
  const [attendees, setAttendees] = useState(cart?.attendees || {})
  const [buyer, setBuyer] = useState(cart?.buyer || { name: '', email: '', phone: '' })

  useEffect(() => {
    if (!buyer.email) {
      getProfile()
        .then((profile) => {
          setBuyer((prev) => ({
            name: prev.name || profile.full_name || '',
            email: prev.email || profile.email || '',
            phone: prev.phone || profile.phone || '',
          }))
        })
        .catch(() => { })
    }
  }, [buyer.email])

  useEffect(() => {
    if (!cart?.items?.length) return
    const holdExpiresAt =
      cart.holdExpiresAt ||
      cart.hold_expires_at ||
      readBookingDraft()?.holdExpiresAt ||
      new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const updatedCart = {
      ...cart,
      holdExpiresAt,
      hold_expires_at: holdExpiresAt,
      buyer,
      attendees,
      requireAttendeeInfo: collectAttendees,
    }
    if (!cart.holdExpiresAt) {
      setCart(updatedCart)
    }
    saveBookingDraft(updatedCart)
  }, [buyer, attendees, collectAttendees, cart])

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
      showFormError('Vui lòng nhập đầy đủ thông tin người mua.')
      return
    }

    if (!isEmail(cleanBuyer.email)) {
      showFormError('Email người mua không hợp lệ.')
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
        showFormError(`Vui lòng nhập đầy đủ họ tên và email hợp lệ cho vé ${invalidSlotIndex + 1}.`)
        return
      }
    }
    const nextCart = { ...cart, attendees: cleanAttendees, buyer: cleanBuyer, requireAttendeeInfo: collectAttendees }
    saveBookingDraft(nextCart)
    navigate('/booking/review', { state: { cart: nextCart } })
  }

  return (
    <BookingShell step={2} cart={cart}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <section className="space-y-3 sm:space-y-3.5">
          <Panel>
            <div className="mb-4">
              <h2 className="font-display text-xl font-bold text-white">Người mua</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Họ và tên"
                value={buyer.name}
                onChange={(value) => setBuyer((current) => ({ ...current, name: value }))}
                placeholder="Nguyễn Văn A"
                required
              />
              <Input
                label="Email nhận vé"
                type="email"
                value={buyer.email}
                onChange={(value) => setBuyer((current) => ({ ...current, email: value }))}
                placeholder="email@example.com"
                required
              />
              <div className="md:col-span-2">
                <Input
                  label="Số điện thoại liên hệ"
                  value={buyer.phone}
                  onChange={(value) => setBuyer((current) => ({ ...current, phone: value }))}
                  placeholder="0912345678"
                  required
                />
              </div>
            </div>
          </Panel>

          {collectAttendees && attendeeSlots.map((slot, index) => (
            <Panel key={slot.id}>
              <div className="mb-4 flex items-center justify-between gap-2 flex-wrap border-b border-white/10 pb-3">
                <h3 className="font-display text-base sm:text-lg font-bold text-white">
                  Thông tin người tham dự {index + 1}
                </h3>
                <span className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                  {slot.ticketName}
                  {slot.sessionSeatId && (slot.seatLabel ? ` - Ghế ${slot.seatLabel}` : ' - Ghế đã chọn')}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Họ và tên"
                  value={attendees[slot.id]?.name ?? ''}
                  onChange={(value) => updateAttendee(slot.id, 'name', value)}
                  placeholder="Nhập tên người tham gia"
                  required
                />
                <Input
                  label="Email"
                  type="email"
                  value={attendees[slot.id]?.email ?? ''}
                  onChange={(value) => updateAttendee(slot.id, 'email', value)}
                  placeholder="email@example.com"
                  required
                />
              </div>
            </Panel>
          ))}
        </section>
        <OrderCard
          cart={cart}
          setCart={setCart}
          cta={'Tiếp tục kiểm tra đơn'}
          onClick={continueFlow}
          hideUnselectedTickets
        />
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
  const [promoInput, setPromoInput] = useState(cart?.promoCode || '')
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [checkingAvailability, setCheckingAvailability] = useState(false)

  const promosQuery = useQuery({
    queryKey: ['available-event-promos', cart?.eventId],
    queryFn: async () => {
      const response = await promotionService.getAvailableEventPromos(cart.eventId)
      return response.data?.data || []
    },
    enabled: Boolean(cart?.eventId),
  })

  const availablePromos = promosQuery.data || []

  const handleApplyPromo = (rawCode) => {
    const code = (rawCode ?? promoInput).trim().toUpperCase()
    if (!code) {
      toast.error('Vui lòng nhập mã khuyến mãi.')
      return
    }
    const found = availablePromos.find((p) => String(p.code).toUpperCase() === code)
    const subtotal = cartTotal(cart)

    if (found) {
      if (!isPromoUsable(found, subtotal)) {
        toast.error(`Đơn hàng cần tối thiểu ${formatPrice(found.min_order_value || 0)} để áp dụng mã này.`)
        return
      }
      setPromoCode(found.code)
      setSelectedPromo(found)
      setPromoInput(found.code)
      toast.success(`Đã áp dụng mã giảm giá ${found.code}!`)
    } else {
      setPromoCode(code)
      setSelectedPromo(null)
      setPromoInput(code)
      toast.info(`Đã lưu mã khuyến mãi: ${code}. Hệ thống sẽ đối soát khi thanh toán.`)
    }
  }

  const handleRemovePromo = () => {
    setPromoCode('')
    setSelectedPromo(null)
    setPromoInput('')
    toast.info('Đã hủy áp dụng mã khuyến mãi.')
  }

  const termsSectionRef = useRef(null)
  const [termsError, setTermsError] = useState(false)

  const { data: eventDetail } = useQuery({
    queryKey: ['booking-review-event-detail', cart?.eventId],
    queryFn: () => fetchEventDetail(cart.eventId),
    enabled: Boolean(cart?.eventId),
    staleTime: 1000 * 60 * 5,
  })

  const effectiveTerms = String(
    cart?.additionalTerms ||
    cart?.additional_terms ||
    eventDetail?.additional_terms ||
    ''
  ).trim()

  const effectiveRefundPolicy =
    cart?.refundPolicy ||
    cart?.refund_policy ||
    eventDetail?.refund_policy ||
    null

  const policyFileUrl =
    cart?.policyFileUrl ||
    cart?.refundPolicy?.policy_file_url ||
    effectiveRefundPolicy?.policy_file_url ||
    null

  const policyFileName =
    cart?.policyFileName ||
    cart?.refundPolicy?.policy_file_name ||
    effectiveRefundPolicy?.policy_file_name ||
    'Tài liệu chính sách sự kiện'

  const policyFileSize =
    cart?.policyFileSize ||
    cart?.refundPolicy?.policy_file_size ||
    effectiveRefundPolicy?.policy_file_size ||
    null

  const hasTerms = Boolean(effectiveTerms)
  const hasPolicyFile = Boolean(policyFileUrl)
  const hasRefundPolicy = Boolean(
    effectiveRefundPolicy &&
    (effectiveRefundPolicy.allow_refund ?? effectiveRefundPolicy.allow_refunds)
  )

  const hasPolicy = Boolean(
    hasTerms ||
    hasPolicyFile ||
    hasRefundPolicy ||
    effectiveRefundPolicy?.refund_notes?.trim()
  )

  const [termsAccepted, setTermsAccepted] = useState(() => Boolean(cart?.eventTermsAccepted))

  if (!cart?.items?.length) return <NavigateBackToEvents />

  const collectAttendees = requiresAttendeeInfo(cart)

  const continueFlow = async () => {
    if (hasPolicy && !termsAccepted) {
      setTermsError(true)
      toast.warning('Vui lòng đọc và tick chọn xác nhận đồng ý với điều khoản tham dự và chính sách hoàn tiền của sự kiện trước khi tiếp tục.')
      termsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    const nextCart = {
      ...cart,
      promoCode,
      promo: selectedPromo,
      eventTermsAccepted: hasPolicy ? termsAccepted : true,
      additionalTerms: effectiveTerms,
      refundPolicy: effectiveRefundPolicy,
      policyFileUrl,
      policyFileName,
      policyFileSize,
    }
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <section className="space-y-5">
          <Panel>
            <h2 className="mb-4 font-display text-xl font-bold text-white">{'Thông tin sự kiện'}</h2>
            <div className="grid gap-3 text-sm text-muted md:grid-cols-2">
              <InfoLine label={'Sự kiện'} value={cart.eventTitle} />
              <InfoLine label={'Thời gian'} value={`${formatDateTime(cart.eventStartTime)} - ${formatDateTime(cart.eventEndTime)}`} />
              <InfoLine label={'Địa điểm'} value={cart.venueSummary || 'Đang cập nhật'} wide />
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-4 font-display text-xl font-bold text-white">{'Thông tin vé'}</h2>
            <div className="space-y-3">
              {cart.items.map((item) => (
                <div key={item.ticketType.id} className="rounded-md bg-panel-soft p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="font-bold text-white">{item.ticketType.name}</p>
                      <p className="mt-1 text-sm text-muted">{'Số lượng'}: {item.quantity}</p>
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
            <h2 className="mb-4 font-display text-xl font-bold text-white">{collectAttendees ? 'Người tham gia' : 'Người mua'}</h2>
            {collectAttendees ? (
              <div className="grid gap-3 md:grid-cols-2">
                {expandAttendeeSlots(cart).map((slot, index) => (
                  <div key={slot.id} className="rounded-md border border-border-soft bg-surface p-3">
                    <p className="text-xs font-bold uppercase text-primary">{'Vé'} {index + 1}</p>
                    <p className="mt-1 font-semibold text-white">{cart.attendees?.[slot.id]?.name || 'Chưa nhập'}</p>
                    <p className="text-sm text-muted">{cart.attendees?.[slot.id]?.email || 'Chưa nhập'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-border-soft bg-surface p-3">
                <p className="mt-1 font-semibold text-white">{cart.buyer?.name || 'Chưa nhập'}</p>
                <p className="text-sm text-muted">{cart.buyer?.email || 'Chưa nhập'}</p>
                <p className="text-sm text-muted">{cart.buyer?.phone || 'Chưa nhập'}</p>
              </div>
            )}
          </Panel>
          {hasPolicy && (
            <Panel>
              <div>
                <h2 className="font-display text-xl font-bold text-white">
                  Điều khoản &amp; Chính sách sự kiện
                </h2>
              </div>

              <div className="mt-5 space-y-4">
                {/* 1. File chính sách đính kèm từ Organizer nếu có */}
                {policyFileUrl && (
                  <div className="rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/15 text-primary shadow-sm">
                          <FileText className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wider text-primary">
                            Tài liệu chính sách sự kiện
                          </p>
                          <p className="text-sm font-semibold text-white truncate max-w-[260px] sm:max-w-md" title={policyFileName}>
                            {policyFileName}
                          </p>
                          {policyFileSize && (
                            <p className="text-xs text-muted">
                              Dung lượng: {formatFileSize(policyFileSize)}
                            </p>
                          )}
                        </div>
                      </div>
                      <a
                        href={policyFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/15 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/25 transition shadow-sm"
                      >
                        <span>Xem tài liệu</span>
                        <ExternalLink className="size-3.5" />
                      </a>
                    </div>
                  </div>
                )}

                {/* 2. Điều khoản tham dự do Organizer ghi nếu có */}
                {hasTerms && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Chính sách &amp; Quy định tham dự:
                    </p>
                    <div className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border-soft bg-surface/90 p-4 text-sm leading-6 text-slate-200 shadow-inner">
                      {effectiveTerms}
                    </div>
                  </div>
                )}

                {/* 3. Chính sách hoàn vé nếu có */}
                {effectiveRefundPolicy && (
                  <div className="rounded-xl border border-border-soft bg-surface/60 p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="size-4 text-cyan-400" />
                        <p className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                          Chính sách hoàn vé
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${hasRefundPolicy
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-slate-600 bg-slate-700/50 text-slate-300'
                          }`}
                      >
                        {hasRefundPolicy ? 'Hỗ trợ hoàn vé có điều kiện' : 'Không hỗ trợ hoàn hủy vé'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs sm:text-sm text-slate-300">
                      {generateRefundPolicyLines(effectiveRefundPolicy).map((line, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span
                            className={`mt-1.5 size-1.5 shrink-0 rounded-full ${hasRefundPolicy ? 'bg-cyan-400' : 'bg-slate-500'
                              }`}
                          />
                          <span className="leading-relaxed">{line}</span>
                        </div>
                      ))}
                    </div>

                    {effectiveRefundPolicy.refund_notes && (
                      <p className="pt-1 text-xs italic text-slate-400">
                        * Lưu ý từ BTC: {effectiveRefundPolicy.refund_notes}
                      </p>
                    )}
                  </div>
                )}

                {/* 4. Checkbox bắt buộc */}
                <div ref={termsSectionRef} className="pt-2">
                  <label className="flex cursor-pointer items-start gap-3 py-1">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(event) => {
                        setTermsAccepted(event.target.checked)
                        if (event.target.checked) setTermsError(false)
                      }}
                      className="peer sr-only"
                    />
                    <span
                      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border-2 transition ${termsAccepted
                        ? 'border-primary bg-primary text-slate-950'
                        : termsError
                          ? 'border-error bg-error/20 ring-2 ring-error/40'
                          : 'border-slate-400 hover:border-white'
                        }`}
                    >
                      <Check
                        className={`size-3.5 stroke-[3] transition ${termsAccepted ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                          }`}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-semibold leading-6 text-white select-none">
                        Tôi đã đọc và đồng ý với điều khoản tham dự và chính sách hoàn tiền của sự kiện này
                        <span className="ml-1 text-error font-bold">*</span>
                      </span>
                      {termsError && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-error animate-pulse">
                          <AlertTriangle className="size-4 shrink-0" />
                          <span>Vui lòng tích chọn xác nhận đồng ý trước khi chuyển sang bước thanh toán</span>
                        </p>
                      )}
                    </div>
                  </label>
                </div>
              </div>
            </Panel>
          )}
        </section>
        <OrderCard
          cart={{ ...cart, promoCode, promo: selectedPromo }}
          setCart={setCart}
          cta={'Xác nhận và thanh toán'}
          onClick={continueFlow}
          disabled={checkingAvailability}
          hideUnselectedTickets
          promoProps={{
            promoCode,
            selectedPromo,
            promoInput,
            setPromoInput,
            onApply: handleApplyPromo,
            onRemove: handleRemovePromo,
            onOpenVoucher: () => setVoucherOpen(true),
          }}
        />
      </div>
      {voucherOpen && (
        <OrganizerVoucherModal
          promoCode={promoCode}
          setPromoCode={setPromoCode}
          selectedPromo={selectedPromo}
          setSelectedPromo={setSelectedPromo}
          setPromoInput={setPromoInput}
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
  const paymentSuccessHandledRef = useRef(false)
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
      clearBookingDraft()
      toast.success('Đã hủy đặt vé.')
      const returnPath = cart?.eventSlug ? `/events/${cart.eventSlug}` : cart?.eventId ? `/events/${cart.eventId}` : '/events'
      navigate(returnPath, { replace: true })
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
    if (order?.status !== 'PAID' || paymentSuccessHandledRef.current) return

    paymentSuccessHandledRef.current = true
    clearBookingDraft()
    toast.success('Thanh toán thành công. Vé của bạn đã sẵn sàng!')
    navigate('/my-tickets', { replace: true })
  }, [navigate, order?.status, toast])

  useEffect(() => {
    if (!cart?.items?.length || orderId || checkoutMutation.isPending || checkoutStartedRef.current) return
    const hasPolicy = Boolean(
      cart?.additionalTerms ||
      cart?.additional_terms ||
      cart?.policyFileUrl ||
      cart?.refundPolicy?.policy_file_url ||
      (cart?.refundPolicy && (cart?.refundPolicy.allow_refund ?? cart?.refundPolicy.allow_refunds))
    )
    if (hasPolicy && !cart.eventTermsAccepted) {
      toast.warning('Vui lòng kiểm tra và đồng ý với điều khoản, chính sách hoàn tiền của sự kiện trước khi thanh toán.')
      navigate('/booking/review', { replace: true, state: { cart } })
      return
    }
    checkoutStartedRef.current = true
    checkoutMutation.mutate({
      event_id: cart.eventId,
      buyer_name: cart.buyer?.name || '',
      buyer_email: cart.buyer?.email || '',
      buyer_phone: cart.buyer?.phone || null,
      promo_code: cart.promoCode?.trim() || null,
      event_terms_accepted: Boolean(cart.eventTermsAccepted),
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <section className="space-y-5">
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
                    className="mt-6 inline-flex items-center justify-center gap-2 btn-gold-primary px-6 py-3 text-sm font-bold shadow-lg"
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
        <OrderCard
          cart={cart}
          setCart={setCart}
          cta={'Đang chờ thanh toán'}
          disabled
          onCancel={handleCancelOrder}
          hideUnselectedTickets
        />
      </div>
    </BookingShell>
  )
}

function BookingShell({ step, cart, children }) {
  const labels = ['Ghế', 'Thông tin', 'Kiểm tra', 'Thanh toán']
  const stepPaths = {
    1: '/booking/seats',
    2: '/booking/attendees',
    3: '/booking/review',
    4: '/booking/payment',
  }
  const navigate = useNavigate()
  const toast = useToast()
  const [tick, setTick] = useState(0)
  const expiredHandledRef = useRef(false)
  const draft = readBookingDraft()
  const holdExpiresAtRaw =
    cart?.holdExpiresAt ||
    cart?.hold_expires_at ||
    draft?.holdExpiresAt ||
    draft?.hold_expires_at
  const holdExpiresAt =
    holdExpiresAtRaw && secondsLeft(holdExpiresAtRaw) > 0
      ? holdExpiresAtRaw
      : step >= 2 && !holdExpiresAtRaw
        ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
        : holdExpiresAtRaw
  const remaining = secondsLeft(holdExpiresAt)

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!holdExpiresAt) {
      expiredHandledRef.current = false
      return
    }

    const isExpired = secondsLeft(holdExpiresAt) <= 0
    if (!isExpired) {
      expiredHandledRef.current = false
      return
    }

    // Đảm bảo chỉ thông báo đúng 1 lần khi hết hạn và quay lại bước chọn ghế
    if (expiredHandledRef.current) return
    expiredHandledRef.current = true

    clearBookingDraft()
    toast.warning('Thời gian giữ vé (15 phút) đã hết. Bạn vui lòng chọn lại ghế/vé.')
    navigate('/booking/seats', {
      replace: true,
      state: {
        cart: {
          ...cart,
          selectedSeatIds: [],
          items: [],
          holdExpiresAt: null,
          hold_expires_at: null,
        },
      },
    })
  }, [holdExpiresAt, tick, navigate, toast, cart])

  const goBackStep = () => {
    const previousPathByStep = {
      1: cart?.eventSlug ? `/events/${cart.eventSlug}` : cart?.eventId ? `/events/${cart.eventId}` : '/events',
      2: '/booking/seats',
      3: '/booking/attendees',
      4: '/booking/review',
    }
    const previousPath = previousPathByStep[step]

    if (previousPath) {
      navigate(previousPath, { state: { cart } })
      return
    }

    window.history.back()
  }

  const stepBackLabel = {
    1: 'Quay lại chi tiết sự kiện',
    2: 'Quay về bước 1: Chọn ghế / vé',
    3: 'Quay về bước 2: Thông tin',
    4: 'Quay về bước 3: Kiểm tra đơn',
  }[step] || 'Quay về bước trước'

  return (
    <div className="min-h-[calc(100vh-64px)] bg-transparent text-content pt-20 sm:pt-24">
      <div className="bg-transparent">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="relative flex items-center justify-between">
            {/* Đường line nối 4 bước */}
            <div className="absolute top-[22px] left-8 sm:left-10 right-8 sm:right-10 -translate-y-1/2 h-[2px] bg-white/10 z-0 pointer-events-none">
              <div
                className="h-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] shadow-[0_0_8px_rgba(201,154,71,0.6)] transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, ((step - 1) / (labels.length - 1)) * 100))}%` }}
              />
            </div>

            {labels.map((label, index) => {
              const stepNum = index + 1
              const active = stepNum === step
              const done = stepNum < step
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!done}
                  onClick={() => {
                    if (done && stepPaths[stepNum]) {
                      navigate(stepPaths[stepNum], { state: { cart } })
                    }
                  }}
                  className={`relative z-10 w-16 sm:w-20 flex flex-col items-center gap-2 transition ${done ? 'cursor-pointer group' : 'cursor-default'}`}
                >
                  <div
                    className={`grid size-11 place-items-center rounded-full text-sm font-bold transition-all duration-300 ${active
                      ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-slate-950 shadow-[0_0_20px_rgba(201,154,71,0.5)] scale-110'
                      : done
                        ? 'bg-[#0b132b] text-[#E6C17A] border border-[#E6C17A]/40 group-hover:scale-105 group-hover:bg-[#C99A47]/20 group-hover:border-[#E6C17A]'
                        : 'bg-[#0b132b] text-slate-500 border border-white/10'
                      }`}
                  >
                    {done ? <Check className="size-5 text-[#E6C17A]" /> : stepNum}
                  </div>
                  <span
                    className={`text-xs sm:text-sm font-bold transition-colors whitespace-nowrap ${active
                      ? 'text-white drop-shadow-md'
                      : done
                        ? 'text-[#E6C17A] group-hover:underline'
                        : 'text-slate-500'
                      }`}
                  >
                    {label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            type="button"
            onClick={goBackStep}
            className="inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-slate-900/70 px-4 py-2 text-sm font-bold text-slate-300 shadow-md backdrop-blur-md transition hover:border-primary/40 hover:bg-slate-800 hover:text-primary"
          >
            <ArrowLeft className="size-4 text-primary" />
            <span>{stepBackLabel}</span>
          </button>
        </div>
        {cart?.eventTitle && (
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-primary/25 bg-slate-900/70 p-5 shadow-xl backdrop-blur-md">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                Sự kiện đang đặt vé
              </span>
              <h2 className="mt-1 font-display text-xl sm:text-2xl font-black text-white drop-shadow-sm truncate">
                {cart.eventTitle}
              </h2>
            </div>
            {holdExpiresAt && secondsLeft(holdExpiresAt) > 0 && (
              <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto rounded-xl border border-white/20 bg-white/5 px-3.5 py-1.5 font-mono text-lg sm:text-xl font-black text-white shadow-[0_0_12px_rgba(255,255,255,0.1)]">
                <Clock className="size-4 sm:size-5 text-white animate-pulse shrink-0" />
                <span className="text-white">{formatCountdown(remaining)}</span>
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

function OrderCard({
  cart,
  cta,
  onClick,
  disabled,
  onCancel,
  onReset,
  resetDisabled = false,
  colorByTicketTypeId,
  hideUnselectedTickets = false,
  promoProps,
}) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const selectedItems = (cart?.items || []).filter((item) => Number(item?.quantity || 0) > 0)
  const visibleTicketTypes = (cart?.availableTicketTypes || []).filter((ticketType) => {
    if (!hideUnselectedTickets) return true
    const item = selectedItems.find((i) => String(i.ticketType?.id) === String(ticketType.id))
    return Number(item?.quantity || 0) > 0
  })

  const itemsToRender = (hideUnselectedTickets || visibleTicketTypes.length === 0) && selectedItems.length > 0
    ? selectedItems.map((item) => ({
      id: item.ticketType?.id || item.sessionSeatIds?.[0] || String(Math.random()),
      name: item.ticketType?.name || 'Vé',
      price: Number(item.ticketType?.price || 0),
      qty: Number(item.quantity || 0),
      color: ticketTypeColor(item.ticketType, colorByTicketTypeId),
      seatLabels: item.seatLabels || [],
      ticketType: item.ticketType,
    }))
    : visibleTicketTypes.map((ticketType) => {
      const item = selectedItems.find((i) => String(i.ticketType?.id) === String(ticketType.id))
      const qty = Number(item?.quantity || 0)
      return {
        id: ticketType.id,
        name: ticketType.name,
        price: Number(ticketType.price || 0),
        qty,
        color: ticketTypeColor(ticketType, colorByTicketTypeId),
        seatLabels: item?.seatLabels || [],
        ticketType,
      }
    })

  return (
    <aside className="glass-panel relative overflow-hidden h-fit rounded-[24px] border-primary/20 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)] p-6 sm:p-7 lg:sticky lg:top-32">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--color-primary)_0%,_transparent_60%)] opacity-10" />
      <div className="mb-5 flex items-center justify-between gap-2 flex-nowrap">
        <h2 className="font-display text-lg sm:text-xl font-black text-white whitespace-nowrap">{'Thông tin đặt vé'}</h2>
        <button
          type="button"
          onClick={() => onReset ? setResetOpen(true) : setCancelOpen(true)}
          disabled={Boolean(onReset) && resetDisabled}
          className="text-xs sm:text-sm font-bold text-[#E6C17A] hover:text-[#F3D8A5] transition whitespace-nowrap shrink-0 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {'Chọn lại vé'}
        </button>
      </div>
      <div className="space-y-3 border-y border-border-soft py-4">
        {itemsToRender.map((ticket) => {
          const qty = ticket.qty

          return (
            <div key={ticket.id} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
              <div className="flex min-w-0 items-start gap-2">
                <span
                  className="mt-1 size-3 shrink-0 rounded-sm border border-white/20"
                  style={{ backgroundColor: ticket.color }}
                />
                <div className="min-w-0">
                  <p className={qty > 0 ? 'font-semibold text-white' : 'font-semibold text-slate-400'}>{ticket.name}</p>
                  {qty > 0 ? (
                    <p className="text-white font-medium text-xs sm:text-sm">
                      {formatPrice(ticket.price)} {'\u00d7'} {String(qty).padStart(2, '0')}
                    </p>
                  ) : (
                    <p className="text-slate-500">{formatPrice(ticket.price)} / {'vé'}</p>
                  )}
                  {ticket.seatLabels?.length > 0 && (
                    <p className="mt-2 inline-flex max-w-full rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                      {'Ghế'}: <span className="ml-1 truncate">{ticket.seatLabels.join(', ')}</span>
                    </p>
                  )}
                </div>
              </div>
              <p className={qty > 0 ? 'font-bold text-white' : 'font-bold text-slate-500'}>
                {qty > 0 ? formatPrice(ticket.price * qty) : '-'}
              </p>
            </div>
          )
        })}
        {itemsToRender.length === 0 && (
          <p className="py-2 text-center text-xs text-muted">{'Chưa có vé nào được chọn'}</p>
        )}
      </div>

      {promoProps ? (
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
              <Tag className="size-4 text-primary" /> Mã ưu đãi
            </span>
            {promoProps.onOpenVoucher && (
              <button
                type="button"
                onClick={promoProps.onOpenVoucher}
                className="text-xs sm:text-sm font-bold text-white hover:text-slate-200 transition cursor-pointer"
              >
                Chọn voucher
              </button>
            )}
          </div>
          {promoProps.promoCode ? (
            <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 p-2.5 text-xs">
              <div className="min-w-0">
                <span className="font-mono font-bold text-primary">{promoProps.promoCode}</span>
              </div>
              <button
                type="button"
                onClick={promoProps.onRemove}
                className="text-xs font-semibold text-rose-400 hover:text-rose-300 ml-2 shrink-0 cursor-pointer"
              >
                Hủy
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={promoProps.promoInput || ''}
                onChange={(e) => promoProps.setPromoInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    promoProps.onApply(promoProps.promoInput)
                  }
                }}
                placeholder="Nhập mã..."
                className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-3 font-mono text-xs text-white uppercase outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => promoProps.onApply(promoProps.promoInput)}
                disabled={!promoProps.promoInput?.trim()}
                className="rounded-lg bg-primary/20 px-3 text-xs font-bold text-primary hover:bg-primary/30 border border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                Áp dụng
              </button>
            </div>
          )}
        </div>
      ) : cart?.promoCode ? (
        <div className="mt-4 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
          {'Mã khuyến mãi'}: {cart.promoCode}
        </div>
      ) : null}

      <Line label={`Tổng cộng ${(cart?.items || []).reduce((sum, item) => sum + item.quantity, 0)} vé`} value={formatPrice(cartTotal(cart))} large />
      {promoDiscount(cart) > 0 && (
        <Line label={'Giảm giá'} value={`-${formatPrice(promoDiscount(cart))}`} tone="discount" />
      )}
      {promoDiscount(cart) > 0 && (
        <Line label={'Tổng thanh toán'} value={formatPrice(payableTotal(cart))} large />
      )}
      <div className="mt-8 space-y-3">
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="btn-gold-primary w-full py-3.5 sm:py-4 text-base sm:text-lg tracking-wide select-none cursor-pointer"
        >
          {cta}
        </button>
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          className="w-full rounded-full border border-white/10 bg-transparent py-2.5 text-xs font-bold text-slate-400 transition hover:border-error/40 hover:bg-error/10 hover:text-error"
        >
          {'Hủy đặt vé'}
        </button>
      </div>
      <p className="mt-6 flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
        <ShieldCheck className="size-4" /> {'Thanh to\u00e1n an toàn qua PayOS'}
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
            Promise.resolve(onReset()).then(() => setResetOpen(false)).catch(() => { })
          }}
        />
      )}
    </aside>
  )
}

function PromoSection({
  promoCode,
  selectedPromo,
  promoInput,
  setPromoInput,
  onApply,
  onRemove,
  onOpenVoucher,
  cart,
  availableCount = 0,
}) {
  const discountAmount = promoDiscount({ ...cart, promo: selectedPromo, promoCode })

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <Tag className="size-4" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-white">Mã khuyến mãi &amp; Giảm giá</h2>
            <p className="text-xs text-muted">Nhập mã ưu đãi hoặc chọn voucher từ Ban tổ chức</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenVoucher}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition shadow-sm"
        >
          <Ticket className="size-3.5" />
          <span>Danh sách voucher {availableCount > 0 ? `(${availableCount})` : ''}</span>
        </button>
      </div>

      {promoCode || selectedPromo ? (
        <div className="rounded-xl border border-primary/40 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-primary text-slate-950 font-bold shadow-md shadow-primary/20">
                <Check className="size-5 stroke-[3]" />
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-md bg-primary/20 px-2.5 py-1 font-mono text-xs font-bold text-primary border border-primary/30">
                    {promoCode}
                  </span>
                  {selectedPromo && (
                    <span className="text-sm font-semibold text-white">
                      {formatPromoTitle(selectedPromo)}
                    </span>
                  )}
                </div>
                {discountAmount > 0 ? (
                  <p className="mt-1 text-sm font-bold text-emerald-400">
                    Được giảm: -{formatPrice(discountAmount)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    Mã đã được lưu và sẽ đối soát khi thanh toán
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition"
            >
              Hủy áp dụng
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input
              type="text"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onApply(promoInput)
                }
              }}
              placeholder="Nhập mã voucher (VD: BLUE50)..."
              className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 font-mono text-sm text-white placeholder:text-slate-500 uppercase tracking-wider outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/40"
            />
          </div>
          <button
            type="button"
            onClick={() => onApply(promoInput)}
            disabled={!promoInput.trim()}
            className="cosmic-btn-primary px-6 py-2.5 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            Áp dụng
          </button>
        </div>
      )}
    </Panel>
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

function OrganizerVoucherModal({ promoCode, setPromoCode, selectedPromo, setSelectedPromo, setPromoInput, cart, onClose }) {
  const subtotal = cartTotal(cart)
  const promosQuery = useQuery({
    queryKey: ['available-event-promos', cart?.eventId],
    queryFn: async () => {
      const response = await promotionService.getAvailableEventPromos(cart.eventId)
      return response.data?.data || []
    },
    enabled: Boolean(cart?.eventId),
  })
  const organizerPromos = promosQuery.data || []

  const [tempSelected, setTempSelected] = useState(() => selectedPromo || null)

  useEffect(() => {
    if (selectedPromo) {
      setTempSelected(selectedPromo)
    } else if (promoCode && organizerPromos.length > 0) {
      const matched = organizerPromos.find((p) => String(p.code).toUpperCase() === String(promoCode).toUpperCase())
      if (matched) setTempSelected(matched)
    }
  }, [selectedPromo, promoCode, organizerPromos])

  const toggleSelectPromo = (promo) => {
    if (!isPromoUsable(promo, subtotal)) return
    if (tempSelected?.id === promo.id || String(tempSelected?.code).toUpperCase() === String(promo.code).toUpperCase()) {
      setTempSelected(null)
    } else {
      setTempSelected(promo)
    }
  }

  const handleApply = () => {
    if (tempSelected) {
      setPromoCode(tempSelected.code)
      setSelectedPromo(tempSelected)
      setPromoInput?.(tempSelected.code)
    } else {
      setPromoCode('')
      setSelectedPromo(null)
      setPromoInput?.('')
    }
    onClose()
  }

  return (
    <ModalFrame>
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h2 className="font-display text-xl font-extrabold text-white">Chọn voucher sự kiện</h2>
          <p className="mt-0.5 text-xs text-slate-400">Chọn mã ưu đãi từ Ban tổ chức</p>
        </div>
        <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white cursor-pointer" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>

      <h3 className="mt-5 font-display text-base font-bold text-white">Voucher khả dụng</h3>
      <div className="mt-3 space-y-3 max-h-[45vh] overflow-y-auto pr-1">
        {promosQuery.isLoading && (
          <p className="rounded-xl border border-white/10 bg-slate-950/40 py-8 text-center text-sm font-semibold text-slate-400">Đang tải voucher...</p>
        )}
        {!promosQuery.isLoading && organizerPromos.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/10 bg-slate-950/40 py-8 text-center text-sm font-semibold text-slate-400">Sự kiện này chưa có mã giảm giá công khai</p>
        )}
        {organizerPromos.map((promo) => {
          const checked = tempSelected?.id === promo.id || (tempSelected?.code && String(tempSelected.code).toUpperCase() === String(promo.code).toUpperCase())
          const usable = isPromoUsable(promo, subtotal)
          return (
            <button
              key={promo.id}
              type="button"
              disabled={!usable}
              onClick={() => toggleSelectPromo(promo)}
              className={`flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition ${checked
                ? 'border-[#E6C17A] bg-[#C99A47]/15 shadow-lg shadow-[#C99A47]/10'
                : 'border-white/10 bg-slate-950/50'
                } ${usable ? 'hover:border-[#E6C17A]/70 hover:bg-slate-800 cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
            >
              <div>
                <p className="font-bold text-white">{formatPromoTitle(promo)}</p>
                <p className="mt-1 text-xs text-slate-300">
                  Mã: <span className="font-mono font-bold text-[#E6C17A]">{promo.code}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-400">Đơn tối thiểu: {formatPrice(promo.min_order_value || 0)}</p>
                {promo.discount_type === 'PERCENTAGE' && promo.max_discount !== null && promo.max_discount !== undefined && (
                  <p className="mt-0.5 text-xs text-slate-400">Giảm tối đa: {formatPrice(promo.max_discount)}</p>
                )}
                <p className="mt-1 text-xs text-[#E6C17A]">HSD: {formatDateOnly(promo.end_time)}</p>
                {!usable && <p className="mt-1.5 text-xs font-bold text-rose-400">Đơn hàng chưa đủ điều kiện áp dụng</p>}
              </div>
              <span className={`grid size-7 shrink-0 place-items-center rounded-full border-2 ${checked ? 'border-[#E6C17A] bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-slate-950' : 'border-white/20'}`}>
                {checked && <Check className="size-4 stroke-[3]" />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-5 flex justify-end border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={handleApply}
          className="btn-gold-primary px-7 py-2.5 text-sm font-bold shadow-lg cursor-pointer"
        >
          Áp dụng
        </button>
      </div>
    </ModalFrame>
  )
}

function CancelBookingModal({ onStay, onCancel }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onStay()}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="cancel-booking-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-error/15"><AlertTriangle className="size-5 text-error" /></span>
          <div>
            <h2 id="cancel-booking-title" className="font-display text-xl font-extrabold">{'H\u1ee7y \u0111\u01a1n h\u00e0ng?'}</h2>
            <p className="mt-1 text-sm text-slate-400">{'B\u1ea1n c\u00f3 ch\u1eafc ch\u1eafn mu\u1ed1n ti\u1ebfp t\u1ee5c?'}</p>
          </div>
        </div>
        <ul className="mt-5 space-y-2 rounded-xl border border-error/20 bg-error/5 p-4 text-sm text-slate-300">
          <li className="flex gap-2"><span className="text-error">&bull;</span><span>{'B\u1ea1n s\u1ebd m\u1ea5t v\u1ecb tr\u00ed m\u00ecnh \u0111\u00e3 l\u1ef1a ch\u1ecdn.'}</span></li>
          <li className="flex gap-2"><span className="text-error">&bull;</span><span>{'\u0110\u01a1n h\u00e0ng \u0111ang thanh to\u00e1n c\u00f3 th\u1ec3 b\u1ecb h\u1ee7y.'}</span></li>
        </ul>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onStay} className="rounded-xl border border-white/10 px-5 py-2.5 font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white">{'Ở lại'}</button>
          <button type="button" onClick={onCancel} className="rounded-xl bg-error px-5 py-2.5 font-bold text-white transition hover:bg-error/90">{'Hủy đơn'}</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function ResetSelectionModal({ onStay, onReset }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onStay()}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="reset-selection-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15"><RefreshCw className="size-5 text-primary" /></span>
          <div>
            <h2 id="reset-selection-title" className="font-display text-xl font-extrabold">Bạn muốn chọn lại vé?</h2>
            <p className="mt-1 text-sm text-slate-400">Các vé bạn đang chọn sẽ được xóa để bạn chọn lại từ đầu.</p>
          </div>
        </div>
        <p className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-slate-300">
          Ghế và số lượng vé đã chọn sẽ được xóa. Bạn vẫn ở trang này và có thể chọn vé mới ngay.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onStay} className="rounded-xl border border-white/10 px-5 py-2.5 font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white">Giữ vé đã chọn</button>
          <button type="button" onClick={onReset} className="cosmic-btn-primary px-5 py-2.5 font-bold">Chọn lại từ đầu</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
function ModalFrame({ children }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl border border-white/10 bg-slate-900 p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
        {children}
      </section>
    </div>
  )
}

function Panel({ children, unstyled = false, className = '' }) {
  return (
    <section className={unstyled ? className : `rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl backdrop-blur-md transition ${className}`}>
      {children}
    </section>
  )
}

function PageTitle({ title, subtitle }) {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-white tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
    </div>
  )
}

function Input({ label, value, onChange, type = 'text', placeholder, required = false }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center">
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        {required && <span className="ml-1 text-sm font-bold text-red-500">*</span>}
      </div>
      <input
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 text-white placeholder:text-slate-500 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/40"
      />
    </label>
  )
}

function StandingQuantityModal({ ticketType, quantity, onDecrease, onIncrease, onClose }) {
  const availability = ticketAvailability(ticketType)

  return createPortal(
    <div className={'fixed inset-0 z-50 grid place-items-center bg-black/70 p-4'} onClick={onClose}>
      <div className={'w-full max-w-md rounded-xl border border-border-soft bg-panel p-6 shadow-2xl'} onClick={(event) => event.stopPropagation()}>
        <div className={'flex items-start justify-between gap-4'}>
          <div><p className={'text-xs font-bold uppercase text-tertiary'}>{'Khu vực đứng'}</p><h3 className={'mt-1 text-xl font-bold text-white'}>{ticketType.name}</h3></div>
          <button type={'button'} onClick={onClose} className={'text-muted hover:text-white'}><X className={'size-5'} /></button>
        </div>
        <p className={'mt-4 whitespace-pre-line text-sm leading-6 text-muted'}>{ticketType.description || 'Khu vực đứng, không có ghế ngồi cố định.'}</p>
        <p className={'mt-3 text-sm font-bold text-success'}>
          Còn lại: {availability.available}/{availability.total} vé
        </p>
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
  const availability = ticketAvailability(ticketType)

  return (
    <div className={`rounded-lg border p-4 transition ${quantity > 0
      ? 'border-tertiary/70 bg-tertiary/10 shadow-[0_0_0_1px_rgba(249,115,22,0.08)]'
      : 'border-border-soft bg-surface/40 hover:border-primary/40'
      }`}>
      <div className={'flex items-start justify-between gap-4'}>
        <div>
          <p className={'font-bold text-white'}>{ticketType.name}</p>
          <p className={'mt-1 text-sm text-muted'}>{ticketType.description}</p>
          <p className={'mt-2 text-sm font-bold text-success'}>
            Còn lại: {availability.available}/{availability.total} vé
          </p>
        </div>
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
  const isDiscount = tone === 'discount'
  return (
    <div className={`mt-4 flex justify-between gap-4 ${large ? 'font-display text-xl font-bold' : isDiscount ? 'text-base font-medium' : 'text-sm'}`}>
      <span className={large || isDiscount ? 'text-white' : 'text-muted'}>{label}</span>
      <span className={isDiscount ? 'font-semibold text-white' : large ? 'text-primary' : 'font-semibold text-white'}>{value}</span>
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

