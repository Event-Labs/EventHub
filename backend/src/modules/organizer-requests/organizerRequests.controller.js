const ApiResponse = require('../../core/response/ApiResponse');
const organizerRequestsService = require('./organizerRequests.service');
const {
  listOrganizerRequestsSchema,
  requestIdSchema,
  reviewOrganizerRequestSchema,
  submitOrganizerRequestSchema,
  verifyOrganizerBusinessEmailSchema,
} = require('./organizerRequests.validation');

class OrganizerRequestsController {
  submitMine = async (req, res, next) => {
    try {
      const payload = submitOrganizerRequestSchema.parse(req.body);
      const data = await organizerRequestsService.submitRequest(req.user.sub, payload);
      res.status(201).json(ApiResponse.success(data, 'Organizer request submitted successfully'));
    } catch (err) {
      next(err);
    }
  };

  getMine = async (req, res, next) => {
    try {
      const data = await organizerRequestsService.getMyRequest(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Organizer request fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  verifyBusinessEmail = async (req, res, next) => {
    try {
      const { token } = verifyOrganizerBusinessEmailSchema.parse(req.query);
      await organizerRequestsService.verifyBusinessEmail(token);
      res.status(200).json(ApiResponse.success(null, 'Organization email verified successfully'));
    } catch (err) {
      next(err);
    }
  };

  list = async (req, res, next) => {
    try {
      const filters = listOrganizerRequestsSchema.parse(req.query);
      const data = await organizerRequestsService.listRequests(filters);
      res.status(200).json(ApiResponse.success(data, 'Organizer requests fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  getById = async (req, res, next) => {
    try {
      const { id } = requestIdSchema.parse(req.params);
      const data = await organizerRequestsService.getRequestById(id);
      res.status(200).json(ApiResponse.success(data, 'Organizer request fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  review = async (req, res, next) => {
    try {
      const { id } = requestIdSchema.parse(req.params);
      const payload = reviewOrganizerRequestSchema.parse(req.body);
      const data = await organizerRequestsService.reviewRequest(id, req.user.sub, payload);
      res.status(200).json(ApiResponse.success(data, 'Organizer request reviewed successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new OrganizerRequestsController();
