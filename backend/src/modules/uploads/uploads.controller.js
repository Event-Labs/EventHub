const ApiResponse = require('../../core/response/ApiResponse');
const uploadsService = require('./uploads.service');

class UploadsController {
  createEventImageSignature = async (req, res, next) => {
    try {
      const data = uploadsService.createEventImageSignature(req.body?.type);
      res.status(200).json(ApiResponse.success(data, 'Cloudinary upload signature created'));
    } catch (err) {
      next(err);
    }
  };

  createAvatarSignature = async (req, res, next) => {
    try {
      const data = uploadsService.createAvatarSignature();
      res.status(200).json(ApiResponse.success(data, 'Cloudinary upload signature for avatar created'));
    } catch (err) {
      next(err);
    }
  };

  createOrganizerAvatarSignature = async (req, res, next) => {
    try {
      const data = uploadsService.createOrganizerAvatarSignature();
      res.status(200).json(ApiResponse.success(data, 'Cloudinary upload signature for organizer avatar created'));
    } catch (err) {
      next(err);
    }
  };

  createOrganizerDocumentSignature = async (req, res, next) => {
    try {
      const data = uploadsService.createOrganizerDocumentSignature();
      res.status(200).json(ApiResponse.success(data, 'Cloudinary upload signature for organizer document created'));
    } catch (err) {
      next(err);
    }
  };

  createPolicyPdfSignature = async (req, res, next) => {
    try {
      const data = uploadsService.createPolicyDocumentSignature();
      res.status(200).json(ApiResponse.success(data, 'Cloudinary upload signature for policy document created'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new UploadsController();
