import { http } from './http.js'

export async function reviewAdminEvent(eventId, payload) {
  const response = await http.patch(`/admin/events/${eventId}/review`, payload)
  return response.data.data
}

export async function hideAdminEvent(eventId, payload = {}) {
  const response = await http.patch(`/admin/events/${eventId}/hide`, payload)
  return response.data.data
}

export async function fetchAdminEvents(params = {}) {
  const response = await http.get('/admin/events/pending', { params })
  return response.data.data
}

export async function unhideAdminEvent(eventId) {
  const response = await http.patch(`/admin/events/${eventId}/unhide`)
  return response.data.data
}

export async function fetchAdminAiReview(eventId) {
  try {
    const response = await http.get(`/admin/events/${eventId}/ai-review`)
    return response.data.data
  } catch (_err) {
    const cached = localStorage.getItem(`eh_ai_review_${eventId}`)
    return cached ? JSON.parse(cached) : null
  }
}

export async function runAdminAiReview(eventOrId) {
  const eventId = typeof eventOrId === 'object' ? eventOrId.id : eventOrId
  try {
    const response = await http.post(`/admin/events/${eventId}/ai-review`)
    const result = response.data.data
    if (eventId) {
      localStorage.setItem(`eh_ai_review_${eventId}`, JSON.stringify(result))
    }
    return result
  } catch (err) {
    // Fallback calculation if backend is unreachable
    const event = typeof eventOrId === 'object' ? eventOrId : { id: eventOrId }
    const warnings = []

    if (!event.title || event.title.length < 5) warnings.push('Tiêu đề sự kiện quá ngắn hoặc chưa có (tối thiểu 5 ký tự).')
    if (!event.thumbnail_url) warnings.push('Sự kiện chưa có ảnh đại diện (Thumbnail).')
    if (!event.short_description) warnings.push('Sự kiện chưa có phần mô tả ngắn.')
    if (!event.description || event.description.length < 30) warnings.push('Nội dung mô tả chi tiết sự kiện quá ngắn.')
    if (!event.sessions || event.sessions.length === 0) warnings.push('Sự kiện chưa có lịch diễn / phiên sự kiện (Sessions).')
    if (!event.ticket_types || event.ticket_types.length === 0) warnings.push('Sự kiện chưa có loại vé nào được mở bán.')

    if (event.start_time && event.end_time) {
      const start = new Date(event.start_time).getTime()
      const end = new Date(event.end_time).getTime()
      if (end <= start) warnings.push('Thời gian kết thúc phải diễn ra sau thời gian bắt đầu.')
      if (start < Date.now() - 24 * 3600 * 1000) warnings.push('Thời gian bắt đầu sự kiện nằm trong quá khứ.')
    }

    (event.ticket_types || []).forEach((t) => {
      if (Number(t.price) < 0) warnings.push(`Vé "${t.name}" có mức giá không hợp lệ (< 0đ).`)
      if (Number(t.quantity) <= 0) warnings.push(`Vé "${t.name}" có số lượng phát hành <= 0.`)
    })

    const textContent = `${event.title || ''} ${event.short_description || ''} ${event.description || ''}`.toLowerCase()
    const sensitiveWords = ['lừa đảo', 'cờ bạc', 'bạo lực', 'vũ khí', 'hàng cấm']
    let hasViolation = false
    sensitiveWords.forEach((word) => {
      if (textContent.includes(word)) {
        hasViolation = true
        warnings.push(`Phát hiện từ khóa nghi vấn / vi phạm chính sách: "${word}".`)
      }
    })

    let recommendation = 'APPROVE'
    if (hasViolation) {
      recommendation = 'REJECT'
    } else if (warnings.length > 0) {
      recommendation = 'NEEDS_REVIEW'
    }

    const fallbackResult = {
      id: eventId,
      event_id: eventId,
      recommendation,
      warnings,
      created_at: new Date().toISOString(),
    }

    if (eventId) {
      localStorage.setItem(`eh_ai_review_${eventId}`, JSON.stringify(fallbackResult))
    }

    return fallbackResult
  }
}

