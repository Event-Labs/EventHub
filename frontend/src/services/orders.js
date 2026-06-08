import { http } from '@/services/http.js'

export async function checkoutOrder(payload) {
  const response = await http.post('/orders/checkout', payload)
  return response.data.data
}

export async function fetchOrderStatus(orderId) {
  const response = await http.get(`/orders/${orderId}/status`)
  return response.data.data
}

export async function cancelOrder(orderId) {
  const response = await http.post(`/orders/${orderId}/cancel`)
  return response.data.data
}
