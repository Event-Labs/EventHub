import { http } from '@/services/http.js'

export async function fetchCurrentPlan() {
  const response = await http.get('/organizer/billing/current-plan')
  return response.data.data
}

export async function subscribeToPlan(subscriptionId) {
  const response = await http.post('/organizer/billing/subscribe', { subscription_id: subscriptionId })
  return response.data.data
}
