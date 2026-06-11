import { http } from '@/services/http.js'

export async function getSeatMap(id) {
  const response = await http.get(`/organizer/seat-maps/${id}`)
  return response.data.data
}

export async function createSeatMap(venueId, data) {
  const response = await http.post(`/organizer/venues/${venueId}/seat-maps`, data)
  return response.data.data
}

export async function updateSeatMap(id, data) {
  const response = await http.put(`/organizer/seat-maps/${id}`, data)
  return response.data.data
}

export async function deleteSeatMap(id) {
  const response = await http.delete(`/organizer/seat-maps/${id}`)
  return response.data.data
}

export async function assignZones(eventId, sessionId, data) {
  const response = await http.post(
    `/organizer/events/${eventId}/sessions/${sessionId}/zone-assignments`,
    data,
  )
  return response.data.data
}
