const express = require('express');
const waitingRoomController = require('./waitingRoom.controller');
const optionalAuth = require('../../middlewares/optionalAuth.middleware');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router({ mergeParams: true });

// Customer Queue Endpoints
router.post('/join', optionalAuth, waitingRoomController.join);
router.get('/status', optionalAuth, waitingRoomController.status);
router.post('/leave', optionalAuth, waitingRoomController.leave);
router.get('/admission', optionalAuth, waitingRoomController.admission);
router.get('/stream', optionalAuth, waitingRoomController.stream);

// Admin / Organizer Queue Management Endpoints
router.get(
  '/admin/stats',
  protect,
  authorize('ADMIN', 'SUPER_ADMIN', 'ORGANIZER'),
  waitingRoomController.getAdminStats
);
router.put(
  '/admin/config',
  protect,
  authorize('ADMIN', 'SUPER_ADMIN', 'ORGANIZER'),
  waitingRoomController.updateConfig
);
router.post(
  '/admin/pause',
  protect,
  authorize('ADMIN', 'SUPER_ADMIN', 'ORGANIZER'),
  waitingRoomController.pauseQueue
);
router.post(
  '/admin/resume',
  protect,
  authorize('ADMIN', 'SUPER_ADMIN', 'ORGANIZER'),
  waitingRoomController.resumeQueue
);

module.exports = router;

