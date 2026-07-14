const ApiResponse = require('../../core/response/ApiResponse');
const organizersService = require('./organizers.service');
const {
  organizerIdSchema,
  listOrganizersSchema,
  updateOrganizerStatusSchema,
} = require('./organizers.validation');

class AdminOrganizersController {
  list = async (req, res, next) => {
    try {
      const filters = listOrganizersSchema.parse(req.query);
      const offset = (filters.page - 1) * filters.limit;
      const data = await organizersService.listOrganizers({ ...filters, offset });
      res.status(200).json(ApiResponse.success(data, 'Đã tải danh sách organizer.'));
    } catch (err) {
      next(err);
    }
  };

  getDetails = async (req, res, next) => {
    try {
      const { id } = organizerIdSchema.parse(req.params);
      const data = await organizersService.getOrganizerDetails(id);
      res.status(200).json(ApiResponse.success(data, 'Đã tải chi tiết organizer.'));
    } catch (err) {
      next(err);
    }
  };

  updateStatus = async (req, res, next) => {
    try {
      const { id } = organizerIdSchema.parse(req.params);
      const { status } = updateOrganizerStatusSchema.parse(req.body);
      const data = await organizersService.updateOrganizerStatus(id, status);
      res.status(200).json(ApiResponse.success(data, 'Đã cập nhật trạng thái organizer.'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new AdminOrganizersController();
