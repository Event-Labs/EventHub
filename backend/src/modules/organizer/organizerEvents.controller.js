const ApiResponse = require('../../core/response/ApiResponse');
const organizerEventsService = require('./organizerEvents.service');

class OrganizerEventsController {
  getMe = async (req, res, next) => {
    try {
      const data = await organizerEventsService.getActiveOrganizerProfile(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Organizer profile fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  getVenues = async (req, res, next) => {
    try {
      const data = await organizerEventsService.getVenues(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Venues fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  listEvents = async (req, res, next) => {
    try {
      const data = await organizerEventsService.listEvents(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Events fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  getEvent = async (req, res, next) => {
    try {
      const data = await organizerEventsService.getEvent(req.user.sub, req.params.eventId);
      res.status(200).json(ApiResponse.success(data, 'Event fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  createEvent = async (req, res, next) => {
    try {
      const data = await organizerEventsService.createEvent(req.user.sub, req.body);
      res.status(201).json(ApiResponse.success(data, 'Event created successfully'));
    } catch (err) {
      next(err);
    }
  };

  updateEvent = async (req, res, next) => {
    try {
      const data = await organizerEventsService.updateEvent(req.user.sub, req.params.eventId, req.body);
      res.status(200).json(ApiResponse.success(data, 'Event updated successfully'));
    } catch (err) {
      next(err);
    }
  };

  submitEvent = async (req, res, next) => {
    try {
      const data = await organizerEventsService.submitEvent(req.user.sub, req.params.eventId);
      res.status(200).json(ApiResponse.success(data, 'Event submitted for review'));
    } catch (err) {
      next(err);
    }
  };

  publishEvent = async (req, res, next) => {
    try {
      const data = await organizerEventsService.publishEvent(req.user.sub, req.params.eventId);
      res.status(200).json(ApiResponse.success(data, 'Event published successfully'));
    } catch (err) {
      next(err);
    }
  };

  cancelEvent = async (req, res, next) => {
    try {
      const data = await organizerEventsService.cancelEvent(req.user.sub, req.params.eventId);
      res.status(200).json(ApiResponse.success(data, 'Event cancelled successfully'));
    } catch (err) {
      next(err);
    }
  };

  addSession = async (req, res, next) => {
    try {
      const data = await organizerEventsService.addSession(req.user.sub, req.params.eventId, req.body);
      res.status(201).json(ApiResponse.success(data, 'Session created successfully'));
    } catch (err) {
      next(err);
    }
  };

  updateSession = async (req, res, next) => {
    try {
      const data = await organizerEventsService.updateSession(
        req.user.sub,
        req.params.eventId,
        req.params.id,
        req.body,
      );
      res.status(200).json(ApiResponse.success(data, 'Session updated successfully'));
    } catch (err) {
      next(err);
    }
  };

  deleteSession = async (req, res, next) => {
    try {
      const data = await organizerEventsService.deleteSession(
        req.user.sub,
        req.params.eventId,
        req.params.id,
      );
      res.status(200).json(ApiResponse.success(data, 'Session deleted successfully'));
    } catch (err) {
      next(err);
    }
  };

  addTicketType = async (req, res, next) => {
    try {
      const data = await organizerEventsService.addTicketType(
        req.user.sub,
        req.params.eventId,
        req.params.id,
        req.body,
      );
      res.status(201).json(ApiResponse.success(data, 'Ticket type created successfully'));
    } catch (err) {
      next(err);
    }
  };

  updateTicketType = async (req, res, next) => {
    try {
      const data = await organizerEventsService.updateTicketType(
        req.user.sub,
        req.params.eventId,
        req.params.id,
        req.params.ttId,
        req.body,
      );
      res.status(200).json(ApiResponse.success(data, 'Ticket type updated successfully'));
    } catch (err) {
      next(err);
    }
  };

  deleteTicketType = async (req, res, next) => {
    try {
      const data = await organizerEventsService.deleteTicketType(
        req.user.sub,
        req.params.eventId,
        req.params.id,
        req.params.ttId,
      );
      res.status(200).json(ApiResponse.success(data, 'Ticket type deleted successfully'));
    } catch (err) {
      next(err);
    }
  };

  assignZoneTicketTypes = async (req, res, next) => {
    try {
      const data = await organizerEventsService.assignZoneTicketTypes(
        req.user.sub,
        req.params.eventId,
        req.params.id,
        req.body,
      );
      res.status(200).json(ApiResponse.success(data, 'Zone assignments saved successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new OrganizerEventsController();
