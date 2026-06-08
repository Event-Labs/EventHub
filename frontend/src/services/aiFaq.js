import { http } from '@/services/http.js'

export async function fetchAiFaqMeta() {
  const response = await http.get('/ai-faq/meta')
  return response.data.data
}

export async function sendAiFaqMessage(payload) {
  const response = await http.post('/ai-faq/chat', payload)
  return response.data.data
}

export async function fetchAiFaqHistory() {
  const response = await http.get('/ai-faq/history/me')
  return response.data.data
}
