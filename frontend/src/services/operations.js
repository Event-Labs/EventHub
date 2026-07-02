import { http } from '@/services/http.js'

export async function fetchOrganizerOperationsOverview() {
  const response = await http.get('/operations/organizer/overview')
  return response.data.data
}

export async function fetchStaffCandidates(params = {}) {
  const response = await http.get('/operations/organizer/staff-candidates', { params })
  return response.data.data
}

export async function inviteStaffToEvent(payload) {
  const response = await http.post('/operations/organizer/staff-invitations', payload)
  return response.data.data
}

export async function removeStaffFromEvent(eventId, staffId) {
  const response = await http.delete(`/operations/organizer/events/${eventId}/staff/${staffId}`)
  return response.data.data
}

export async function createStaffTask(payload) {
  const response = await http.post('/operations/organizer/tasks', payload)
  return response.data.data
}

export async function fetchOrganizerStaffTasks(params = {}) {
  const response = await http.get('/operations/organizer/tasks', { params })
  return response.data.data
}

export async function fetchAssignedStaffEvents() {
  const response = await http.get('/operations/staff/events')
  return response.data.data
}

export async function fetchAssignedStaffTasks(params = {}) {
  const response = await http.get('/operations/staff/tasks', { params })
  return response.data.data
}

export async function updateAssignedStaffTaskStatus(taskId, status) {
  const response = await http.patch(`/operations/staff/tasks/${taskId}/status`, { status })
  return response.data.data
}

export async function fetchMyStaffInvitations() {
  const response = await http.get('/operations/staff-invitations/me')
  return response.data.data
}

export async function acceptStaffInvitation(invitationId) {
  const response = await http.post(`/operations/staff-invitations/${invitationId}/accept`)
  return response.data.data
}

export async function declineStaffInvitation(invitationId) {
  const response = await http.post(`/operations/staff-invitations/${invitationId}/decline`)
  return response.data.data
}
