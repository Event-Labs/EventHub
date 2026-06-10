const ApiResponse = require('../../core/response/ApiResponse');
const userService = require('./users.service');
const { userIdSchema, lockUserSchema, listUsersSchema } = require('./users.validation');

class UsersController {
  list = async (req, res, next) => {
    try {
      const filters = listUsersSchema.parse(req.query);
      const offset = (filters.page - 1) * filters.limit;
      const data = await userService.listUsers({ ...filters, offset });
      res.status(200).json(ApiResponse.success(data, 'Users fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  getDetails = async (req, res, next) => {
    try {
      const { id } = userIdSchema.parse(req.params);
      const data = await userService.getUserDetails(id);
      res.status(200).json(ApiResponse.success(data, 'User details fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  lock = async (req, res, next) => {
    try {
      const { id } = userIdSchema.parse(req.params);
      const payload = lockUserSchema.parse(req.body);
      const adminId = req.user.sub;
      const data = await userService.lockUser(id, { ...payload, adminId });
      res.status(200).json(ApiResponse.success(data, 'User locked successfully'));
    } catch (err) {
      next(err);
    }
  };

  unlock = async (req, res, next) => {
    try {
      const { id } = userIdSchema.parse(req.params);
      const data = await userService.unlockUser(id);
      res.status(200).json(ApiResponse.success(data, 'User unlocked successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new UsersController();
