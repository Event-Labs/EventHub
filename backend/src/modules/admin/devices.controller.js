const ApiResponse = require('../../core/response/ApiResponse');
const adminDevicesService = require('./devices.service');
const {
  deviceIdParamSchema,
  listDevicesQuerySchema,
  approveDeviceSchema,
  updateDeviceSchema,
} = require('./devices.validation');

class AdminDevicesController {
  list = async (req, res, next) => {
    try {
      const filters = listDevicesQuerySchema.parse(req.query);
      const data = await adminDevicesService.listDevices({
        status: filters.status,
        online: filters.online,
        eventId: filters.event_id || '',
        search: filters.search,
      });
      res.status(200).json(ApiResponse.success(data, 'Lấy danh sách thiết bị check-in thành công'));
    } catch (err) {
      next(err);
    }
  };

  listEvents = async (req, res, next) => {
    try {
      const data = await adminDevicesService.listAssignableEvents();
      res.status(200).json(ApiResponse.success(data, 'Lấy danh sách sự kiện khả dụng thành công'));
    } catch (err) {
      next(err);
    }
  };

  detail = async (req, res, next) => {
    try {
      const { id } = deviceIdParamSchema.parse(req.params);
      const data = await adminDevicesService.getDeviceDetail(id);
      res.status(200).json(ApiResponse.success(data, 'Lấy chi tiết thiết bị thành công'));
    } catch (err) {
      next(err);
    }
  };

  approve = async (req, res, next) => {
    try {
      const { id } = deviceIdParamSchema.parse(req.params);
      const payload = approveDeviceSchema.parse(req.body);
      const data = await adminDevicesService.approveDevice(id, req.user.sub, payload);
      res.status(200).json(ApiResponse.success(data, 'Duyệt thiết bị check-in thành công'));
    } catch (err) {
      next(err);
    }
  };

  update = async (req, res, next) => {
    try {
      const { id } = deviceIdParamSchema.parse(req.params);
      const payload = updateDeviceSchema.parse(req.body);
      const data = await adminDevicesService.updateDevice(id, payload);
      res.status(200).json(ApiResponse.success(data, 'Cập nhật cấu hình thiết bị thành công'));
    } catch (err) {
      next(err);
    }
  };

  disable = async (req, res, next) => {
    try {
      const { id } = deviceIdParamSchema.parse(req.params);
      const data = await adminDevicesService.disableDevice(id);
      res.status(200).json(ApiResponse.success(data, 'Đã khóa thiết bị check-in'));
    } catch (err) {
      next(err);
    }
  };

  enable = async (req, res, next) => {
    try {
      const { id } = deviceIdParamSchema.parse(req.params);
      const data = await adminDevicesService.enableDevice(id);
      res.status(200).json(ApiResponse.success(data, 'Đã mở khóa thiết bị check-in'));
    } catch (err) {
      next(err);
    }
  };

  revoke = async (req, res, next) => {
    try {
      const { id } = deviceIdParamSchema.parse(req.params);
      const data = await adminDevicesService.revokeDevice(id);
      res.status(200).json(ApiResponse.success(data, 'Đã thu hồi quyền thiết bị check-in'));
    } catch (err) {
      next(err);
    }
  };

  resetPairing = async (req, res, next) => {
    try {
      const { id } = deviceIdParamSchema.parse(req.params);
      const data = await adminDevicesService.resetDevicePairing(id);
      res.status(200).json(ApiResponse.success(data, 'Đã đặt lại trạng thái ghép nối cho thiết bị'));
    } catch (err) {
      next(err);
    }
  };

  remove = async (req, res, next) => {
    try {
      const { id } = deviceIdParamSchema.parse(req.params);
      const data = await adminDevicesService.deleteDevice(id);
      res.status(200).json(ApiResponse.success(data, 'Đã xóa thiết bị check-in'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new AdminDevicesController();

