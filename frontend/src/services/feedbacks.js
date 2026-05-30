import { http } from '@/services/http.js'

export async function fetchEligibleFeedbackEvents() {
  const response = await http.get('/feedbacks/eligible-events')
  return response.data.data
}

export async function submitEventFeedback(payload) {
  const response = await http.post('/feedbacks', payload)
  return response.data.data
}

export async function fetchOrganizerFeedbackEvents() {
  const response = await http.get('/organizer/feedback/events')
  return response.data.data
}

export async function fetchOrganizerFeedbackReport(eventId) {
  const response = await http.get(`/organizer/feedback/events/${eventId}/report`)
  return response.data.data
}
