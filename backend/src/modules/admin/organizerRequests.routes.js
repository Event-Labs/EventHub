const express = require('express');
const organizerRequestsController = require('../organizer-requests/organizerRequests.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, authorize('ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'));

router.get('/', organizerRequestsController.list);
router.get('/:id', organizerRequestsController.getById);
router.patch('/:id/review', organizerRequestsController.review);

module.exports = router;
