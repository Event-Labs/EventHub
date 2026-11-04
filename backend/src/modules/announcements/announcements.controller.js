const ApiResponse = require('../../core/response/ApiResponse');
const notificationsService = require('../notifications/notifications.service');
const { createAnnouncementSchema } = require('../notifications/notifications.validation');

class AnnouncementsController {
  organizerEvents = async (req, res, next) => {
    try {
      const data = await notificationsService.listOrganizerEvents(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Organizer events fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  list = async (req, res, next) => {
    try {
      const data = await notificationsService.listAnnouncements(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Announcements fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  send = async (req, res, next) => {
    try {
      console.log('[AnnouncementsController.send] Incoming body:', JSON.stringify(req.body));
      const payload = createAnnouncementSchema.parse(req.body);
      const data = await notificationsService.sendAnnouncement(req.user.sub, payload);
      res.status(201).json(ApiResponse.success(data, 'Announcement sent successfully'));
    } catch (error) {
      console.error('[AnnouncementsController.send] Error:', error);
      next(error);
    }
  };
}

module.exports = new AnnouncementsController();
