const ApiResponse = require('../../core/response/ApiResponse');
const eventsService = require('./events.service');
const idempotencyService = require('../../core/security/idempotency.service');
const { getClientIp } = require('../../core/security/ipResolver');
const {
  eventIdentifierSchema,
  favoriteEventSchema,
  listEventsSchema,
  sessionSeatsQuerySchema,
  sessionSeatsSchema,
  seatHoldReleaseSchema,
  seatHoldSchema,
  ticketAvailabilitySchema,
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

  getPublicOrganizers = async (req, res, next) => {
    try {
      const data = await eventsService.getPublicOrganizers();
      res.status(200).json(ApiResponse.success(data, 'Organizers fetched successfully'));
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

  getSessionSeats = async (req, res, next) => {
    try {
      const { sessionId } = sessionSeatsSchema.parse(req.params);
      const query = sessionSeatsQuerySchema.parse(req.query);
      const data = await eventsService.getSessionSeats(sessionId, query);
      res.status(200).json(ApiResponse.success(data, 'Session seats fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  checkTicketAvailability = async (req, res, next) => {
    try {
      const payload = ticketAvailabilitySchema.parse(req.body);
      const data = await eventsService.checkTicketAvailability(payload, req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Ticket availability checked successfully'));
    } catch (err) {
      next(err);
    }
  };

  holdSeats = async (req, res, next) => {
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || null;
    const reqMeta = {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
      deviceId: req.headers['x-device-id'] || req.headers['x-client-fingerprint'] || null,
      captchaToken:
        req.headers['x-turnstile-token'] ||
        req.headers['cf-turnstile-response'] ||
        req.body?.turnstile_token ||
        req.body?.captcha_token ||
        null,
    };

    let idempotencyLock = null;
    try {
      const payload = seatHoldSchema.parse(req.body);

      if (idempotencyKey) {
        idempotencyLock = await idempotencyService.lockOrGetCached(
          idempotencyKey,
          req.user.sub,
          'POST',
          req.path,
          payload,
        );
        if (idempotencyLock && idempotencyLock.isCached) {
          return res.status(idempotencyLock.response.statusCode || 200).json(idempotencyLock.response.data);
        }
      }

      const data = await eventsService.holdSeats(req.user.sub, payload, reqMeta);
      const responseBody = ApiResponse.success(data, 'Seats held successfully');

      if (idempotencyKey) {
        await idempotencyService.saveResponse(
          idempotencyKey,
          idempotencyLock?.requestHash,
          responseBody,
          200,
          idempotencyLock?.lockToken,
        );
      }

      res.status(200).json(responseBody);
    } catch (err) {
      if (idempotencyKey) {
        await idempotencyService.clearLock(idempotencyKey, idempotencyLock?.lockToken);
      }
      next(err);
    }
  };

  getActiveHold = async (req, res, next) => {
    try {
      const { identifier } = req.params;
      const data = await eventsService.getActiveHold(req.user.sub, identifier);
      res.status(200).json(ApiResponse.success(data, 'Active hold retrieved successfully'));
    } catch (err) {
      next(err);
    }
  };

  cancelActiveHold = async (req, res, next) => {
    const reqMeta = {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
      deviceId: req.headers['x-device-id'] || req.headers['x-client-fingerprint'] || null,
    };
    try {
      const { identifier } = req.params;
      const data = await eventsService.cancelActiveHold(req.user.sub, identifier, reqMeta);
      res.status(200).json(ApiResponse.success(data, 'Active hold cancelled successfully'));
    } catch (err) {
      next(err);
    }
  };

  releaseSeatHolds = async (req, res, next) => {
    const reqMeta = {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
      deviceId: req.headers['x-device-id'] || req.headers['x-client-fingerprint'] || null,
    };
    try {
      const payload = seatHoldReleaseSchema.parse(req.body);
      const data = await eventsService.releaseSeatHolds(req.user.sub, payload, reqMeta);
      res.status(200).json(ApiResponse.success(data, 'Seat holds released successfully'));
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

  getOrganizerEvents = async (req, res, next) => {
    try {
      const data = await eventsService.getOrganizerEvents(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Organizer events fetched successfully'));
    } catch (err) {
      next(err);
    }
  };


}

module.exports = new EventsController();


