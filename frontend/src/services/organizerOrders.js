import { http } from '@/services/http.js'

/**
 * @param {object} params - { page, limit, eventId, status, search }
 */
export async function fetchOrganizerOrders(params = {}) {
  const response = await http.get('/organizer/orders', { params })
  return response.data.data // { items, pagination }
}

export async function fetchOrganizerOrderDetail(orderId) {
  const response = await http.get(`/organizer/orders/${orderId}`)
  return response.data.data // { order, items }
}

/**
 * @param {string} eventId
 * @param {object} params - { page, limit, sessionId, ticketTypeId, status, search }
 */
export async function fetchOrganizerAttendees(eventId, params = {}) {
  const response = await http.get(`/organizer/orders/events/${eventId}/attendees`, { params })
  return response.data.data // { items, pagination }
}

/**
 * @param {string} eventId
 */
export async function fetchCheckinStats(eventId) {
  const response = await http.get(`/organizer/orders/events/${eventId}/checkin-stats`)
  return response.data.data
}

/**
 * @param {object} params - { eventId?, dateFrom?, dateTo? }
 */
export async function fetchRevenueStats(params = {}) {
  const response = await http.get('/organizer/orders/revenue', { params })
  return response.data.data
}

/**
 * @param {object} params - { eventId?, dateFrom?, dateTo? }
 */
export async function fetchTicketSalesAnalytics(params = {}) {
  const response = await http.get('/organizer/orders/ticket-sales', { params })
  return response.data.data
}

/**
 * @param {object} payload - { eventId, dateFrom?, dateTo? }
 */
export async function generateFinancialSummary(payload) {
  const response = await http.post('/organizer/orders/financial-summary', payload)
  return response.data.data
}
