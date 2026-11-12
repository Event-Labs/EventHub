const iotRepository = require('./iot.repository');
const { isUuid, sha256Hex, timingSafeEqualHex } = require('./iot.utils');

async function requireDeviceAuth(req, res, next) {
  try {
    const deviceId = req.get('X-Device-Id')?.trim();
    const deviceSecret = req.get('X-Device-Secret')?.trim();

    if (!deviceId || !deviceSecret || !isUuid(deviceId)) {
      return res.status(401).json({
        success: false,
        result: 'UNAUTHORIZED',
        message: 'Thieu hoac sai thong tin xac thuc thiet bi',
      });
    }

    const device = await iotRepository.findById(deviceId);
    if (!device) {
      return res.status(401).json({
        success: false,
        result: 'UNAUTHORIZED',
        message: 'Thiet bi khong ton tai',
      });
    }

    if (device.status === 'DISABLED' || device.status === 'REVOKED') {
      return res.status(403).json({
        success: false,
        result: 'DEVICE_DISABLED',
        message: 'Thiet bi da bi khoa boi Admin',
      });
    }

    if (device.status !== 'ACTIVE' || !device.secret_hash) {
      return res.status(401).json({
        success: false,
        result: 'UNAUTHORIZED',
        message: 'Thiet bi chua duoc kich hoat',
      });
    }

    const incomingHash = sha256Hex(deviceSecret);
    if (!timingSafeEqualHex(incomingHash, device.secret_hash)) {
      return res.status(401).json({
        success: false,
        result: 'UNAUTHORIZED',
        message: 'Sai secret xac thuc thiet bi',
      });
    }

    req.device = device;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireDeviceAuth };

