const express = require('express');
const eventsController = require('./events.controller');
const optionalAuth = require('../../middlewares/optionalAuth.middleware');
const { protect } = require('../../middlewares/auth.middleware');
const { cacheMiddleware } = require('../../middlewares/cache.middleware');
const { requireBookingToken } = require('../waiting-room/waitingRoom.middleware');
const {
  holdSeatsRateLimiter,
  releaseSeatHoldsRateLimiter,
  checkAvailabilityRateLimiter,
} = require('../../middlewares/rateLimiter.middleware');

const router = express.Router();

// Danh sách sự kiện (Trang chủ / Tìm kiếm / Lọc): Cache 15 giây
router.get('/', optionalAuth, cacheMiddleware(15), eventsController.getPublicEvents);

// Danh mục và Danh sách ban tổ chức: Cache 60 giây
router.get('/categories', cacheMiddleware(60, { isUserSpecific: false }), eventsController.getPublicCategories);
router.get('/organizers', cacheMiddleware(60, { isUserSpecific: false }), eventsController.getPublicOrganizers);

// Sơ đồ ghế suất diễn: Micro-cache 3 giây để giảm tải truy vấn vẽ 392 ghế khi hàng trăm user mở cùng lúc
router.get('/sessions/:sessionId/seats', cacheMiddleware(3, { isUserSpecific: false }), eventsController.getSessionSeats);

// Các endpoint đặt / giữ vé thời gian thực: TUYỆT ĐỐI KHÔNG CACHE
router.post('/availability/check', protect, checkAvailabilityRateLimiter, eventsController.checkTicketAvailability);
router.post('/availability/hold', protect, holdSeatsRateLimiter, requireBookingToken, eventsController.holdSeats);
router.post('/availability/release', protect, releaseSeatHoldsRateLimiter, eventsController.releaseSeatHolds);
router.get('/favorites/me', protect, eventsController.getFavoriteEvents);

// Quản lý và khôi phục phiên giữ vé ACTIVE (Section 3 & 4)
router.get('/:identifier/active-hold', protect, eventsController.getActiveHold);
router.post('/:identifier/hold/cancel', protect, releaseSeatHoldsRateLimiter, eventsController.cancelActiveHold);

router.post('/:eventId/favorite', protect, eventsController.addFavorite);
router.delete('/:eventId/favorite', protect, eventsController.removeFavorite);
router.post('/:eventId/favorite/toggle', protect, eventsController.toggleFavorite);

router.get('/my-events', protect, eventsController.getOrganizerEvents);

// Chi tiết sự kiện: Cache 15 giây
router.get('/:identifier', optionalAuth, cacheMiddleware(15), eventsController.getPublicEventDetail);

module.exports = router;
