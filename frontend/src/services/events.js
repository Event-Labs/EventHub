import { http } from '@/services/http.js'

export async function fetchEvents(params = {}) {
  const response = await http.get('/events', { params })
  return response.data.data
}

export async function fetchEventCategories() {
  const response = await http.get('/events/categories')
  return response.data.data
}

export async function fetchEventDetail(identifier) {
  const response = await http.get(`/events/${identifier}`)
  return response.data.data
}

export async function fetchFavoriteEvents() {
  const response = await http.get('/events/favorites/me')
  return response.data.data
}

export async function addFavorite(eventId) {
  const response = await http.post(`/events/${eventId}/favorite`)
  return response.data.data
}

export async function removeFavorite(eventId) {
  const response = await http.delete(`/events/${eventId}/favorite`)
  return response.data.data
}

export async function toggleFavorite(eventId) {
  const response = await http.post(`/events/${eventId}/favorite/toggle`)
  return response.data.data
}
