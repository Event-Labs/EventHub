const express = require('express');
const announcementsController = require('./announcements.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, authorize('ORGANIZER', 'ADMIN'));

router.get('/events', announcementsController.organizerEvents);
router.get('/', announcementsController.list);
router.post('/', announcementsController.send);

module.exports = router;
