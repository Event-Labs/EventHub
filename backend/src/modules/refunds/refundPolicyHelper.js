/**
 * Shared Helper for Refund Policy Structured Data & Text Generation
 */

/**
 * Validates list of refund rules
 * @param {Array<{days_before: number, refund_rate: number}>} rules
 * @returns {{ valid: boolean, error?: string, sortedRules?: Array<{days_before: number, refund_rate: number}> }}
 */
function validateRefundRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return { valid: false, error: 'Vui lòng thiết lập ít nhất 1 mốc hoàn tiền khi bật chính sách hoàn vé.' };
  }

  if (rules.length > 4) {
    return { valid: false, error: 'Tối đa chỉ cho phép 4 mốc hoàn tiền.' };
  }

  const seenDays = new Set();
  const parsedRules = [];

  for (let idx = 0; idx < rules.length; idx++) {
    const r = rules[idx];
    if (r.days_before === '' || r.days_before === null || r.days_before === undefined) {
      return { valid: false, isValid: false, error: `Mốc ${idx + 1}: Vui lòng nhập số ngày trước sự kiện.` };
    }
    if (r.refund_rate === '' || r.refund_rate === null || r.refund_rate === undefined) {
      return { valid: false, isValid: false, error: `Mốc ${idx + 1}: Vui lòng nhập tỷ lệ hoàn tiền.` };
    }

    const days = Number(r.days_before);
    const rate = Number(r.refund_rate);

    if (!Number.isInteger(days) || days < 0) {
      return { valid: false, isValid: false, error: `Mốc ${idx + 1}: Số ngày trước sự kiện phải là số nguyên không âm (>= 0).` };
    }

    if (days > 365) {
      return { valid: false, isValid: false, error: `Mốc ${idx + 1}: Số ngày trước sự kiện không được vượt quá 365 ngày.` };
    }

    if (seenDays.has(days)) {
      return { valid: false, isValid: false, error: `Mốc ${idx + 1}: Số ngày trước sự kiện (${days} ngày) bị trùng lặp.` };
    }
    seenDays.add(days);

    if (!Number.isInteger(rate) || rate < 0 || rate > 100) {
      return { valid: false, isValid: false, error: `Mốc ${idx + 1}: Tỷ lệ hoàn tiền phải là số nguyên từ 0% đến 100%.` };
    }

    parsedRules.push({ days_before: days, refund_rate: rate });
  }

  // Sort descending by days_before
  const sortedRules = [...parsedRules].sort((a, b) => b.days_before - a.days_before);

  // Check that refund_rate decreases or stays equal as days_before decreases
  for (let i = 1; i < sortedRules.length; i++) {
    if (sortedRules[i].refund_rate > sortedRules[i - 1].refund_rate) {
      return {
        valid: false,
        isValid: false,
        error: `Tỷ lệ hoàn tiền không hợp lệ: Mốc ${sortedRules[i].days_before} ngày (${sortedRules[i].refund_rate}%) không được cao hơn mốc ${sortedRules[i - 1].days_before} ngày (${sortedRules[i - 1].refund_rate}%). Tỷ lệ hoàn phải giảm dần hoặc giữ nguyên khi thời gian càng gần sự kiện.`,
      };
    }
  }

  return { valid: true, isValid: true, sortedRules, rules: sortedRules };
}

/**
 * Generates an array of formatted bullet points from structured refund policy
 * @param {Object} policy
 * @returns {string[]}
 */
function generateRefundPolicyLines(policy) {
  if (!policy) return ['• Vé không hỗ trợ hoàn hủy.'];

  const isAllowed = Boolean(policy.allow_refund ?? policy.allow_refunds);
  if (!isAllowed) {
    return ['• Vé không hỗ trợ hoàn hủy theo chính sách của sự kiện.'];
  }

  const rules = Array.isArray(policy.refund_rules) ? policy.refund_rules : [];
  if (rules.length === 0) {
    return ['• Vé không hỗ trợ hoàn hủy.'];
  }

  const sorted = [...rules].sort((a, b) => Number(b.days_before) - Number(a.days_before));
  const lines = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    if (i === 0) {
      lines.push(`• Hoàn ${current.refund_rate}% số tiền đã thanh toán nếu yêu cầu trước sự kiện ít nhất ${current.days_before} ngày.`);
    } else {
      const prev = sorted[i - 1];
      lines.push(`• Hoàn ${current.refund_rate}% số tiền đã thanh toán nếu yêu cầu trước sự kiện từ ${current.days_before} đến dưới ${prev.days_before} ngày.`);
    }
  }

  const minDays = sorted[sorted.length - 1].days_before;
  if (minDays > 0) {
    lines.push(`• Không hỗ trợ hoàn tiền nếu yêu cầu trong vòng ${minDays} ngày trước sự kiện.`);
  }

  if (policy.refund_notes && policy.refund_notes.trim()) {
    lines.push(`* Ghi chú từ BTC: ${policy.refund_notes.trim()}`);
  }

  return lines;
}

/**
 * Generates full text string from structured refund policy
 * @param {Object} policy
 * @returns {string}
 */
function generateRefundPolicyText(policy) {
  return generateRefundPolicyLines(policy).join('\n');
}

module.exports = {
  validateRefundRules,
  generateRefundPolicyLines,
  generateRefundPolicyText,
};
