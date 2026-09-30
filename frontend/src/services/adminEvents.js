import { http } from './http.js'

export async function fetchAdminEventDetail(eventId) {
  const response = await http.get(`/admin/events/${eventId}`)
  return response.data.data
}

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

export async function fetchAdminAiReview(eventId) {
  try {
    const response = await http.get(`/admin/events/${eventId}/ai-review`)
    return response.data.data
  } catch (_err) {
    return null
  }
}

export async function runAdminAiReview(eventOrId) {
  const eventId = typeof eventOrId === 'object' ? eventOrId.id : eventOrId
  const response = await http.post(`/admin/events/${eventId}/ai-review`)
  const result = response.data.data
  if (eventId && result) {
    localStorage.removeItem(`eh_ai_review_${eventId}`)
  }
  return result
}

export async function fetchAdminAutoReviewSettings() {
  const response = await http.get('/admin/events/settings/auto-review')
  return response.data.data
}

export async function updateAdminAutoReviewSettings(payload) {
  const response = await http.patch('/admin/events/settings/auto-review', payload)
  return response.data.data
}

export async function runAdminBatchAutoReview() {
  const response = await http.post('/admin/events/auto-review/batch')
  return response.data.data
}


