import { http } from '@/services/http.js'

export async function fetchAdminSubscriptions() {
  const response = await http.get('/admin/subscriptions')
  return response.data.data
}

export async function createAdminSubscription(payload) {
  const response = await http.post('/admin/subscriptions', payload)
  return response.data.data
}

export async function updateAdminSubscription(subscriptionId, payload) {
  const response = await http.patch(`/admin/subscriptions/${subscriptionId}`, payload)
  return response.data.data
}

export async function deleteAdminSubscription(subscriptionId) {
  const response = await http.delete(`/admin/subscriptions/${subscriptionId}`)
  return response.data.data
}

// Organizer: view available subscription plans (read-only)
export async function fetchSubscriptionsForOrganizer() {
  const response = await http.get('/admin/subscriptions')
  return response.data.data
}

// Organizer: fetch current active plan
export async function fetchCurrentPlan() {
  const response = await http.get('/organizer/subscriptions/current-plan')
  return response.data.data
}

// Organizer: subscribe to a plan (simulated/direct activation)
export async function subscribeToPlan(subscriptionId) {
  const response = await http.post('/organizer/subscriptions/subscribe', { subscription_id: subscriptionId })
  return response.data.data
}
