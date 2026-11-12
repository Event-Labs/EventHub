const express = require('express');
const adminDevicesController = require('./devices.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, authorize('ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'));

router.get('/', adminDevicesController.list);
router.get('/events', adminDevicesController.listEvents);
router.get('/:id', adminDevicesController.detail);
router.get('/:id/history', adminDevicesController.history);
router.post('/:id/approve', adminDevicesController.approve);
router.patch('/:id', adminDevicesController.update);
router.post('/:id/disable', adminDevicesController.disable);
router.post('/:id/enable', adminDevicesController.enable);
router.post('/:id/revoke', adminDevicesController.revoke);
router.post('/:id/reset-pairing', adminDevicesController.resetPairing);
router.delete('/:id', adminDevicesController.remove);

module.exports = router;

