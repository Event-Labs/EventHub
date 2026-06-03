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

  createPolicyPdfSignature = async (req, res, next) => {
    try {
      const data = uploadsService.createPolicyPdfSignature();
      res.status(200).json(ApiResponse.success(data, 'Cloudinary upload signature for policy PDF created'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new UploadsController();
