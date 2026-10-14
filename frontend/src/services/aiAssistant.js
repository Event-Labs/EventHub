import { http } from '@/services/http.js'

export async function sendChatMessage(message, history = [], options = {}) {
  const response = await http.post('/ai-assistant/chat', { message, history }, options)
  return response.data.data
}
