import { http } from '@/services/http.js'

export async function sendChatMessage(message, history = []) {
  const response = await http.post('/ai-assistant/chat', { message, history })
  return response.data.data
}
