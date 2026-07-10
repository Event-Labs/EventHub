const systemContextService = require('./systemContext.service');
const {
  normalizeHistory,
  extractJson,
  buildSourceRegistry,
  sanitizeSources,
  buildPrompt,
} = require('./prompt.utils');

const LOCAL_AI_URL = process.env.EVENTHUB_AI_URL || process.env.FINANCIAL_AI_URL || 'http://127.0.0.1:8001';
const LOCAL_AI_TIMEOUT_MS = Number(process.env.EVENTHUB_AI_TIMEOUT_MS || 120000);

function hasAny(items) {
  return Array.isArray(items) && items.length > 0;
}

function formatEventLine(event) {
  const parts = [
    event.title,
    event.start_time ? `thời gian: ${event.start_time}` : null,
    event.venue ? `địa điểm: ${event.venue}` : null,
    event.price_range ? `giá: ${event.price_range}` : null,
  ].filter(Boolean);

  return `- ${parts.join(' | ')}`;
}

function detectIntent(query) {
  const text = String(query || '').toLowerCase();

  if (/(vé|ticket|qr|mã vé|check-in|checkin)/i.test(text)) return 'ticket_order';
  if (/(thanh toán|payment|payos|momo|vnpay|đơn hàng|order)/i.test(text)) return 'payment';
  if (/(sự kiện|event|diễn ra|đề xuất|gợi ý|ở đâu|địa điểm|lịch)/i.test(text)) return 'event_discovery';
  if (/(organizer|ban tổ chức|tạo sự kiện|đăng ký tổ chức)/i.test(text)) return 'organizer';
  if (/(phản hồi|feedback|đánh giá)/i.test(text)) return 'feedback';
  if (/(tài khoản|đăng nhập|mật khẩu|profile|hồ sơ)/i.test(text)) return 'account';

  return 'general_eventhub';
}

function createContextFallbackAnswer(query, context, reason = '') {
  const intent = detectIntent(query);
  const matchedEvents = context.query_matched_events?.items || [];
  const publicEvents = context.public_events?.items || [];
  const upcomingTickets = context.user_context?.upcoming_tickets || [];

  if (intent === 'event_discovery') {
    const events = hasAny(matchedEvents) ? matchedEvents : publicEvents;
    if (hasAny(events)) {
      return {
        output: `Mình tìm thấy một số sự kiện phù hợp trên EventHub:\n${events.slice(0, 5).map(formatEventLine).join('\n')}`,
        meta: {
          intent,
          confidence: 0.78,
          sources: events.slice(0, 5).map((event) => ({ id: event.id })),
          personalization: context.user_context,
          model: 'LOCAL_RULE_BASED_FALLBACK',
          warning: reason,
        },
      };
    }
  }

  if (intent === 'ticket_order') {
    if (hasAny(upcomingTickets)) {
      const lines = upcomingTickets.slice(0, 5).map((ticket) => {
        const title = ticket.event_title || ticket.event?.title || 'Sự kiện';
        const code = ticket.ticket_code ? `mã vé ${ticket.ticket_code}` : 'mã vé chưa có';
        const time = ticket.start_time || ticket.event_start_time || '';
        return `- ${title}${time ? ` | ${time}` : ''} | ${code}`;
      });

      return {
        output: `Bạn đang có vé sắp tới trên EventHub:\n${lines.join('\n')}`,
        meta: {
          intent,
          confidence: 0.78,
          sources: [],
          personalization: context.user_context,
          model: 'LOCAL_RULE_BASED_FALLBACK',
          warning: reason,
        },
      };
    }

    return {
      output: 'Hiện tại mình chưa thấy vé sắp tới trong tài khoản của bạn. Bạn có thể kiểm tra thêm tại mục Vé của tôi.',
      meta: {
        intent,
        confidence: 0.7,
        sources: [],
        personalization: context.user_context,
        model: 'LOCAL_RULE_BASED_FALLBACK',
        warning: reason,
      },
    };
  }

  const staticAnswers = {
    payment:
      'EventHub hỗ trợ thanh toán trực tuyến tùy sự kiện, gồm PayOS, VNPAY hoặc MoMo nếu ban tổ chức cấu hình. Nếu đơn hàng thanh toán thất bại, vé chưa được phát hành và bạn nên tạo đơn mới hoặc liên hệ hỗ trợ kèm mã đơn hàng.',
    organizer:
      'Để đăng ký làm ban tổ chức, bạn gửi yêu cầu tại mục Organizer Request. Sau khi admin duyệt, tài khoản sẽ có quyền truy cập khu vực Organizer để tạo sự kiện, quản lý vé, đơn hàng và check-in.',
    feedback:
      'Sau khi sự kiện kết thúc và bạn có vé hợp lệ, bạn có thể gửi đánh giá tại mục Feedback. Mỗi sự kiện thường chỉ được đánh giá một lần để đảm bảo dữ liệu phản hồi đáng tin cậy.',
    account:
      'Bạn có thể đăng nhập bằng email/mật khẩu hoặc Google. Nếu quên mật khẩu, hãy dùng chức năng Quên mật khẩu để nhận link đặt lại qua email.',
    general_eventhub:
      'Mình có thể hỗ trợ các nội dung trong EventHub như tìm sự kiện, vé, đơn hàng, thanh toán, check-in QR, tài khoản, phản hồi và đăng ký organizer. Bạn có thể hỏi cụ thể hơn để mình kiểm tra theo dữ liệu hệ thống.',
  };

  return {
    output: staticAnswers[intent] || staticAnswers.general_eventhub,
    meta: {
      intent,
      confidence: 0.65,
      sources: [],
      personalization: context.user_context,
      model: 'LOCAL_RULE_BASED_FALLBACK',
      warning: reason,
    },
  };
}

class AgentService {
  async invokeAgent(sessionId, userId, query, options = {}) {
    const context = await systemContextService.build(userId, query);
    const history = normalizeHistory(options.history);
    const allowedSources = buildSourceRegistry(context);
    const prompt = buildPrompt({ query, history, context, sessionId });

    let timeout = null;

    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), LOCAL_AI_TIMEOUT_MS);

      const response = await fetch(`${LOCAL_AI_URL}/generate-chat-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          query,
          history,
          context,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Local AI service returned ${response.status}`);
      }

      const aiResult = await response.json();
      const parsed = aiResult.answer ? aiResult : extractJson(aiResult.raw || aiResult.text);

      if (!parsed?.answer) {
        throw new Error('Local AI service returned an invalid answer');
      }

      return {
        output: String(parsed.answer).trim(),
        meta: {
          intent: parsed.intent || 'general_eventhub',
          confidence: Number(parsed.confidence ?? 0.75),
          sources: sanitizeSources(parsed.sources, allowedSources),
          personalization: context.user_context,
          model: aiResult.model || 'LOCAL_EVENTHUB_AI',
        },
      };
    } catch (error) {
      console.error('Local AI chat error:', error.message);
      return createContextFallbackAnswer(query, context, error.message);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}

module.exports = new AgentService();
