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

export async function updateEventStaff(eventId, staffId, payload) {
  const response = await http.patch(`/operations/organizer/events/${eventId}/staff/${staffId}`, payload)
  return response.data.data
}

export async function deleteStaffInvitation(invitationId) {
  const response = await http.delete(`/operations/organizer/staff-invitations/${invitationId}`)
  return response.data.data
}

export async function removeStaffFromEvent(eventId, staffId) {
  const response = await http.delete(`/operations/organizer/events/${eventId}/staff/${staffId}`)
  return response.data.data
}

export async function fetchStaffOverview() {
  const response = await http.get('/operations/staff/overview')
  return response.data.data
}

export async function fetchAssignedStaffEvents() {
  const response = await http.get('/operations/staff/events')
  return response.data.data
}

export async function fetchStaffCheckInReport(eventId) {
  const response = await http.get('/operations/staff/check-in-report', {
    params: eventId ? { event_id: eventId } : undefined,
  })
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
