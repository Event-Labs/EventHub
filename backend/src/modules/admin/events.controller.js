const ApiResponse = require('../../core/response/ApiResponse');
const eventsAdminService = require('./events.service');
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
      res.status(200).json(ApiResponse.success(data, 'Batch AI auto-review completed successfully'));
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
      const isPdf = buffer.subarray(0, 5).toString('latin1').startsWith('%PDF-') || url.toLowerCase().includes('.pdf');

      res.setHeader('Content-Type', isPdf ? 'application/pdf' : (remoteResp.headers.get('content-type') || 'application/octet-stream'));
      res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
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

