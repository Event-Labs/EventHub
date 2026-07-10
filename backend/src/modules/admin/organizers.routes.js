const express = require('express');
const organizersController = require('./organizers.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('ADMIN'));

router.get('/', organizersController.list);
router.get('/:id', organizersController.getDetails);
router.patch('/:id/status', organizersController.updateStatus);

module.exports = router;
