const express = require('express');
const subscriptionsController = require('./subscriptions.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, authorize('ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'));

router.get('/', subscriptionsController.list);
router.post('/', subscriptionsController.create);
router.patch('/:id', subscriptionsController.update);
router.delete('/:id', subscriptionsController.delete);

module.exports = router;
