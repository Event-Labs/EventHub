export const BOOKING_DRAFT_KEY = 'eventhub-booking-draft'

export function secondsLeft(expiredAt) {
  if (!expiredAt) return 0
  const ms = new Date(expiredAt).getTime() - Date.now()
  return Math.max(0, Math.floor(ms / 1000))
}

export function formatCountdown(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(s / 60)
  const rest = s % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export function hasActiveSeatHold(cart) {
  if (!cart) return false
  const expiresAt = cart.holdExpiresAt || cart.hold_expires_at
  if (!expiresAt) return false
  if (secondsLeft(expiresAt) <= 0) return false

  const hasSeats = Boolean(
    (cart.selectedSeatIds && cart.selectedSeatIds.length > 0) ||
    (cart.items && cart.items.some((item) => Number(item.quantity || 0) > 0))
  )
  return hasSeats
}

export function readBookingDraft() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(BOOKING_DRAFT_KEY)
    if (!raw) return null
    const cart = JSON.parse(raw)
    if (!cart) return null

    const expiresAt = cart.holdExpiresAt || cart.hold_expires_at
    if (expiresAt && secondsLeft(expiresAt) <= 0) {
      window.localStorage.removeItem(BOOKING_DRAFT_KEY)
      return null
    }

    return cart
  } catch {
    return null
  }
}

export function saveBookingDraft(cart) {
  if (typeof window === 'undefined' || !cart) return
  try {
    window.localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(cart))
  } catch { }
}

export function clearBookingDraft() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(BOOKING_DRAFT_KEY)
  } catch { }
}
