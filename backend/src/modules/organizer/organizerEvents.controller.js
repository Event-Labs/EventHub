const ApiResponse = require('../../core/response/ApiResponse');
const organizerEventsService = require('./organizerEvents.service');
const organizerEventsRepository = require('./organizerEvents.repository');
const eventBusinessRulesService = require('../events/eventBusinessRules.service');
const aiDocumentParserService = require('./aiDocumentParser.service');
const logger = require('../../core/logger');

class OrganizerEventsController {
  getMe = async (req, res, next) => {
    try {
      const data = await organizerEventsService.getOrganizerProfileForView(
        req.user.sub,
        req.get('x-organizer-sensitive-token'),
      );
      res.status(200).json(ApiResponse.success(data, 'Organizer profile fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  updateMe = async (req, res, next) => {
    try {
      const data = await organizerEventsService.updateActiveOrganizerProfile(
        req.user.sub,
        req.body,
        req.get('x-organizer-sensitive-token'),
      );
      res.status(200).json(ApiResponse.success(data, 'Organizer profile updated successfully'));
    } catch (err) {
      next(err);
    }
  };

  startSensitiveAccess = async (req, res, next) => {
    try {
      const data = await organizerEventsService.startSensitiveProfileAccess(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Ma OTP da duoc gui den email'));
    } catch (err) {
      next(err);
    }
  };

  verifySensitiveAccess = async (req, res, next) => {
    try {
      const data = await organizerEventsService.verifySensitiveProfileAccess(
        req.user.sub,
        String(req.body?.challengeId || ''),
        String(req.body?.otp || ''),
      );
      res.status(200).json(ApiResponse.success(data, 'Da mo khoa thong tin phap ly'));
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
      const data = await eventBusinessRulesService.cancelEventNormalFlow(req.user.sub, req.params.eventId, req.body || {});
      res.status(200).json(ApiResponse.success(data, 'Hủy sự kiện thành công'));
    } catch (err) {
      next(err);
    }
  };

  submitCancellationRequest = async (req, res, next) => {
    try {
      const data = await eventBusinessRulesService.submitCancellationRequest(req.user.sub, req.params.eventId, req.body || {});
      res.status(200).json(ApiResponse.success(data, 'Đã gửi yêu cầu hủy sự kiện thành công, đang chờ Quản trị viên xét duyệt'));
    } catch (err) {
      next(err);
    }
  };

  withdrawCancellationRequest = async (req, res, next) => {
    try {
      const data = await eventBusinessRulesService.withdrawCancellationRequest(req.user.sub, req.params.eventId);
      res.status(200).json(ApiResponse.success(data, 'Đã rút lại yêu cầu hủy sự kiện thành công'));
    } catch (err) {
      next(err);
    }
  };

  hideEvent = async (req, res, next) => {
    try {
      const data = await eventBusinessRulesService.hideEvent(req.user.sub, req.params.eventId, req.body || {});
      res.status(200).json(ApiResponse.success(data, 'Đã ẩn sự kiện và tạm dừng bán vé thành công'));
    } catch (err) {
      next(err);
    }
  };

  unhideEvent = async (req, res, next) => {
    try {
      const data = await eventBusinessRulesService.unhideEvent(req.user.sub, req.params.eventId);
      res.status(200).json(ApiResponse.success(data, data.message || 'Đã hiển thị lại sự kiện'));
    } catch (err) {
      next(err);
    }
  };

  pauseSales = async (req, res, next) => {
    try {
      const data = await eventBusinessRulesService.pauseSales(req.user.sub, req.params.eventId, req.body || {});
      res.status(200).json(ApiResponse.success(data, 'Đã tạm dừng bán vé'));
    } catch (err) {
      next(err);
    }
  };

  resumeSales = async (req, res, next) => {
    try {
      const data = await eventBusinessRulesService.resumeSales(req.user.sub, req.params.eventId);
      res.status(200).json(ApiResponse.success(data, data.message || 'Đã mở bán lại vé'));
    } catch (err) {
      next(err);
    }
  };

  getRefundWorklist = async (req, res, next) => {
    try {
      const data = await eventBusinessRulesService.getRefundWorklist(req.user.sub, req.params.eventId);
      res.status(200).json(ApiResponse.success(data, 'Danh sách cần hoàn tiền'));
    } catch (err) {
      next(err);
    }
  };

  markRefundsSubmitted = async (req, res, next) => {
    try {
      const data = await eventBusinessRulesService.markRefundsSubmitted(req.user.sub, req.params.eventId, req.body || {});
      res.status(200).json(ApiResponse.success(data, 'Đã đánh dấu các khoản hoàn tiền thành công'));
    } catch (err) {
      next(err);
    }
  };

  deleteDraftEvent = async (req, res, next) => {
    try {
      const data = await organizerEventsService.deleteDraftEvent(req.user.sub, req.params.eventId);
      res.status(200).json(ApiResponse.success(data, 'Đã xóa bản nháp sự kiện thành công'));
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

  getLatestAiContentGeneration = async (req, res, next) => {
    try {
      const { eventId } = req.query;
      const data = await organizerEventsService.getLatestAiContentGeneration(req.user.sub, eventId);
      res.status(200).json(ApiResponse.success(data, 'Latest AI content generation fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  generateAiEventContent = async (req, res, next) => {
    try {
      const data = await organizerEventsService.generateAiEventContent(req.user.sub, req.body);
      res.status(200).json(ApiResponse.success(data, 'AI event content generated successfully'));
    } catch (err) {
      next(err);
    }
  };

  extractEventFromFile = async (req, res, next) => {
    try {
      let documentText = '';
      if (req.file) {
        documentText = await aiDocumentParserService.extractTextFromFile(req.file);
      } else if (req.body?.raw_text && req.body.raw_text.trim()) {
        documentText = req.body.raw_text.trim();
      } else {
        return res.status(400).json(ApiResponse.error('Vui lòng tải lên file tài liệu hoặc nhập văn bản kế hoạch sự kiện'));
      }

      const note = req.body?.note || '';
      let organizerName = '';
      try {
        const organizer = await organizerEventsRepository.findOrganizerByUserId(req.user.sub);
        organizerName = organizer?.organization_name || organizer?.individual_full_name || req.user?.name || '';
      } catch (err) {
        logger.warn(`[extractEventFromFile] Could not load organizer name: ${err.message}`);
      }

      const result = await aiDocumentParserService.extractEventFromText(documentText, note, { organizerName });
      res.status(200).json(ApiResponse.success(result, 'Trích xuất dữ liệu sự kiện thành công'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new OrganizerEventsController();

