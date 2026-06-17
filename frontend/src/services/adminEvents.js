import { http } from './http.js'

export async function reviewAdminEvent(eventId, payload) {
  const response = await http.patch(`/admin/events/${eventId}/review`, payload)
  return response.data.data
}

export async function hideAdminEvent(eventId, payload = {}) {
  const response = await http.patch(`/admin/events/${eventId}/hide`, payload)
  return response.data.data
}

export async function fetchAdminEvents(params = {}) {
  const response = await http.get('/admin/events/pending', { params })
  return response.data.data
}

export async function unhideAdminEvent(eventId) {
  const response = await http.patch(`/admin/events/${eventId}/unhide`)
  return response.data.data
}
