const waitingRoomService = require('./waitingRoom.service');
const AppError = require('../../core/errors/AppError');
const logger = require('../../core/logger');

/**
 * Middleware protecting Booking APIs with Virtual Waiting Room Booking Token
 * Automatically bypasses when Virtual Waiting Room is disabled for the target event.
 */
const requireBookingToken = async (req, res, next) => {
  try {
    const eventId =
      req.body?.event_id ||
      req.params?.eventId ||
      req.query?.eventId ||
      req.body?.eventId ||
      null;

    if (!eventId) {
      return next();
    }

    const config = await waitingRoomService.getEventConfig(eventId);
    if (!config || !config.enabled) {
      // Waiting room is not enabled for this event -> Pass through safely
      return next();
    }

    const token =
      req.headers['x-booking-token'] ||
      req.headers['x-queue-token'] ||
      req.body?.booking_token ||
      req.query?.booking_token ||
      null;

    if (!token) {
      throw new AppError(
        'Sự kiện đang áp dụng phòng chờ ảo. Vui lòng tham gia phòng chờ và lấy quyền mua vé trước khi đặt.',
        403,
        'WAITING_ROOM_TOKEN_REQUIRED'
      );
    }

    const validation = await waitingRoomService.validateBookingToken(
      token,
      eventId,
      req.user?.sub
    );

    if (!validation.valid) {
      logger.warn(
        `[WaitingRoomMiddleware] Rejected booking token for event ${eventId}. Reason: ${validation.reason}`
      );
      throw new AppError(
        'Phiên đặt vé trong phòng chờ của bạn đã hết hạn hoặc không hợp lệ. Vui lòng quay lại xếp hàng.',
        403,
        'WAITING_ROOM_TOKEN_EXPIRED'
      );
    }

    req.waitingRoomSession = validation.payload;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  requireBookingToken,
};

