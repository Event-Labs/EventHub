const express = require('express');
const subscriptionsController = require('./subscriptions.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Organizers can view available plans (read-only)
router.get(
  '/',
  protect,
  authorize('ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin', 'ORGANIZER', 'organizer'),
  subscriptionsController.list,
);

// Admin-only mutations
router.use(protect, authorize('ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'));
router.post('/', subscriptionsController.create);
router.patch('/:id', subscriptionsController.update);
router.delete('/:id', subscriptionsController.delete);

module.exports = router;
