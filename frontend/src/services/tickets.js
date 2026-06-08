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
