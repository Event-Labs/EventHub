const iotService = require('./iot.service');
const {
  registerDeviceSchema,
  pairingStatusQuerySchema,
  heartbeatSchema,
  scanTicketSchema,
  deviceHistoryQuerySchema,
} = require('./iot.validation');
const { extractClientIp } = require('./iot.utils');

function handleIotError(err, res) {
  if (err?.name === 'ZodError') {
    const firstIssue = err.issues?.[0];
    return res.status(400).json({
      success: false,
      result: 'VALIDATION_ERROR',
      message: firstIssue?.message || 'Du lieu gui len khong hop le',
    });
  }

  return res.status(500).json({
    success: false,
    result: 'INTERNAL_ERROR',
    message: 'Loi he thong',
  });
}

class IotController {
  register = async (req, res) => {
    try {
      const payload = registerDeviceSchema.parse(req.body || {});
      const { httpStatus, body } = await iotService.registerDevice(payload, extractClientIp(req));
      return res.status(httpStatus).json(body);
    } catch (err) {
      return handleIotError(err, res);
    }
  };

  pairingStatus = async (req, res) => {
    try {
      const macInput = req.query?.mac_address || req.get('X-Mac-Address') || '';
      const query = pairingStatusQuerySchema.parse({ mac_address: macInput });
      const claimToken = req.get('X-Claim-Token')?.trim() || '';
      const { httpStatus, body } = await iotService.getPairingStatus({
        macAddress: query.mac_address,
        claimToken,
        clientIp: extractClientIp(req),
      });
      return res.status(httpStatus).json(body);
    } catch (err) {
      return handleIotError(err, res);
    }
  };

  heartbeat = async (req, res) => {
    try {
      const payload = heartbeatSchema.parse(req.body || {});
      const { httpStatus, body } = await iotService.recordHeartbeat(req.device, payload, extractClientIp(req));
      return res.status(httpStatus).json(body);
    } catch (err) {
      return handleIotError(err, res);
    }
  };

  scanTicket = async (req, res) => {
    try {
      const payload = scanTicketSchema.parse(req.body || {});
      const { httpStatus, body } = await iotService.scanTicket(req.device, payload);
      return res.status(httpStatus).json(body);
    } catch (err) {
      return handleIotError(err, res);
    }
  };

  history = async (req, res) => {
    try {
      const query = deviceHistoryQuerySchema.parse(req.query || {});
      const { httpStatus, body } = await iotService.getDeviceHistory(req.device, query);
      return res.status(httpStatus).json(body);
    } catch (err) {
      return handleIotError(err, res);
    }
  };
}

module.exports = new IotController();

