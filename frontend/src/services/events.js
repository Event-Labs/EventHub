import { http } from '@/services/http.js'

export async function fetchEvents(params = {}) {
  const response = await http.get('/events', { params })
  return response.data.data
}

export async function fetchEventCategories() {
  const response = await http.get('/events/categories')
  return response.data.data
}

export async function fetchAdminEventCategories() {
  const response = await http.get('/admin/event-categories')
  return response.data.data
}

export async function createAdminEventCategory(payload) {
  const response = await http.post('/admin/event-categories', payload)
  return response.data.data
}

export async function updateAdminEventCategory(categoryId, payload) {
  const response = await http.patch(`/admin/event-categories/${categoryId}`, payload)
  return response.data.data
}

export async function deleteAdminEventCategory(categoryId) {
  const response = await http.delete(`/admin/event-categories/${categoryId}`)
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
