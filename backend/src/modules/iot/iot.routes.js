const express = require('express');
const iotController = require('./iot.controller');
const { requireDeviceAuth } = require('./iot.middleware');
const createRateLimiter = require('../../middlewares/rateLimiter.middleware');

const router = express.Router();

const pairingLimiter = createRateLimiter(
  60 * 1000,
  60,
  'Qua nhieu yeu cau ghep noi tu IP nay, vui long thu lai sau.',
);

const deviceTrafficLimiter = createRateLimiter(
  60 * 1000,
  300,
  'Qua nhieu yeu cau tu thiet bi, vui long giam tan suat.',
);

router.post('/devices/register', pairingLimiter, iotController.register);
router.get('/devices/pairing-status', pairingLimiter, iotController.pairingStatus);

router.post('/devices/heartbeat', deviceTrafficLimiter, requireDeviceAuth, iotController.heartbeat);
router.post('/tickets/scan', deviceTrafficLimiter, requireDeviceAuth, iotController.scanTicket);

module.exports = router;

