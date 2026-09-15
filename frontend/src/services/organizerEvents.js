import { http } from '@/services/http.js'

export async function fetchOrganizerProfile(sensitiveAccessToken = null) {
  const response = await http.get('/organizer/events/me', {
    headers: sensitiveAccessToken
      ? { 'X-Organizer-Sensitive-Token': sensitiveAccessToken }
      : undefined,
  })
  return response.data.data
}

export async function startOrganizerSensitiveAccess() {
  const response = await http.post('/organizer/events/me/sensitive-access/start')
  return response.data.data
}

export async function verifyOrganizerSensitiveAccess({ challengeId, otp }) {
  const response = await http.post('/organizer/events/me/sensitive-access/verify', { challengeId, otp })
  return response.data.data
}

export async function updateOrganizerProfile(payload) {
  const response = await http.patch('/organizer/events/me', payload)
  return response.data.data
}

export async function fetchOrganizerVenues() {
  const response = await http.get('/organizer/events/venues')
  return response.data.data
}

export async function createOrganizerEvent(payload) {
  const response = await http.post('/organizer/events', payload)
  return response.data.data
}

export async function fetchOrganizerEvents() {
  const response = await http.get('/organizer/events')
  return response.data.data
}

export async function fetchOrganizerEvent(eventId) {
  const response = await http.get(`/organizer/events/${eventId}`)
  return response.data.data
}

export async function updateOrganizerEvent(eventId, payload) {
  const response = await http.put(`/organizer/events/${eventId}`, payload)
  return response.data.data
}

export async function submitOrganizerEvent(eventId) {
  const response = await http.post(`/organizer/events/${eventId}/submit`)
  return response.data.data
}

export async function publishOrganizerEvent(eventId) {
  const response = await http.post(`/organizer/events/${eventId}/publish`)
  return response.data.data
}

export async function cancelOrganizerEvent(eventId) {
  const response = await http.post(`/organizer/events/${eventId}/cancel`)
  return response.data.data
}

export async function fetchLatestAiContentGeneration(eventId = null) {
  try {
    const response = await http.get('/organizer/events/ai-content-generation/latest', {
      params: eventId ? { eventId } : {},
    })
    const data = response.data.data
    if (data) {
      localStorage.setItem(`eh_ai_content_${eventId || 'new'}`, JSON.stringify(data))
      return data
    }
  } catch (_err) {
    // ignore
  }

  const cached = localStorage.getItem(`eh_ai_content_${eventId || 'new'}`)
  return cached ? JSON.parse(cached) : null
}

export async function generateAiEventContent(payload) {
  const {
    topic = '',
    category_name = '',
    target_audience = '',
    key_highlights = '',
    tone = 'Chuyên nghiệp',
    event_id = null,
  } = payload || {}

  try {
    const response = await http.post('/organizer/events/ai-content-generation', {
      topic,
      category_name,
      target_audience,
      key_highlights,
      tone,
      event_id,
    })
    const result = response.data.data
    if (result) {
      localStorage.setItem(`eh_ai_content_${event_id || 'new'}`, JSON.stringify(result))
      return result
    }
  } catch (_err) {
    // Fallback local simulation if backend route is unavailable
  }

  const cleanTopic = (topic || '').trim()
  const audienceText = target_audience
    ? `dành riêng cho ${target_audience}`
    : 'dành cho tất cả mọi người yêu thích trải nghiệm mới'
  const highlightText = key_highlights ? ` Điểm nhấn: ${key_highlights}.` : ''

  const suggested_titles = [
    `${cleanTopic}: Khám Phá & Đột Phá 2026`,
    `Hội Tụ Đam Mê - ${cleanTopic}`,
    `Đại Hội ${cleanTopic} & Trải Nghiệm Đỉnh Cao`,
  ]

  const short_description = `Chào mừng bạn đến với ${cleanTopic} ${audienceText}.${highlightText}`.slice(0, 160)

  const content_html = `<p><strong>Chào mừng bạn đến với sự kiện ${cleanTopic}!</strong></p>
<p>Sự kiện mang đến không gian trải nghiệm đẳng cấp ${audienceText}. Đây là cơ hội tuyệt vời để giao lưu, học hỏi và kết nối những giá trị mới.</p>
<br/>
<p><strong>🌟 Hoạt động và Điểm nhấn nổi bật:</strong></p>
<ul>
  <li><strong>Chương trình chính:</strong> Trình diễn, chia sẻ kiến thức chuyên sâu và giao lưu trực tiếp.</li>
  <li><strong>Khách mời đặc biệt:</strong> ${key_highlights || 'Các chuyên gia, diễn giả và khách mời có tầm ảnh hưởng.'}</li>
  <li><strong>Trải nghiệm độc quyền:</strong> Khu vực tương tác, nhận quà lưu niệm và networking dành riêng cho người tham gia.</li>
</ul>
<br/>
<p><strong>📋 Thông tin quan trọng:</strong></p>
<ul>
  <li>Vui lòng mang theo mã vé QR khi đến cổng check-in.</li>
  <li>Tuân thủ quy định và hướng dẫn của Ban tổ chức trong suốt thời gian diễn ra sự kiện.</li>
</ul>`

  const words = cleanTopic.split(/\s+/).filter((w) => w.length > 2)
  const tags = Array.from(
    new Set([category_name || 'Sự kiện', 'EventHub', '2026', ...words.slice(0, 3)]),
  ).filter(Boolean)

  const fallbackData = {
    id: `local-${Date.now()}`,
    prompt_data: { topic, category_name, target_audience, key_highlights, tone },
    generated_content: {
      suggested_titles,
      selected_title: suggested_titles[0],
      short_description,
      content_html,
      tags,
    },
    created_at: new Date().toISOString(),
  }

  localStorage.setItem(`eh_ai_content_${event_id || 'new'}`, JSON.stringify(fallbackData))
  return fallbackData
}


export async function addOrganizerSession(eventId, payload) {
  const response = await http.post(`/organizer/events/${eventId}/sessions`, payload)
  return response.data.data
}

export async function updateOrganizerSession(eventId, sessionId, payload) {
  const response = await http.put(`/organizer/events/${eventId}/sessions/${sessionId}`, payload)
  return response.data.data
}

export async function deleteOrganizerSession(eventId, sessionId) {
  const response = await http.delete(`/organizer/events/${eventId}/sessions/${sessionId}`)
  return response.data.data
}

export async function addOrganizerTicketType(eventId, sessionId, payload) {
  const response = await http.post(
    `/organizer/events/${eventId}/sessions/${sessionId}/ticket-types`,
    payload,
  )
  return response.data.data
}

export async function updateOrganizerTicketType(eventId, sessionId, ticketTypeId, payload) {
  const response = await http.put(
    `/organizer/events/${eventId}/sessions/${sessionId}/ticket-types/${ticketTypeId}`,
    payload,
  )
  return response.data.data
}

export async function deleteOrganizerTicketType(eventId, sessionId, ticketTypeId) {
  const response = await http.delete(
    `/organizer/events/${eventId}/sessions/${sessionId}/ticket-types/${ticketTypeId}`,
  )
  return response.data.data
}
