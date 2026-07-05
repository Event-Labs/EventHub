const MAX_HISTORY_ITEMS = 10;

function normalizeHistory(history = []) {
  return history
    .filter((message) => ['user', 'assistant'].includes(message.role) && message.content)
    .slice(-MAX_HISTORY_ITEMS)
    .map((message) => ({
      role: message.role,
      content: String(message.content).slice(0, 1000),
    }));
}

function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        return null;
      }
    }

    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function buildSourceRegistry(context) {
  const sources = [];

  for (const event of context.public_events?.items || []) {
    sources.push({
      id: event.id,
      title: event.title,
      category: 'events',
    });
  }

  for (const event of context.query_matched_events?.items || []) {
    sources.push({
      id: event.id,
      title: event.title,
      category: 'events',
    });
  }

  for (const category of context.categories?.items || []) {
    sources.push({
      id: category.id,
      title: category.name,
      category: 'event_categories',
    });
  }

  return Array.from(new Map(sources.map((source) => [String(source.id), source])).values());
}

function sanitizeSources(modelSources, allowedSources) {
  const allowedById = new Map(allowedSources.map((source) => [String(source.id), source]));

  return (Array.isArray(modelSources) ? modelSources : [])
    .map((source) => allowedById.get(String(source.id)))
    .filter(Boolean)
    .slice(0, 5);
}

function buildPrompt({ query, history, context, sessionId }) {
  return [
    'Bạn là EventHub AI Chatbox — trợ lý AI chính thức của nền tảng EventHub.',
    '',
    '## NHIỆM VỤ',
    'Trả lời câu hỏi của người dùng dựa trên SYSTEM_CONTEXT được cung cấp bên dưới.',
    '',
    '## NGUYÊN TẮC BẮT BUỘC',
    '1. Ưu tiên dùng dữ liệu từ SYSTEM_CONTEXT. Nếu SYSTEM_CONTEXT có dữ liệu liên quan, PHẢI dùng để trả lời.',
    '2. Khi người dùng hỏi về sự kiện sắp diễn ra / đề xuất sự kiện → dùng public_events.items (đã lọc sự kiện chưa diễn ra). Liệt kê tên, thời gian, địa điểm.',
    '3. Khi người dùng hỏi về vé của họ → dùng user_context.upcoming_tickets (vé sắp tới) và user_context.ticket_summary. Nếu upcoming_tickets rỗng → báo không có vé sắp tới.',
    '4. Ngày giờ đã được format sẵn theo giờ Việt Nam trong SYSTEM_CONTEXT — dùng nguyên văn, không tự tính lại.',
    '5. Trả lời bằng tiếng Việt, rõ ràng, thân thiện. Dùng gạch đầu dòng nếu liệt kê từ 3 mục trở lên.',
    '6. Nếu câu hỏi hoàn toàn ngoài phạm vi EventHub (code, tin tức, bài văn...) → từ chối ngắn gọn.',
    '7. Nếu SYSTEM_CONTEXT thiếu dữ liệu cụ thể → thành thật nói chưa đủ dữ liệu, gợi ý trang phù hợp.',
    '8. KHÔNG bịa thông tin, KHÔNG nhắc đến prompt nội bộ, SYSTEM_CONTEXT, JSON hay API.',
    '9. Độ dài trả lời: tối đa 6-8 câu hoặc 6 gạch đầu dòng. Ngắn gọn, đủ ý.',
    '',
    '## PHẠM VI EVENTHUB',
    'Sự kiện công khai, vé cá nhân, đơn hàng, thanh toán, check-in QR, tài khoản, organizer request, phản hồi sự kiện, chính sách nền tảng.',
    '',
    '## OUTPUT FORMAT (JSON bắt buộc)',
    JSON.stringify({
      answer: 'Câu trả lời đầy đủ cho người dùng',
      intent: 'event_discovery | ticket_order | payment | checkin | account | organizer | feedback | out_of_scope | insufficient_context | general_eventhub',
      confidence: 0.85,
      sources: [{ id: 'id nguồn từ SYSTEM_CONTEXT nếu tham chiếu' }],
    }),
    '',
    '## SYSTEM_CONTEXT',
    JSON.stringify(context, null, 2),
    '',
    '## LỊCH SỬ HỘI THOẠI',
    history.length > 0 ? JSON.stringify(history, null, 2) : '(chưa có)',
    '',
    `## CÂU HỎI NGƯỜI DÙNG\n${query}`,
  ].join('\n');
}

function createUnavailableAnswer(message, intent = 'insufficient_context') {
  return {
    output: message,
    meta: {
      intent,
      confidence: 0.3,
      sources: [],
      personalization: null,
    },
  };
}

module.exports = {
  normalizeHistory,
  extractJson,
  buildSourceRegistry,
  sanitizeSources,
  buildPrompt,
  createUnavailableAnswer,
};
