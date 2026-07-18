import { http } from '@/services/http.js'

export async function fetchMyTickets(status) {
  const response = await http.get('/tickets/me', {
    params: status && status !== 'ALL' ? { status } : undefined,
  })
  return response.data.data
}

export async function fetchTicketDetail(ticketId) {
  const response = await http.get(`/tickets/${ticketId}`)
  return response.data.data
}

export async function downloadTicket(ticketId) {
  const response = await http.get(`/tickets/${ticketId}/download`, {
    responseType: 'blob',
  })
  return response.data
}

export async function checkInTicketByQr(payload) {
  const response = await http.post('/staff/tickets/check-in/qr', payload)
  return response.data.data
}

export async function verifyStaffTicketByQr(payload) {
  const response = await http.post('/staff/tickets/verify-qr', payload)
  return response.data.data
}

export async function searchStaffTickets(payload) {
  const response = await http.post('/staff/tickets/search', payload)
  return response.data.data
}

export async function fetchStaffTicket(ticketId) {
  const response = await http.get(`/staff/tickets/${ticketId}`)
  return response.data.data
}

export async function checkInStaffTicket(ticketId) {
  const response = await http.patch(`/staff/tickets/${ticketId}/check-in`)
  return response.data.data
}
