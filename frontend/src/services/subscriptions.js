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
