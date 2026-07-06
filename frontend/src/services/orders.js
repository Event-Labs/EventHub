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

export async function fetchStaffDirectBookingEvents() {
  const response = await http.get('/orders/staff/direct-booking/events')
  return response.data.data
}

export async function createStaffDirectBooking(payload) {
  const response = await http.post('/orders/staff/direct-booking', payload)
  return response.data.data
}

export async function fetchStaffDirectBookingStatus(orderId) {
  const response = await http.get(`/orders/staff/direct-booking/${orderId}/status`)
  return response.data.data
}
