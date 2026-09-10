import { http } from '@/services/http.js'

// Customer APIs
export async function submitRefundRequest(payload) {
  const response = await http.post('/refunds', payload)
  return response.data.data
}

export async function fetchMyRefundRequests(params = {}) {
  const response = await http.get('/refunds/my-requests', { params })
  return response.data.data
}

export async function fetchRefundDetail(id) {
  const response = await http.get(`/refunds/${id}`)
  return response.data.data
}

// Organizer APIs
export async function fetchOrganizerRefundRequests(params = {}) {
  const response = await http.get('/organizer/refunds', { params })
  return response.data.data
}

export async function processOrganizerRefund(id, payload) {
  const response = await http.patch(`/organizer/refunds/${id}/process`, payload)
  return response.data.data
}
