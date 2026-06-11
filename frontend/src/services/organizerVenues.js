import { http } from '@/services/http.js'

export async function getVenues() {
  const response = await http.get('/organizer/venues')
  return response.data.data
}

export async function getVenue(id) {
  const response = await http.get(`/organizer/venues/${id}`)
  return response.data.data
}

export async function createVenue(data) {
  const response = await http.post('/organizer/venues', data)
  return response.data.data
}

export async function updateVenue(id, data) {
  const response = await http.put(`/organizer/venues/${id}`, data)
  return response.data.data
}

export async function deleteVenue(id) {
  const response = await http.delete(`/organizer/venues/${id}`)
  return response.data.data
}

export async function getVenueSeatMaps(venueId) {
  const response = await http.get(`/organizer/venues/${venueId}/seat-maps`)
  return response.data.data
}
