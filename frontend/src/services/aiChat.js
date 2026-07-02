import { http } from '@/services/http.js'

export async function fetchAiChatMeta() {
  const response = await http.get('/ai-faq/meta')
  return response.data.data
}

export async function sendAiChatMessage(payload) {
  const response = await http.post('/ai-faq/chat', payload)
  return response.data.data
}

export async function fetchAiChatHistory() {
  const response = await http.get('/ai-faq/history/me')
  return response.data.data
}
