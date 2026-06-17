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

// Organizer: subscribe to a plan — returns { requires_payment, checkout_url?, qr_code?, payment_id?, ... }
export async function subscribeToPlan(subscriptionId) {
  const response = await http.post('/organizer/subscriptions/subscribe', { subscription_id: subscriptionId })
  return response.data.data
}

// Organizer: poll payment status for a pending subscription payment
export async function fetchSubscriptionPaymentStatus(paymentId) {
  const response = await http.get(`/organizer/subscriptions/payment-status/${paymentId}`)
  return response.data.data
}
