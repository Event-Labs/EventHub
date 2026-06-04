import { http } from '@/services/http.js'

export async function checkoutOrder(payload) {
  const response = await http.post('/orders/checkout', payload)
  return response.data.data
}
