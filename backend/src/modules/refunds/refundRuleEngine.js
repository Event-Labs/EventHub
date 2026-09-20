const { generateRefundPolicyText } = require('./refundPolicyHelper');

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
   * Evaluates eligibility for customer ticket refund according to Structured Refund Policy
   * and Business Rules.
   *
   * @param {Object} context
   * @param {Object} context.ticket
   * @param {Object} context.order
   * @param {Object} context.event
   * @param {Object} [context.activeRefund]
   * @param {string} context.customerId
   * @param {string} [context.reason]
   * @param {string} [context.customerNote]
   * @param {Date} [context.currentTime]
   * @param {boolean} [context.validateReason=true]
   * @returns {Object} RefundValidationResult
   */
  evaluateEligibility(context) {
    const {
      ticket,
      order,
      event,
      session,
      activeRefund,
      customerId,
      reason,
      customerNote,
      currentTime = new Date(),
      validateReason = true,
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
      const sessionEndTime = ticket.session_end_time || session?.end_time || event?.end_time;
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
      const activeStatuses = ['PENDING', 'APPROVED', 'PROCESSING', 'REFUNDED'];
      if (activeStatuses.includes(activeRefund.status)) {
        return {
          eligible: false,
          reason: 'Vé hoặc đơn hàng này đã có yêu cầu hoàn tiền đang được xử lý hoặc đã hoàn tất.',
          errorCode: 'DUPLICATE_REFUND_REQUEST',
        };
      }
    }

    // 6. Calculate Actual Paid Amount (BR-75, no platform fee in current business rule)
    let originalPrice = 0;
    let actualPaid = 0;

    if (ticket) {
      originalPrice = Number(
        ticket.unit_price ||
        ticket.final_price ||
        ticket.order_item_unit_price ||
        ticket.order_item_final_price ||
        0
      );
      const subtotal = Number(order.subtotal || order.order_subtotal || 0);
      const discountAmount = Number(order.discount_amount || order.order_discount_amount || 0);
      const totalAmount = Number(order.total_amount || order.order_total_amount || 0);

      if (subtotal > 0 && discountAmount > 0) {
        // Phân bổ giảm giá khuyến mãi tương ứng cho vé này
        const ticketDiscount = Math.round((originalPrice / subtotal) * discountAmount);
        actualPaid = Math.max(0, originalPrice - ticketDiscount);
      } else if (totalAmount > 0 && totalAmount < originalPrice) {
        actualPaid = totalAmount;
      } else {
        actualPaid = originalPrice;
      }

      if (totalAmount > 0 && actualPaid > totalAmount) {
        actualPaid = totalAmount;
      }
    } else {
      originalPrice = Number(order.subtotal || order.total_amount || 0);
      actualPaid = Number(order.total_amount || 0);
    }

    // 7. Event Refund Policy checks & Policy Snapshot Priority
    // Prefer policy snapshot on ticket if available, else event refund_policy
    const rawPolicy = ticket?.refund_policy_snapshot || event?.refund_policy;
    const policy = typeof rawPolicy === 'string' ? JSON.parse(rawPolicy) : (rawPolicy || {});
    const policyText = generateRefundPolicyText(policy);

    const isAllowed = Boolean(policy.allow_refund ?? policy.allow_refunds);
    if (!isAllowed) {
      return {
        eligible: false,
        reason: 'Vé không hỗ trợ hoàn hủy theo chính sách của sự kiện.',
        errorCode: 'POLICY_NON_REFUNDABLE',
        originalPrice,
        actualPaid,
        refundRate: 0,
        refundableAmount: 0,
        policy,
        policyText,
      };
    }

    // Check remaining time before event start
    const eventStartTime = ticket?.session_start_time || session?.start_time || event?.start_time;
    if (!eventStartTime) {
      return {
        eligible: false,
        reason: 'Không xác định được thời gian bắt đầu của sự kiện.',
        errorCode: 'EVENT_START_TIME_MISSING',
        originalPrice,
        actualPaid,
        policy,
        policyText,
      };
    }

    const startTimeMs = new Date(eventStartTime).getTime();
    const diffMs = startTimeMs - now;
    if (diffMs <= 0) {
      return {
        eligible: false,
        reason: 'Sự kiện đã bắt đầu hoặc đã kết thúc, không thể yêu cầu hoàn tiền.',
        errorCode: 'EVENT_ALREADY_STARTED',
        daysBeforeEvent: 0,
        originalPrice,
        actualPaid,
        policy,
        policyText,
      };
    }

    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const daysBeforeEvent = Math.floor(diffDays);

    // 8. Find matching refund rule
    const rules = Array.isArray(policy.refund_rules) ? policy.refund_rules : [];
    let matchedRule = null;
    let refundRate = 0;

    if (rules.length > 0) {
      // Sort rules descending by days_before
      const sortedRules = [...rules].sort((a, b) => Number(b.days_before) - Number(a.days_before));
      for (const rule of sortedRules) {
        if (diffDays >= Number(rule.days_before)) {
          matchedRule = rule;
          refundRate = Number(rule.refund_rate);
          break;
        }
      }

      if (!matchedRule) {
        const minDays = sortedRules[sortedRules.length - 1].days_before;
        return {
          eligible: false,
          reason: `Yêu cầu được gửi trong vòng ${minDays} ngày trước khi sự kiện bắt đầu nên không đủ điều kiện hoàn tiền theo chính sách.`,
          errorCode: 'POLICY_DEADLINE_PASSED',
          daysBeforeEvent,
          refundRate: 0,
          originalPrice,
          actualPaid,
          refundableAmount: 0,
          policy,
          policyText,
        };
      }
    } else if (policy.deadline_days !== undefined) {
      // Fallback for legacy policy without tiered refund_rules
      const deadlineDays = Number(policy.deadline_days || 0);
      if (deadlineDays > 0 && diffDays < deadlineDays) {
        return {
          eligible: false,
          reason: `Đã quá thời hạn yêu cầu hoàn tiền cho vé này. Chính sách yêu cầu gửi trước ít nhất ${deadlineDays} ngày trước khi sự kiện diễn ra.`,
          errorCode: 'POLICY_DEADLINE_PASSED',
          daysBeforeEvent,
          refundRate: 0,
          originalPrice,
          actualPaid,
          refundableAmount: 0,
          policy,
          policyText,
        };
      }
      const feePercentage = Math.min(100, Math.max(0, Number(policy.fee_percentage || 0)));
      refundRate = Math.max(0, 100 - feePercentage);
    } else {
      // If allow_refund is true but no rules configured, default to ineligible
      return {
        eligible: false,
        reason: 'Chính sách hoàn tiền chưa được cấu hình mốc cụ thể.',
        errorCode: 'NO_MATCHING_REFUND_RULE',
        daysBeforeEvent,
        refundRate: 0,
        originalPrice,
        actualPaid,
        refundableAmount: 0,
        policy,
        policyText,
      };
    }

    if (refundRate <= 0) {
      return {
        eligible: false,
        reason: 'Mức hoàn tiền áp dụng cho thời điểm này là 0%.',
        errorCode: 'ZERO_REFUND_RATE',
        daysBeforeEvent,
        refundRate: 0,
        originalPrice,
        actualPaid,
        refundableAmount: 0,
        policy,
        policyText,
        ruleMatched: matchedRule,
      };
    }

    // 9. Reason validation (only if validateReason is true)
    if (validateReason) {
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
    }

    // 10. Calculate final refund amount
    // Refund Amount = Actual Paid Amount × Applicable Refund Rate
    const refundableAmount = Math.round((actualPaid * refundRate) / 100);

    if (refundableAmount <= 0 && actualPaid > 0) {
      return {
        eligible: false,
        reason: 'Số tiền hoàn lại theo tỷ lệ áp dụng bằng 0 đ.',
        errorCode: 'ZERO_REFUNDABLE_AMOUNT',
        daysBeforeEvent,
        refundRate,
        originalPrice,
        actualPaid,
        refundableAmount: 0,
        policy,
        policyText,
        ruleMatched: matchedRule,
      };
    }

    return {
      eligible: true,
      reason: null,
      errorCode: null,
      daysBeforeEvent,
      refundRate,
      originalPrice,
      actualPaid,
      refundableAmount,
      policy,
      policyText,
      ruleMatched: matchedRule,
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
