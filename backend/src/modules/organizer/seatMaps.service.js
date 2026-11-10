const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const seatMapsRepository = require('./seatMaps.repository');
const subscriptionGuard = require('../organizer-subscriptions/subscriptionGuard.service');

const MAX_SEATS = 2000;

class SeatMapsService {
  async resolveOrganizerId(userId) {
    const organizer = await seatMapsRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return organizer.id;
  }

  validatePayload(data) {
    if (!data.name?.trim()) {
      throw new AppError('Vui lòng nhập tên sơ đồ.', 400, ErrorCodes.INVALID_INPUT);
    }
    const hasSeats = Boolean(data.seats && data.seats.length > 0);
    const hasStandingAreas = Boolean(data.config?.standingAreas && data.config.standingAreas.length > 0);
    if (!hasSeats && !hasStandingAreas) {
      throw new AppError('Sơ đồ cần có ít nhất một ghế ngồi hoặc một vùng đứng.', 400, ErrorCodes.INVALID_INPUT);
    }
    if ((data.seats || []).length > MAX_SEATS) {
      throw new AppError(`Tối đa ${MAX_SEATS} ghế trên một sơ đồ.`, 400, ErrorCodes.INVALID_INPUT);
    }
  }

  async listByVenue(userId, venueId) {
    const organizerId = await this.resolveOrganizerId(userId);
    const venue = await seatMapsRepository.assertVenueOwned(venueId, organizerId);
    if (!venue) {
      throw new AppError('Venue not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return seatMapsRepository.findSeatMapsByVenue(venueId, organizerId);
  }

  async getSeatMap(userId, seatMapId) {
    const organizerId = await this.resolveOrganizerId(userId);
    const seatMap = await seatMapsRepository.findSeatMapById(seatMapId, organizerId);
    if (!seatMap) {
      throw new AppError('Seat map not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return seatMap;
  }

  async createSeatMap(userId, venueId, data) {
    const organizerId = await this.resolveOrganizerId(userId);
    await subscriptionGuard.assertSeatMapCreationAllowed(organizerId);
    const venue = await seatMapsRepository.assertVenueOwned(venueId, organizerId);
    if (!venue) {
      throw new AppError('Venue not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    this.validatePayload(data);
    const seatMapId = await seatMapsRepository.insertSeatMapWithData(venueId, data);
    return seatMapsRepository.findSeatMapById(seatMapId, organizerId);
  }

  async updateSeatMap(userId, seatMapId, data) {
    const organizerId = await this.resolveOrganizerId(userId);
    await subscriptionGuard.assertSeatMapCreationAllowed(organizerId);
    const existing = await seatMapsRepository.findSeatMapById(seatMapId, organizerId);
    if (!existing) {
      throw new AppError('Không tìm thấy sơ đồ ghế.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    const inUse = await seatMapsRepository.countSessionUsage(seatMapId);
    if (inUse > 0) {
      throw new AppError('Sơ đồ ghế đang được sử dụng bởi phiên sự kiện đang hoạt động.', 400, ErrorCodes.INVALID_INPUT);
    }
    this.validatePayload(data);
    await seatMapsRepository.replaceSeatMapData(seatMapId, data);
    return seatMapsRepository.findSeatMapById(seatMapId, organizerId);
  }

  async deleteSeatMap(userId, seatMapId) {
    const organizerId = await this.resolveOrganizerId(userId);
    const existing = await seatMapsRepository.findSeatMapById(seatMapId, organizerId);
    if (!existing) {
      throw new AppError('Không tìm thấy sơ đồ ghế.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    const inUse = await seatMapsRepository.countSessionUsage(seatMapId);
    if (inUse > 0) {
      throw new AppError('Sơ đồ ghế đang được sử dụng bởi một hoặc nhiều phiên sự kiện, không thể xóa.', 400, ErrorCodes.INVALID_INPUT);
    }
    const deleted = await seatMapsRepository.softDelete(seatMapId);
    if (!deleted) {
      throw new AppError('Seat map not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return { deleted: true };
  }

  async generateSeatMapFromImage(file) {
    if (!file || !file.buffer) {
      throw new AppError('Vui lòng chọn file ảnh sơ đồ ghế (PNG, JPG, WEBP).', 400, ErrorCodes.INVALID_INPUT);
    }

    const localUrl = (process.env.SEATMAP_AI_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '');
    const remoteUrl = (process.env.AI_SERVICE_URL || localUrl).replace(/\/+$/, '');
    const candidateUrls = localUrl !== remoteUrl ? [localUrl, remoteUrl] : [localUrl];

    let response;
    let usedServiceUrl = localUrl;
    let lastErr = null;
    for (const baseUrl of candidateUrls) {
      usedServiceUrl = baseUrl;
      const formData = new FormData();
      const blob = new Blob([file.buffer], { type: file.mimetype || 'image/png' });
      formData.append('file', blob, file.originalname || 'seatmap.png');
      try {
        response = await fetch(`${baseUrl}/api/seatmap/predict`, {
          method: 'POST',
          body: formData,
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (lastErr || !response) {
      throw new AppError(
        `Không thể kết nối tới Seatmap AI Service (${usedServiceUrl}). Vui lòng kiểm tra FastAPI server đã bật chưa.`,
        503,
        ErrorCodes.INTERNAL_ERROR,
      );
    }

    if (!response.ok) {
      let errText = '';
      try {
        const errJson = await response.json();
        errText = errJson.detail || errJson.message || '';
      } catch (_) {
        errText = await response.text().catch(() => '');
      }
      const isClientErr = response.status >= 400 && response.status < 500;
      throw new AppError(
        errText || `AI Service trả về lỗi HTTP ${response.status}`,
        isClientErr ? 400 : 502,
        isClientErr ? ErrorCodes.INVALID_INPUT : ErrorCodes.INTERNAL_ERROR,
      );
    }

    const payload = await response.json();
    if (!payload || !payload.data) {
      throw new AppError('Dữ liệu trả về từ AI Service không hợp lệ.', 502, ErrorCodes.INTERNAL_ERROR);
    }

    if (payload.data.isValidSeatMap === false) {
      throw new AppError(
        payload.data.invalidReason || 'Hình ảnh tải lên không phải là sơ đồ ghế hoặc sơ đồ sân khấu hợp lệ.',
        400,
        ErrorCodes.INVALID_INPUT,
      );
    }

    return payload.data;
  }
}

module.exports = new SeatMapsService();
