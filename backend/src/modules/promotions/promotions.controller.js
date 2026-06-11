const ApiResponse = require('../../core/response/ApiResponse');
const promotionsService = require('./promotions.service');
const { promoCodeSchema, updatePromoCodeSchema, listPromosQuerySchema } = require('./promotions.validation');

class PromotionsController {
  getPromos = async (req, res, next) => {
    try {
      const query = listPromosQuerySchema.parse(req.query);
      const data = await promotionsService.getAllPromos(req.user.sub, query);
      res.status(200).json(ApiResponse.success(data, 'Promotions fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  getPromoDetail = async (req, res, next) => {
    try {
      const { id } = req.params;
      const data = await promotionsService.getPromoById(id, req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Promotion detail fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  createPromo = async (req, res, next) => {
    try {
      const body = promoCodeSchema.parse(req.body);
      const data = await promotionsService.createPromo(body, req.user.sub);
      res.status(201).json(ApiResponse.success(data, 'Promotion created successfully'));
    } catch (err) {
      next(err);
    }
  };

  updatePromo = async (req, res, next) => {
    try {
      const { id } = req.params;
      const body = updatePromoCodeSchema.parse(req.body);
      const data = await promotionsService.updatePromo(id, body, req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Promotion updated successfully'));
    } catch (err) {
      next(err);
    }
  };

  deactivatePromo = async (req, res, next) => {
    try {
      const { id } = req.params;
      const data = await promotionsService.deactivatePromo(id, req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Promotion deactivated successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new PromotionsController();
