const jwt = require('jsonwebtoken');
const ApiResponse = require('../../core/response/ApiResponse');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const notificationsService = require('./notifications.service');
const notificationStream = require('./notifications.stream');
const {
  createAnnouncementSchema,
  listNotificationsSchema,
  notificationIdSchema,
} = require('./notifications.validation');

class NotificationsController {
  list = async (req, res, next) => {
    try {
      const query = listNotificationsSchema.parse(req.query);
      const data = await notificationsService.list(req.user.sub, query);
      res.status(200).json(ApiResponse.success(data, 'Notifications fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  unreadCount = async (req, res, next) => {
    try {
      const data = await notificationsService.unreadCount(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Unread count fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  markRead = async (req, res, next) => {
    try {
      const { notificationId } = notificationIdSchema.parse(req.params);
      const data = await notificationsService.markRead(req.user.sub, notificationId);
      res.status(200).json(ApiResponse.success(data, 'Notification marked as read'));
    } catch (error) {
      next(error);
    }
  };

  markAllRead = async (req, res, next) => {
    try {
      const data = await notificationsService.markAllRead(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Notifications marked as read'));
    } catch (error) {
      next(error);
    }
  };

  stream = async (req, res, next) => {
    try {
      const token = req.query.token;
      if (!token) {
        throw new AppError('Not authorized to access this route', 401, ErrorCodes.AUTH_REQUIRED);
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('event: connected\ndata: {}\n\n');
      notificationStream.addClient(decoded.sub, res);
    } catch (error) {
      next(error);
    }
  };

  organizerEvents = async (req, res, next) => {
    try {
      const data = await notificationsService.listOrganizerEvents(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Organizer events fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  organizerAnnouncements = async (req, res, next) => {
    try {
      const data = await notificationsService.listAnnouncements(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Announcements fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  sendAnnouncement = async (req, res, next) => {
    try {
      const payload = createAnnouncementSchema.parse(req.body);
      const data = await notificationsService.sendAnnouncement(req.user.sub, payload);
      res.status(201).json(ApiResponse.success(data, 'Announcement sent successfully'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new NotificationsController();
