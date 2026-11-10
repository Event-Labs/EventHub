import { http } from '@/services/http.js'

export async function fetchMyOrganizerRequest() {
  const response = await http.get('/organizer-requests/me')
  return response.data.data
}

export async function fetchMyOrganizerRequests() {
  const response = await http.get('/organizer-requests/me/history')
  return response.data.data
}

export async function scanCccdCard(file) {
  const formData = new FormData()
  formData.append('card_image', file)
  const response = await http.post('/organizer-requests/cccd/scan', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data.data
}

export async function submitOrganizerRequest(payload) {
  const response = await http.post('/organizer-requests/me', payload)
  return response.data.data
}

export async function updateOrganizerRequest(id, payload) {
  const response = await http.put(`/organizer-requests/me/${id}`, payload)
  return response.data.data
}

export async function submitOrganizerProfileUpdateRequest(payload) {
  const response = await http.post('/organizer-requests/me/profile-update', payload)
  return response.data.data
}

export async function verifyOrganizerBusinessEmail(token) {
  const response = await http.get('/organizer-requests/verify-business-email', {
    params: { token },
  })
  return response.data.data
}

export async function fetchAdminOrganizerRequests(params = {}) {
  const response = await http.get('/admin/organizer-requests', { params })
  return response.data.data
}

export async function fetchAdminOrganizerRequest(id) {
  const response = await http.get(`/admin/organizer-requests/${id}`)
  return response.data.data
}

export async function reviewOrganizerRequest(id, payload) {
  const response = await http.patch(`/admin/organizer-requests/${id}/review`, payload)
  return response.data.data
}
