const ApiResponse = require('../../core/response/ApiResponse');
const eventsAdminService = require('./events.service');
const eventBusinessRulesService = require('../events/eventBusinessRules.service');
const { fetchDocumentContent } = require('../../common/utils/htmlImageParser.util');
const {
  eventIdSchema,
  reviewEventSchema,
  hideEventSchema,
  reviewCriteriaIdSchema,
  createReviewCriteriaSchema,
  updateReviewCriteriaSchema,
} = require('./events.validation');

class EventsAdminController {
  getEventDetail = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const data = await eventsAdminService.getEventDetail(eventId);
      res.status(200).json(ApiResponse.success(data, 'Event detail retrieved successfully'));
    } catch (err) {
      next(err);
    }
  };

  reviewEvent = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const payload = reviewEventSchema.parse(req.body);
      const data = await eventsAdminService.reviewEvent(req.user.sub, eventId, payload);
      res.status(200).json(ApiResponse.success(data, 'Event reviewed successfully'));
    } catch (err) {
      next(err);
    }
  };

  hideEvent = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const payload = hideEventSchema.parse(req.body);
      const data = await eventsAdminService.hideEvent(req.user.sub, eventId, payload);
      res.status(200).json(ApiResponse.success(data, 'Event hidden successfully'));
    } catch (err) {
      next(err);
    }
  };

  unhideEvent = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const data = await eventsAdminService.unhideEvent(req.user.sub, eventId);
      res.status(200).json(ApiResponse.success(data, 'Event restored successfully'));
    } catch (err) {
      next(err);
    }
  };

  suspendEvent = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const data = await eventBusinessRulesService.suspendEvent(req.user.sub, eventId, req.body || {});
      res.status(200).json(ApiResponse.success(data, 'Đã đình chỉ sự kiện thành công'));
    } catch (err) {
      next(err);
    }
  };

  unsuspendEvent = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const data = await eventBusinessRulesService.unsuspendEvent(req.user.sub, eventId, req.body || {});
      res.status(200).json(ApiResponse.success(data, 'Đã gỡ đình chỉ sự kiện thành công'));
    } catch (err) {
      next(err);
    }
  };

  reviewRevision = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const { decision, note } = req.body || {};
      if (!['APPROVE', 'REJECT'].includes(decision)) {
        throw new AppError('Quyết định kiểm duyệt phải là APPROVE hoặc REJECT', 400, ErrorCodes.INVALID_INPUT);
      }
      const data = await eventBusinessRulesService.reviewRevision(req.user.sub, eventId, { decision, note });
      res.status(200).json(ApiResponse.success(data, decision === 'APPROVE' ? 'Đã phê duyệt bản sửa đổi thành công' : 'Đã từ chối bản sửa đổi'));
    } catch (err) {
      next(err);
    }
  };

  approveCancellationRequest = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      if (req.body?.decision === 'REJECT') {
        const note = req.body?.rejection_reason || req.body?.note || '';
        const data = await eventBusinessRulesService.rejectCancellationRequest(req.user.sub, eventId, { note });
        return res.status(200).json(ApiResponse.success(data, 'Đã từ chối yêu cầu hủy sự kiện'));
      }
      const data = await eventBusinessRulesService.approveCancellationRequest(req.user.sub, eventId, req.body || {});
      res.status(200).json(ApiResponse.success(data, 'Đã phê duyệt yêu cầu hủy sự kiện và khởi tạo tiến trình hoàn tiền'));
    } catch (err) {
      next(err);
    }
  };

  rejectCancellationRequest = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const note = req.body?.rejection_reason || req.body?.note || '';
      const data = await eventBusinessRulesService.rejectCancellationRequest(req.user.sub, eventId, { note });
      res.status(200).json(ApiResponse.success(data, 'Đã từ chối yêu cầu hủy sự kiện'));
    } catch (err) {
      next(err);
    }
  };

  initiateForceCancel = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const data = await eventBusinessRulesService.initiateForceCancel(req.user.sub, eventId, req.body || {});
      res.status(200).json(ApiResponse.success(data, 'Đã bắt đầu tiến trình hủy cưỡng chế sự kiện (đang trong thời gian chờ Cooling-off)'));
    } catch (err) {
      next(err);
    }
  };

  confirmForceCancel = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const data = await eventBusinessRulesService.confirmForceCancel(req.user.sub, eventId);
      res.status(200).json(ApiResponse.success(data, 'Đã xác nhận hủy cưỡng chế sự kiện thành công'));
    } catch (err) {
      next(err);
    }
  };

  getAiReview = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const data = await eventsAdminService.getAiReview(eventId);
      res.status(200).json(ApiResponse.success(data, 'AI review fetched successfully'));
    } catch (err) {
      next(err);
    }
  };

  runAiReview = async (req, res, next) => {
    try {
      const { eventId } = eventIdSchema.parse(req.params);
      const data = await eventsAdminService.runAiReview(eventId);
      res.status(200).json(ApiResponse.success(data, 'AI review generated successfully'));
    } catch (err) {
      if (
        err.name === 'AbortError' ||
        err.code === 'SCAN_CANCELLED' ||
        err.statusCode === 499 ||
        String(err.message || '').toLowerCase().includes('abort') ||
        String(err.message || '').toLowerCase().includes('hủy') ||
        String(err.message || '').toLowerCase().includes('dừng')
      ) {
        return res.status(200).json(ApiResponse.success({
          cancelled: true,
          message: 'Tiến trình quét AI đã được dừng theo yêu cầu của bạn.',
        }, 'Tiến trình AI đã bị hủy.'));
      }
      next(err);
    }
  };

  getAutoReviewSettings = async (req, res, next) => {
    try {
      const data = await eventsAdminService.getAutoReviewSettings();
      res.status(200).json(ApiResponse.success(data, 'AI auto-review settings retrieved successfully'));
    } catch (err) {
      next(err);
    }
  };

  updateAutoReviewSettings = async (req, res, next) => {
    try {
      const data = await eventsAdminService.updateAutoReviewSettings(req.user.sub, req.body);
      res.status(200).json(ApiResponse.success(data, 'AI auto-review settings updated successfully'));
    } catch (err) {
      next(err);
    }
  };

  runBatchAutoReview = async (req, res, next) => {
    try {
      const data = await eventsAdminService.runBatchAutoReview(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'AI auto-review completed successfully'));
    } catch (err) {
      next(err);
    }
  };

  runSingleAutoReview = async (req, res, next) => {
    try {
      const data = await eventsAdminService.runSingleAutoReview(req.user.sub, 'MANUAL');
      res.status(200).json(ApiResponse.success(data, 'Single AI auto-review completed successfully'));
    } catch (err) {
      next(err);
    }
  };

  cancelAutoReview = async (req, res, next) => {
    try {
      const data = eventsAdminService.cancelActiveScan();
      res.status(200).json(ApiResponse.success(data, data.message));
    } catch (err) {
      next(err);
    }
  };

  getAutoReviewScanStatus = async (req, res, next) => {
    try {
      const data = eventsAdminService.getActiveScanStatus();
      res.status(200).json(ApiResponse.success(data, 'Current AI auto-review scan status'));
    } catch (err) {
      next(err);
    }
  };

  listReviewCriteria = async (req, res, next) => {
    try {
      const data = await eventsAdminService.listReviewCriteria(req.query);
      res.status(200).json(ApiResponse.success(data, 'Review criteria list retrieved successfully'));
    } catch (err) {
      next(err);
    }
  };

  getReviewCriteriaById = async (req, res, next) => {
    try {
      const { id } = reviewCriteriaIdSchema.parse(req.params);
      const data = await eventsAdminService.getReviewCriteriaById(id);
      res.status(200).json(ApiResponse.success(data, 'Review criteria retrieved successfully'));
    } catch (err) {
      next(err);
    }
  };

  createReviewCriteria = async (req, res, next) => {
    try {
      const payload = createReviewCriteriaSchema.parse(req.body);
      const data = await eventsAdminService.createReviewCriteria(req.user.sub, payload);
      res.status(201).json(ApiResponse.success(data, 'Review criteria created successfully'));
    } catch (err) {
      next(err);
    }
  };

  updateReviewCriteria = async (req, res, next) => {
    try {
      const { id } = reviewCriteriaIdSchema.parse(req.params);
      const payload = updateReviewCriteriaSchema.parse(req.body);
      const data = await eventsAdminService.updateReviewCriteria(req.user.sub, id, payload);
      res.status(200).json(ApiResponse.success(data, 'Review criteria updated successfully'));
    } catch (err) {
      next(err);
    }
  };

  deleteReviewCriteria = async (req, res, next) => {
    try {
      const { id } = reviewCriteriaIdSchema.parse(req.params);
      const data = await eventsAdminService.deleteReviewCriteria(id);
      res.status(200).json(ApiResponse.success(data, 'Review criteria deleted successfully'));
    } catch (err) {
      next(err);
    }
  };

  resetDefaultReviewCriteria = async (req, res, next) => {
    try {
      const data = await eventsAdminService.resetDefaultReviewCriteria(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Default review criteria restored successfully'));
    } catch (err) {
      next(err);
    }
  };

  previewDocument = async (req, res, next) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        return res.status(400).send('Invalid document URL');
      }

      const remoteResp = await fetch(url, {
        headers: { 'User-Agent': 'EventHub-DocumentPreview/1.0' },
      });

      if (!remoteResp.ok) {
        return res.status(remoteResp.status).send('Cannot fetch document from storage');
      }

      const arrayBuffer = await remoteResp.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const magic = buffer.subarray(0, 5).toString('latin1');
      const lowerUrl = url.toLowerCase();

      let contentType = remoteResp.headers.get('content-type') || 'application/octet-stream';
      let filename = 'document';

      if (magic.startsWith('%PDF-') || lowerUrl.includes('.pdf')) {
        contentType = 'application/pdf';
        filename = 'document.pdf';
      } else if (magic.startsWith('PK\x03\x04') || lowerUrl.includes('.docx')) {
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        filename = 'document.docx';
      } else if (magic.startsWith('\xFF\xD8\xFF') || lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg')) {
        contentType = 'image/jpeg';
        filename = 'document.jpg';
      } else if (magic.startsWith('\x89PNG') || lowerUrl.includes('.png')) {
        contentType = 'image/png';
        filename = 'document.png';
      } else if (magic.startsWith('RIFF') || lowerUrl.includes('.webp')) {
        contentType = 'image/webp';
        filename = 'document.webp';
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    } catch (err) {
      next(err);
    }
  };

  extractDocumentText = async (req, res, next) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        return res.status(400).json(ApiResponse.error('Invalid document URL', 400));
      }

      const docResult = await fetchDocumentContent(url, {}, 15000);
      return res.status(200).json(ApiResponse.success(docResult, 'Document text extracted successfully'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new EventsAdminController();

