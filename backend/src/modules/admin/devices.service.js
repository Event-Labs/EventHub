const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const adminDevicesRepository = require('./devices.repository');
const {
  DEVICE_ONLINE_THRESHOLD_SEC,
  PENDING_SECRET_TTL_MINUTES,
  generateRandomToken,
  sha256Hex,
} = require('../iot/iot.utils');

class AdminDevicesService {
  async listDevices(filters) {
    const [items, stats] = await Promise.all([
      adminDevicesRepository.listDevices(filters),
      adminDevicesRepository.getStats(),
    ]);

    return {
      items,
      stats,
    };
  }

  async listAssignableEvents() {
    return adminDevicesRepository.listAssignableEvents();
  }

  async getDeviceDetail(id) {
    const device = await adminDevicesRepository.findById(id);
    if (!device) {
      throw new AppError('Không tìm thấy thiết bị check-in.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const recentCheckIns = await adminDevicesRepository.getRecentCheckIns(id, 20);
    return {
      device,
      recent_checkins: recentCheckIns,
    };
  }

  async assertEventAssignable(eventId) {
    if (!eventId) return null;
    const event = await adminDevicesRepository.findAssignableEventById(eventId);
    if (!event) {
      throw new AppError('Sự kiện được chọn không tồn tại hoặc đã bị xóa.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    if (!['PUBLISHED', 'COMPLETED'].includes(event.status) || (event.status === 'COMPLETED' && event.approval_status !== 'APPROVED')) {
      throw new AppError('Chỉ có thể gán thiết bị cho sự kiện đã được duyệt và xuất bản.', 400, ErrorCodes.INVALID_INPUT);
    }
    return event;
  }

  async approveDevice(id, adminUserId, payload) {
    const rawDevice = await adminDevicesRepository.findRawById(id);
    if (!rawDevice) {
      throw new AppError('Không tìm thấy thiết bị check-in.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (rawDevice.status !== 'PENDING') {
      throw new AppError('Chỉ có thể duyệt thiết bị đang ở trạng thái chờ ghép nối (PENDING).', 400, ErrorCodes.INVALID_INPUT);
    }

    if (!rawDevice.claim_token_hash) {
      throw new AppError('Thiết bị chưa có phiên ghép nối hợp lệ. Vui lòng khởi động lại thiết bị để đăng ký.', 400, ErrorCodes.INVALID_INPUT);
    }

    if (rawDevice.pairing_expires_at && new Date(rawDevice.pairing_expires_at).getTime() <= Date.now()) {
      throw new AppError('Mã ghép nối của thiết bị đã hết hạn. Vui lòng yêu cầu thiết bị đăng ký lại.', 400, ErrorCodes.INVALID_INPUT);
    }

    if (payload.assigned_event_id) {
      await this.assertEventAssignable(payload.assigned_event_id);
    }

    const deviceSecret = generateRandomToken(32);
    const secretHash = sha256Hex(deviceSecret);
    const pendingSecretExpiresAt = new Date(Date.now() + PENDING_SECRET_TTL_MINUTES * 60 * 1000);

    return adminDevicesRepository.approveDevice(id, {
      name: payload.name,
      assignedEventId: payload.assigned_event_id || null,
      autoConfirm: Boolean(payload.auto_confirm),
      secretHash,
      pendingSecretPlain: deviceSecret,
      pendingSecretExpiresAt,
      approvedBy: adminUserId,
    });
  }

  async updateDevice(id, payload) {
    const rawDevice = await adminDevicesRepository.findRawById(id);
    if (!rawDevice) {
      throw new AppError('Không tìm thấy thiết bị check-in.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (rawDevice.status === 'REVOKED') {
      throw new AppError('Thiết bị đã bị thu hồi quyền, không thể cập nhật cấu hình.', 400, ErrorCodes.INVALID_INPUT);
    }

    if (payload.assigned_event_id) {
      await this.assertEventAssignable(payload.assigned_event_id);
    }

    return adminDevicesRepository.updateDeviceConfig(id, {
      name: payload.name,
      assignedEventId: payload.assigned_event_id,
      autoConfirm: payload.auto_confirm,
    });
  }

  async disableDevice(id) {
    const rawDevice = await adminDevicesRepository.findRawById(id);
    if (!rawDevice) {
      throw new AppError('Không tìm thấy thiết bị check-in.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (rawDevice.status !== 'ACTIVE') {
      throw new AppError('Chỉ có thể khóa thiết bị đang hoạt động.', 400, ErrorCodes.INVALID_INPUT);
    }

    return adminDevicesRepository.disableDevice(id);
  }

  async enableDevice(id) {
    const rawDevice = await adminDevicesRepository.findRawById(id);
    if (!rawDevice) {
      throw new AppError('Không tìm thấy thiết bị check-in.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (rawDevice.status !== 'DISABLED') {
      throw new AppError('Chỉ có thể mở khóa thiết bị đang bị khóa (DISABLED).', 400, ErrorCodes.INVALID_INPUT);
    }

    if (!rawDevice.secret_hash) {
      throw new AppError('Thiết bị chưa có khóa xác thực hợp lệ, vui lòng yêu cầu ghép nối lại.', 400, ErrorCodes.INVALID_INPUT);
    }

    return adminDevicesRepository.enableDevice(id);
  }

  async revokeDevice(id) {
    const rawDevice = await adminDevicesRepository.findRawById(id);
    if (!rawDevice) {
      throw new AppError('Không tìm thấy thiết bị check-in.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (rawDevice.status === 'REVOKED') {
      throw new AppError('Thiết bị đã bị thu hồi quyền trước đó.', 400, ErrorCodes.INVALID_INPUT);
    }

    return adminDevicesRepository.revokeDevice(id);
  }

  async resetDevicePairing(id) {
    const rawDevice = await adminDevicesRepository.findRawById(id);
    if (!rawDevice) {
      throw new AppError('Không tìm thấy thiết bị check-in.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    return adminDevicesRepository.resetDevicePairing(id);
  }

  async deleteDevice(id) {
    const rawDevice = await adminDevicesRepository.findRawById(id);
    if (!rawDevice) {
      throw new AppError('Không tìm thấy thiết bị check-in.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (!['PENDING', 'REVOKED'].includes(rawDevice.status)) {
      throw new AppError('Vui lòng thu hồi quyền thiết bị trước khi xóa.', 400, ErrorCodes.INVALID_INPUT);
    }

    await adminDevicesRepository.deleteDevice(id);
    return { id, deleted: true };
  }
}

module.exports = new AdminDevicesService();

