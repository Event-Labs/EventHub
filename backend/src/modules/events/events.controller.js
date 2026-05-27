const ApiResponse = require('../../core/response/ApiResponse');
const eventsService = require('./events.service');
const {
  eventIdentifierSchema,
  favoriteEventSchema,
  listEventsSchema,
} = require('./events.validation');

class EventsController {
  getPublicCategories = async (req, res, next) => {
    try {
      const data = await eventsService.getPublicCategories();
      res.status(200).json(ApiResponse.success(data, 'Categories fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  getPublicEvents = async (req, res, next) => {
    try {
      const query = listEventsSchema.parse(req.query);
      const data = await eventsService.getPublicEvents(query, req.user?.sub);
      res.status(200).json(ApiResponse.success(data, 'Events fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  getPublicEventDetail = async (req, res, next) => {
    try {
      const { identifier } = eventIdentifierSchema.parse(req.params);
      const data = await eventsService.getPublicEventDetail(identifier, req.user?.sub);
      res.status(200).json(ApiResponse.success(data, 'Event fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  getFavoriteEvents = async (req, res, next) => {
    try {
      const data = await eventsService.getFavoriteEvents(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Favorite events fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  addFavorite = async (req, res, next) => {
    try {
      const { eventId } = favoriteEventSchema.parse(req.params);
      const data = await eventsService.addFavorite(req.user.sub, eventId);
      res.status(200).json(ApiResponse.success(data, 'Event saved to favorites'));
    } catch (err) {
      next(err);
    }
  };

  removeFavorite = async (req, res, next) => {
    try {
      const { eventId } = favoriteEventSchema.parse(req.params);
      const data = await eventsService.removeFavorite(req.user.sub, eventId);
      res.status(200).json(ApiResponse.success(data, 'Event removed from favorites'));
    } catch (err) {
      next(err);
    }
  };

  toggleFavorite = async (req, res, next) => {
    try {
      const { eventId } = favoriteEventSchema.parse(req.params);
      const data = await eventsService.toggleFavorite(req.user.sub, eventId);
      res.status(200).json(ApiResponse.success(data, 'Favorite status updated'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new EventsController();
