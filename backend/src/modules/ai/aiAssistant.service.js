const ollamaClient = require('../../infrastructure/ai/ollama.client');
const eventsService = require('../events/events.service');
const logger = require('../../core/logger');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'searchEvents',
      description: 'Tìm kiếm các sự kiện công khai trên hệ thống dựa vào từ khóa, ví dụ tìm kiếm nhạc hội, hội thảo.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khóa tìm kiếm sự kiện' },
          limit: { type: 'integer', description: 'Số lượng kết quả trả về' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getEventDetails',
      description: 'Lấy thông tin chi tiết của một sự kiện, bao gồm hạng vé, giá vé, và số lượng vé còn lại.',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: 'ID hoặc slug của sự kiện cần xem' }
        },
        required: ['identifier']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'getRefundPolicy',
      description: 'Lấy thông tin chính sách hoàn tiền vé của hệ thống EventHub.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
];

const SYSTEM_PROMPT = `Bạn là Trợ lý AI của EventHub - nền tảng quản lý sự kiện và bán vé.
Nhiệm vụ của bạn là hỗ trợ khách hàng tìm kiếm sự kiện, xem giá vé, đặt vé, và tư vấn hoàn tiền.
Bạn CÓ THỂ GỌI HÀM (Tool Calling) để lấy dữ liệu thực tế từ hệ thống trước khi trả lời người dùng.
- Hãy xưng hô lịch sự, thân thiện và bằng tiếng Việt.
- Nếu không có dữ liệu, hãy xin lỗi và báo không tìm thấy.
- Chỉ cung cấp thông tin dựa trên kết quả trả về từ hàm, không tự bịa đặt sự kiện hoặc giá vé.
`;

class AiAssistantService {
  async executeTool(userId, name, args) {
    try {
      if (name === 'searchEvents') {
        const result = await eventsService.getPublicEvents({
          keyword: args.query,
          limit: args.limit || 5,
          page: 1,
        }, userId);
        return result.items.map(e => ({
          id: e.id,
          title: e.title,
          slug: e.slug,
          location: e.venue?.summary,
          start_time: e.start_time,
          min_price: e.min_price,
          max_price: e.max_price
        }));
      }
      
      if (name === 'getEventDetails') {
        const result = await eventsService.getPublicEventDetail(args.identifier, userId);
        return {
          id: result.id,
          title: result.title,
          slug: result.slug,
          ticket_types: result.ticket_types.map(t => ({
            name: t.name,
            price: t.price,
            available_quantity: t.available_quantity
          }))
        };
      }
      if (name === 'getRefundPolicy') {
        return {
          policy: 'Khách hàng có thể yêu cầu hoàn tiền vé chậm nhất 72 giờ trước khi sự kiện bắt đầu. Phí hoàn vé là 10% giá vé. Tiền sẽ được hoàn về tài khoản ngân hàng trong vòng 5-7 ngày làm việc.'
        };
      }

      return { error: 'Function not found' };
    } catch (err) {
      logger.error(`[AiAssistant] Tool error for ${name}: ${err.message}`);
      return { error: 'Failed to execute tool', details: err.message };
    }
  }

  async chat(userId, message, history = []) {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message }
    ];

    let response = await ollamaClient.chat(messages, { tools: TOOLS });

    // Handle tool calls
    if (response.tool_calls && response.tool_calls.length > 0) {
      // For Ollama tool calling, we must append the assistant's message containing tool_calls
      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls
      });

      for (const call of response.tool_calls) {
        const args = call.function.arguments;
        const result = await this.executeTool(userId, call.function.name, args);
        
        // Append the tool response
        messages.push({
          role: 'tool',
          name: call.function.name,
          content: JSON.stringify(result)
        });
      }

      // 2nd pass: generate final response based on tool outputs
      response = await ollamaClient.chat(messages, { tools: TOOLS });
    }

    return {
      role: 'assistant',
      content: response.content
    };
  }
}

module.exports = new AiAssistantService();
