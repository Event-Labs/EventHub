const logger = require('../../core/logger');
const eventsListAdminRepository = require('./events.list.repository');

class EventsListAdminService {
  async listEvents({ page, limit, status }) {
    try {
      return await eventsListAdminRepository.findEvents({ page, limit, status });
    } catch (err) {
      // Log the real error before re-throwing so it appears in server logs
      logger.error('[EventsListAdminService] listEvents failed:', err);
      throw err;
    }
  }
}

module.exports = new EventsListAdminService();
