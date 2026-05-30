const ApiResponse = require('../../core/response/ApiResponse');
const eventCategoriesService = require('./eventCategories.service');
const {
  categoryIdSchema,
  createEventCategorySchema,
  updateEventCategorySchema,
} = require('./eventCategories.validation');

class EventCategoriesController {
  list = async (req, res, next) => {
    try {
      const data = await eventCategoriesService.listCategories();
      res.status(200).json(ApiResponse.success(data, 'Event categories fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  create = async (req, res, next) => {
    try {
      const payload = createEventCategorySchema.parse(req.body);
      const data = await eventCategoriesService.createCategory(payload);
      res.status(201).json(ApiResponse.success(data, 'Event category created successfully'));
    } catch (err) {
      next(err);
    }
  };

  update = async (req, res, next) => {
    try {
      const { id } = categoryIdSchema.parse(req.params);
      const payload = updateEventCategorySchema.parse(req.body);
      const data = await eventCategoriesService.updateCategory(id, payload);
      res.status(200).json(ApiResponse.success(data, 'Event category updated successfully'));
    } catch (err) {
      next(err);
    }
  };

  delete = async (req, res, next) => {
    try {
      const { id } = categoryIdSchema.parse(req.params);
      const data = await eventCategoriesService.deleteCategory(id);
      res.status(200).json(ApiResponse.success(data, 'Event category deleted successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new EventCategoriesController();
