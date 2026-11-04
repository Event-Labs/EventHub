/**
 * EventHub - CCCD Processing Controller
 */

const ApiResponse = require('../../core/response/ApiResponse');
const cccdService = require('./cccd.service');

class CCCDController {
  scanCccd = async (req, res, next) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              'Vui lòng tải lên tệp ảnh thẻ CCCD (mặt trước).',
              400,
              'MISSING_FILE'
            )
          );
      }

      const result = await cccdService.scanCccdImage(
        req.file.buffer,
        req.file.mimetype,
        req.user?.sub || 'system'
      );

      if (!result.success) {
        return res
          .status(422)
          .json(
            ApiResponse.error(
              result.error || 'Ảnh không đủ tiêu chuẩn để nhận diện.',
              422,
              'CCCD_QUALITY_REJECTED',
              {
                stage: result.stage,
                quality: result.quality,
                guidance: result.guidance || [],
              }
            )
          );
      }

      return res
        .status(200)
        .json(ApiResponse.success(result, 'Quét và đối soát CCCD thành công'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new CCCDController();

