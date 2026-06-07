const express = require('express');
const notificationsController = require('./notifications.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get('/stream', notificationsController.stream);
router.get('/', protect, notificationsController.list);
router.get('/unread-count', protect, notificationsController.unreadCount);
router.patch('/read-all', protect, notificationsController.markAllRead);
router.patch('/:notificationId/read', protect, notificationsController.markRead);

router.get('/organizer/events', protect, authorize('ORGANIZER', 'ADMIN'), notificationsController.organizerEvents);
router.get('/organizer/announcements', protect, authorize('ORGANIZER', 'ADMIN'), notificationsController.organizerAnnouncements);
router.post('/organizer/announcements', protect, authorize('ORGANIZER', 'ADMIN'), notificationsController.sendAnnouncement);

module.exports = router;
