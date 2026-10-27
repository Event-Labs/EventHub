export const BOOKING_DRAFT_KEY = 'eventhub-booking-draft'

export function getEventDraftKey(eventId) {
  return eventId ? `${BOOKING_DRAFT_KEY}-${eventId}` : null
}

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

export function getResumeBookingPath(cart) {
  if (!cart) return '/events'
  if (cart.currentPath) return cart.currentPath
  if (cart.currentStep === 4 || cart.orderId) {
    return cart.orderId ? `/booking/payment?orderId=${cart.orderId}` : '/booking/payment'
  }
  if (cart.currentStep === 3) return '/booking/review'
  if (cart.currentStep === 2) return '/booking/attendees'
  if (cart.currentStep === 1) return '/booking/seats'

  if (cart.orderId) return `/booking/payment?orderId=${cart.orderId}`
  const hasAttendees = cart.attendees && Object.values(cart.attendees).some((a) => a?.name?.trim())
  if (hasAttendees) return '/booking/review'
  const hasSeats = Boolean(
    (cart.selectedSeatIds && cart.selectedSeatIds.length > 0) ||
    (cart.items && cart.items.some((item) => Number(item.quantity || 0) > 0))
  )
  if (hasSeats) {
    return cart.requireAttendeeInfo ? '/booking/attendees' : '/booking/review'
  }
  return '/booking/seats'
}

export function readBookingDraft(targetEventId = null) {
  if (typeof window === 'undefined') return null
  try {
    if (targetEventId) {
      const eventKey = getEventDraftKey(targetEventId)
      if (eventKey) {
        const rawEvent = window.localStorage.getItem(eventKey)
        if (rawEvent) {
          const cart = JSON.parse(rawEvent)
          if (cart) {
            const expiresAt = cart.holdExpiresAt || cart.hold_expires_at
            if (expiresAt && secondsLeft(expiresAt) <= 0) {
              window.localStorage.removeItem(eventKey)
            } else {
              return cart
            }
          }
        }
      }
    }

    const raw = window.localStorage.getItem(BOOKING_DRAFT_KEY)
    if (!raw) return null
    const cart = JSON.parse(raw)
    if (!cart) return null

    const expiresAt = cart.holdExpiresAt || cart.hold_expires_at
    if (expiresAt && secondsLeft(expiresAt) <= 0) {
      window.localStorage.removeItem(BOOKING_DRAFT_KEY)
      if (cart.eventId) {
        window.localStorage.removeItem(getEventDraftKey(cart.eventId))
      }
      return null
    }

    if (targetEventId && String(cart.eventId) !== String(targetEventId)) {
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
    const raw = JSON.stringify(cart)
    if (cart.eventId) {
      const eventKey = getEventDraftKey(cart.eventId)
      if (eventKey) {
        window.localStorage.setItem(eventKey, raw)
      }
    }

    const existingRaw = window.localStorage.getItem(BOOKING_DRAFT_KEY)
    if (existingRaw) {
      try {
        const existingCart = JSON.parse(existingRaw)
        // If an existing main draft has an active seat hold for another event,
        // do not overwrite the main draft with a cart that has no active hold.
        if (
          existingCart &&
          String(existingCart.eventId) !== String(cart.eventId) &&
          hasActiveSeatHold(existingCart) &&
          !hasActiveSeatHold(cart)
        ) {
          return
        }
      } catch { }
    }

    window.localStorage.setItem(BOOKING_DRAFT_KEY, raw)
  } catch { }
}

export function clearBookingDraft(eventId = null) {
  if (typeof window === 'undefined') return
  try {
    if (eventId) {
      window.localStorage.removeItem(getEventDraftKey(eventId))
      const mainRaw = window.localStorage.getItem(BOOKING_DRAFT_KEY)
      if (mainRaw) {
        try {
          const mainCart = JSON.parse(mainRaw)
          if (String(mainCart?.eventId) === String(eventId)) {
            window.localStorage.removeItem(BOOKING_DRAFT_KEY)
          }
        } catch { }
      }
      return
    }

    const mainRaw = window.localStorage.getItem(BOOKING_DRAFT_KEY)
    if (mainRaw) {
      try {
        const mainCart = JSON.parse(mainRaw)
        if (mainCart?.eventId) {
          window.localStorage.removeItem(getEventDraftKey(mainCart.eventId))
        }
      } catch { }
    }
    window.localStorage.removeItem(BOOKING_DRAFT_KEY)
  } catch { }
}
