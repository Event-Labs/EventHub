import { http } from '@/services/http.js'

export async function fetchOrganizerVenues() {
  const response = await http.get('/organizer/events/venues')
  return response.data.data
}

export async function createOrganizerEvent(payload) {
  const response = await http.post('/organizer/events', payload)
  return response.data.data
}

export async function fetchOrganizerEvents() {
  const response = await http.get('/organizer/events')
  return response.data.data
}

export async function fetchOrganizerEvent(eventId) {
  const response = await http.get(`/organizer/events/${eventId}`)
  return response.data.data
}

export async function updateOrganizerEvent(eventId, payload) {
  const response = await http.put(`/organizer/events/${eventId}`, payload)
  return response.data.data
}

export async function submitOrganizerEvent(eventId) {
  const response = await http.post(`/organizer/events/${eventId}/submit`)
  return response.data.data
}

export async function publishOrganizerEvent(eventId) {
  const response = await http.post(`/organizer/events/${eventId}/publish`)
  return response.data.data
}

export async function cancelOrganizerEvent(eventId) {
  const response = await http.post(`/organizer/events/${eventId}/cancel`)
  return response.data.data
}

export async function addOrganizerSession(eventId, payload) {
  const response = await http.post(`/organizer/events/${eventId}/sessions`, payload)
  return response.data.data
}

export async function updateOrganizerSession(eventId, sessionId, payload) {
  const response = await http.put(`/organizer/events/${eventId}/sessions/${sessionId}`, payload)
  return response.data.data
}

export async function deleteOrganizerSession(eventId, sessionId) {
  const response = await http.delete(`/organizer/events/${eventId}/sessions/${sessionId}`)
  return response.data.data
}

export async function addOrganizerTicketType(eventId, sessionId, payload) {
  const response = await http.post(
    `/organizer/events/${eventId}/sessions/${sessionId}/ticket-types`,
    payload,
  )
  return response.data.data
}

export async function updateOrganizerTicketType(eventId, sessionId, ticketTypeId, payload) {
  const response = await http.put(
    `/organizer/events/${eventId}/sessions/${sessionId}/ticket-types/${ticketTypeId}`,
    payload,
  )
  return response.data.data
}

export async function deleteOrganizerTicketType(eventId, sessionId, ticketTypeId) {
  const response = await http.delete(
    `/organizer/events/${eventId}/sessions/${sessionId}/ticket-types/${ticketTypeId}`,
  )
  return response.data.data
}
