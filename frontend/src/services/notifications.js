import { http } from '@/services/http.js'

export async function fetchNotifications(params = {}) {
  const response = await http.get('/notifications', { params })
  return response.data.data
}

export async function fetchUnreadNotificationCount() {
  const response = await http.get('/notifications/unread-count')
  return response.data.data
}

export async function markNotificationRead(notificationId) {
  const response = await http.patch(`/notifications/${notificationId}/read`)
  return response.data.data
}

export async function markAllNotificationsRead() {
  const response = await http.patch('/notifications/read-all')
  return response.data.data
}

export async function fetchOrganizerAnnouncementEvents() {
  const response = await http.get('/notifications/organizer/events')
  return response.data.data
}

export async function fetchOrganizerAnnouncements() {
  const response = await http.get('/notifications/organizer/announcements')
  return response.data.data
}

export async function sendOrganizerAnnouncement(payload) {
  const response = await http.post('/notifications/organizer/announcements', payload)
  return response.data.data
}

export function getNotificationStreamUrl(token) {
  const baseURL = http.defaults.baseURL || 'http://localhost:8080/api'
  const normalizedBaseURL = baseURL.startsWith('http')
    ? baseURL
    : `${window.location.origin}${baseURL.startsWith('/') ? '' : '/'}${baseURL}`
  const url = new URL(`${normalizedBaseURL.replace(/\/$/, '')}/notifications/stream`)
  url.searchParams.set('token', token)
  return url.toString()
}
