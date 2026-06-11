const ApiResponse = require('../../core/response/ApiResponse');
const venuesService = require('./venues.service');

class VenuesController {
  listVenues = async (req, res, next) => {
    try {
      const data = await venuesService.listVenues(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Venues fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  getVenue = async (req, res, next) => {
    try {
      const data = await venuesService.getVenue(req.user.sub, req.params.venueId);
      res.status(200).json(ApiResponse.success(data, 'Venue fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  createVenue = async (req, res, next) => {
    try {
      const data = await venuesService.createVenue(req.user.sub, req.body);
      res.status(201).json(ApiResponse.success(data, 'Venue created successfully'));
    } catch (err) {
      next(err);
    }
  };

  updateVenue = async (req, res, next) => {
    try {
      const data = await venuesService.updateVenue(req.user.sub, req.params.venueId, req.body);
      res.status(200).json(ApiResponse.success(data, 'Venue updated successfully'));
    } catch (err) {
      next(err);
    }
  };

  deleteVenue = async (req, res, next) => {
    try {
      const data = await venuesService.deleteVenue(req.user.sub, req.params.venueId);
      res.status(200).json(ApiResponse.success(data, 'Venue deleted successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new VenuesController();
