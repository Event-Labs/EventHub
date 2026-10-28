const logger = require('../../core/logger');
const eventsAdminService = require('./events.service');
const systemSettingsRepository = require('./systemSettings.repository');

let interval = null;
const SCAN_INTERVAL_MS = 15 * 60 * 1000; // 15 phút một lần

/**
 * Trình lập lịch quét sự kiện định kỳ mỗi 15 phút:
 * - Mỗi lần chạy CHỈ thẩm định đúng 01 sự kiện duy nhất.
 * - Nếu admin BẬT tự động duyệt (auto_approve_enabled = true): AI đánh giá và tự động phê duyệt nếu đạt chuẩn hoặc từ chối nếu vi phạm.
 * - Nếu admin KHÔNG BẬT tự động duyệt (auto_approve_enabled = false): AI quét review trước và lưu kết quả đầy đủ cho admin kiểm tra, giữ nguyên trạng thái chờ duyệt.
 */
function startAutoReviewScheduler() {
  if (interval) return;

  logger.info('[AutoReviewScheduler] Khởi động trình lập lịch AI quét duyệt sự kiện (chu kỳ mỗi 15 phút)...');

  const runSchedulerTick = async () => {
    try {
      const settings = await systemSettingsRepository.getAutoReviewSettings();
      if (!settings.auto_review_enabled) {
        logger.info('[AutoReviewScheduler] Hệ thống AI đang tắt (auto_review_enabled = false). Bỏ qua chu kỳ quét 15 phút.');
        return;
      }

      const activeStatus = eventsAdminService.getActiveScanStatus();
      if (activeStatus.isRunning) {
        logger.info(`[AutoReviewScheduler] Chu kỳ 15p: Đang có tiến trình quét sự kiện "${activeStatus.eventTitle || activeStatus.eventId}". Bỏ qua tick này.`);
        return;
      }

      const modeLabel = settings.auto_approve_enabled
        ? 'TỰ ĐỘNG PHÊ DUYỆT'
        : 'QUÉT REVIEW TRƯỚC (GIỮ CHỜ DUYỆT)';

      logger.info(`[AutoReviewScheduler] Chu kỳ 15p bắt đầu: Quét 1 sự kiện (Chế độ: ${modeLabel})...`);
      const result = await eventsAdminService.runSingleAutoReview('SYSTEM_SCHEDULER', 'SCHEDULED');

      if (result.processed > 0) {
        logger.info(
          `[AutoReviewScheduler] Hoàn tất chu kỳ 15p cho sự kiện "${result.eventTitle}": Hành động = ${result.action}`
        );
      } else {
        logger.info(`[AutoReviewScheduler] Chu kỳ 15p kết thúc: ${result.message || 'Không có sự kiện cần xử lý'}`);
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.code === 'SCAN_CANCELLED') {
        logger.info('[AutoReviewScheduler] Tiến trình quét định kỳ đã được hủy theo yêu cầu.');
      } else {
        logger.error(`[AutoReviewScheduler] Lỗi trong chu kỳ quét 15p: ${err.message}`);
      }
    }
  };

  // Thiết lập interval chạy mỗi 15 phút
  interval = setInterval(runSchedulerTick, SCAN_INTERVAL_MS);
}

function stopAutoReviewScheduler() {
  if (interval) {
    clearInterval(interval);
    interval = null;
    logger.info('[AutoReviewScheduler] Đã dừng trình lập lịch AI quét duyệt sự kiện.');
  }
}

module.exports = {
  startAutoReviewScheduler,
  stopAutoReviewScheduler,
};
