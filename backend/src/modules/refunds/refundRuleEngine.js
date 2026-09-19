const ALLOWED_REASONS = [
  'Trùng lịch cá nhân',
  'Sự kiện thay đổi thông tin',
  'Mua nhầm vé',
  'Lý do sức khỏe',
  'Khác',
];

const ALLOWED_REJECT_REASONS = [
  'Không đúng chính sách',
  'Vé đã qua sử dụng',
  'Lý do không hợp lý',
  'Khác',
];

class RefundRuleEngine {
  /**
   * Evaluates eligibility for customer ticket refund according to Report 3
   * (Functions 74, 75, 76 and Business Rules BR-01, BR-02, BR-17, BR-18, BR-20, BR-71, BR-72, BR-75).
   *
   * @param {Object} context
   * @param {Object} context.ticket
   * @param {Object} context.order
   * @param {Object} context.event
   * @param {Object} context.activeRefund
   * @param {string} context.customerId
   * @param {string} context.reason
   * @param {string} [context.customerNote]
   * @param {Date} [context.currentTime]
   * @returns {Object} RefundValidationResult { eligible, reason, errorCode, refundableAmount, cancellationFee, feePercentage, policy }
   */
  evaluateEligibility(context) {
    const {
      ticket,
      order,
      event,
      activeRefund,
      customerId,
      reason,
      customerNote,
      currentTime = new Date(),
    } = context;

    const now = currentTime.getTime();

    // 1. Order & Ticket existence
    if (!order) {
      return {
        eligible: false,
        reason: 'Đơn hàng không tồn tại.',
        errorCode: 'ORDER_NOT_FOUND',
      };
    }

    if (ticket && !ticket.id) {
      return {
        eligible: false,
        reason: 'Vé không tồn tại.',
        errorCode: 'TICKET_NOT_FOUND',
      };
    }

    // 2. Ownership verification (BR-17)
    if (order.user_id && order.user_id !== customerId && ticket?.customer_id !== customerId) {
      return {
        eligible: false,
        reason: 'Vé hoặc đơn hàng không thuộc quyền sở hữu của bạn.',
        errorCode: 'FORBIDDEN_OWNERSHIP',
      };
    }

    // 3. Payment Status verification (BR-71)
    const validPaidStatuses = ['PAID', 'REFUND_REQUESTED'];
    if (!validPaidStatuses.includes(order.status) && order.payment_status !== 'PAID') {
      return {
        eligible: false,
        reason: 'Chỉ có thể yêu cầu hoàn tiền cho vé/đơn hàng đã thanh toán thành công.',
        errorCode: 'ORDER_NOT_PAID',
      };
    }

    // 4. Ticket Status & Check-in checks (BR-71, BR-72)
    if (ticket) {
      if (ticket.checked_in_at || ticket.status === 'USED') {
        return {
          eligible: false,
          reason: 'Vé đã được sử dụng, không thể yêu cầu hoàn tiền.',
          errorCode: 'TICKET_ALREADY_USED',
        };
      }

      if (ticket.status === 'REFUND_PENDING') {
        return {
          eligible: false,
          reason: 'Vé đang có yêu cầu hoàn tiền đang chờ ban tổ chức xem xét.',
          errorCode: 'TICKET_REFUND_PENDING',
        };
      }

      if (ticket.status === 'REFUNDED') {
        return {
          eligible: false,
          reason: 'Vé này đã được hoàn tiền thành công trước đó.',
          errorCode: 'TICKET_ALREADY_REFUNDED',
        };
      }

      if (ticket.status === 'CANCELLED') {
        return {
          eligible: false,
          reason: 'Vé đã bị hủy hoặc không còn hợp lệ.',
          errorCode: 'TICKET_CANCELLED',
        };
      }

      if (ticket.status !== 'VALID') {
        return {
          eligible: false,
          reason: `Vé đang ở trạng thái "${ticket.status}" và không thể hoàn tiền.`,
          errorCode: 'TICKET_INVALID_STATUS',
        };
      }

      // Check session expiration
      const sessionEndTime = ticket.session_end_time || event?.end_time;
      if (sessionEndTime && new Date(sessionEndTime).getTime() < now) {
        return {
          eligible: false,
          reason: 'Phiên sự kiện đã kết thúc, không thể yêu cầu hoàn tiền.',
          errorCode: 'SESSION_EXPIRED',
        };
      }
    }

    // 5. Active Refund Request check (BR-72)
    if (activeRefund) {
      const activeStatuses = ['PENDING', 'APPROVED', 'REFUNDED'];
      if (activeStatuses.includes(activeRefund.status)) {
        return {
          eligible: false,
          reason: 'Vé hoặc đơn hàng này đã có yêu cầu hoàn tiền đang được xử lý hoặc đã hoàn tất.',
          errorCode: 'DUPLICATE_REFUND_REQUEST',
        };
      }
    }

    // 6. Event Refund Policy checks (Report 3: 3.7.10 & BR-71)
    const rawPolicy = event?.refund_policy;
    const policy = typeof rawPolicy === 'string' ? JSON.parse(rawPolicy) : (rawPolicy || {});

    if (policy.allow_refunds === false) {
      return {
        eligible: false,
        reason: 'Sự kiện này áp dụng chính sách Không hoàn tiền.',
        errorCode: 'POLICY_NON_REFUNDABLE',
        policy,
      };
    }

    // Check refund deadline
    const deadlineDays = Number(policy.deadline_days || 0);
    const eventStartTime = ticket?.session_start_time || event?.start_time;
    if (eventStartTime && deadlineDays > 0) {
      const startTime = new Date(eventStartTime).getTime();
      const diffDays = (startTime - now) / (1000 * 60 * 60 * 24);

      if (diffDays < deadlineDays) {
        return {
          eligible: false,
          reason: `Đã quá thời hạn yêu cầu hoàn tiền cho vé này. Chính sách yêu cầu gửi trước ít nhất ${deadlineDays} ngày trước khi sự kiện diễn ra.`,
          errorCode: 'POLICY_DEADLINE_PASSED',
          policy,
        };
      }
    }

    // 7. Reason validation (Report 3 Table 3.7.10 items 6 & 7)
    if (!reason || !reason.trim()) {
      return {
        eligible: false,
        reason: 'Vui lòng chọn lý do hoàn tiền.',
        errorCode: 'REASON_REQUIRED',
      };
    }

    const trimmedReason = reason.trim();
    if (!ALLOWED_REASONS.includes(trimmedReason)) {
      return {
        eligible: false,
        reason: `Lý do hoàn tiền không hợp lệ. Vui lòng chọn một trong: ${ALLOWED_REASONS.join(', ')}`,
        errorCode: 'INVALID_REASON',
      };
    }

    if (trimmedReason === 'Khác' && (!customerNote || !customerNote.trim())) {
      return {
        eligible: false,
        reason: 'Vui lòng nhập lý do cụ thể khi chọn "Khác".',
        errorCode: 'REASON_NOTE_REQUIRED',
      };
    }

    // 8. Calculate net refundable amount (BR-75)
    let originalPrice = 0;
    if (ticket) {
      originalPrice = Number(ticket.final_price || ticket.unit_price || 0);
    } else {
      originalPrice = Number(order.total_amount || 0);
    }

    const feePercentage = Math.min(100, Math.max(0, Number(policy.fee_percentage || 0)));
    const cancellationFee = Math.round((originalPrice * feePercentage) / 100);
    const refundableAmount = Math.max(0, originalPrice - cancellationFee);

    if (refundableAmount <= 0 && originalPrice > 0) {
      return {
        eligible: false,
        reason: 'Số tiền hoàn lại sau khi trừ phí hoàn vé phải lớn hơn 0.',
        errorCode: 'ZERO_REFUNDABLE_AMOUNT',
        policy,
      };
    }

    return {
      eligible: true,
      reason: null,
      errorCode: null,
      originalPrice,
      refundableAmount,
      cancellationFee,
      feePercentage,
      policy,
    };
  }

  /**
   * Pre-defined reasons allowed for refund submission
   */
  getAllowedReasons() {
    return [...ALLOWED_REASONS];
  }

  /**
   * Pre-defined reasons allowed for organizer rejection
   */
  getAllowedRejectReasons() {
    return [...ALLOWED_REJECT_REASONS];
  }
}

module.exports = new RefundRuleEngine();
