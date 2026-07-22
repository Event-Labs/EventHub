const ApiResponse = require('../../core/response/ApiResponse');
const seatMapsService = require('./seatMaps.service');

class SeatMapsController {
  listByVenue = async (req, res, next) => {
    try {
      const data = await seatMapsService.listByVenue(req.user.sub, req.params.venueId);
      res.status(200).json(ApiResponse.success(data, 'Seat maps fetched successfully'));
    } catch (err) {
      console.error('[SeatMapsController.listByVenue Error]:', err);
      next(err);
    }
  };

  create = async (req, res, next) => {
    try {
      const data = await seatMapsService.createSeatMap(req.user.sub, req.params.venueId, req.body);
      res.status(201).json(ApiResponse.success(data, 'Seat map created successfully'));
    } catch (err) {
      console.error('[SeatMapsController.create Error]:', err);
      next(err);
    }
  };

  getSeatMap = async (req, res, next) => {
    try {
      const data = await seatMapsService.getSeatMap(req.user.sub, req.params.seatMapId);
      res.status(200).json(ApiResponse.success(data, 'Seat map fetched successfully'));
    } catch (err) {
      console.error('[SeatMapsController.getSeatMap Error]:', err);
      next(err);
    }
  };

  updateSeatMap = async (req, res, next) => {
    try {
      const data = await seatMapsService.updateSeatMap(req.user.sub, req.params.seatMapId, req.body);
      res.status(200).json(ApiResponse.success(data, 'Seat map updated successfully'));
    } catch (err) {
      console.error('[SeatMapsController.updateSeatMap Error]:', err);
      next(err);
    }
  };

  deleteSeatMap = async (req, res, next) => {
    try {
      const data = await seatMapsService.deleteSeatMap(req.user.sub, req.params.seatMapId);
      res.status(200).json(ApiResponse.success(data, 'Seat map deleted successfully'));
    } catch (err) {
      console.error('[SeatMapsController.deleteSeatMap Error]:', err);
      next(err);
    }
  };
}

module.exports = new SeatMapsController();
