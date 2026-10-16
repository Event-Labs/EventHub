import { http } from '@/services/http.js'

export async function sendChatMessage(message, history = [], options = {}, extra = {}) {
  const payload = {
    message,
    history,
    sessionId: extra.sessionId,
    title: extra.title,
  }
  const response = await http.post('/ai-assistant/chat', payload, options)
  return response.data.data
}

export async function getAiChatSessions() {
  const response = await http.get('/ai-assistant/sessions')
  return response.data.data
}

export async function saveAiChatSession(session) {
  const response = await http.post('/ai-assistant/sessions', session)
  return response.data.data
}

export async function syncAiChatSessions(sessions) {
  const response = await http.post('/ai-assistant/sessions/sync', { sessions })
  return response.data.data
}

export async function deleteAiChatSession(sessionId) {
  const response = await http.delete(`/ai-assistant/sessions/${sessionId}`)
  return response.data.data
}
