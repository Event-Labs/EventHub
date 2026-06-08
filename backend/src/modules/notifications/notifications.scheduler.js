const logger = require('../../core/logger');
const notificationsService = require('./notifications.service');

let interval = null;

function startNotificationScheduler() {
  if (interval) return;

  const run = async () => {
    try {
      await notificationsService.sendDueReminders();
    } catch (error) {
      logger.error('Event reminder scheduler failed:', error);
    }
  };

  run();
  interval = setInterval(run, 5 * 60 * 1000);
}

module.exports = {
  startNotificationScheduler,
};
