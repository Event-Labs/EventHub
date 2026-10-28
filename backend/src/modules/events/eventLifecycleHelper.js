const crypto = require('crypto');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

/**
 * Event Lifecycle & Multi-source Sales Blocks Helper
 * Implements Business Rules Specification v1.0 - v3.2
 */

const SALES_BLOCK_REASONS = {
  HIDE: 'HIDE',
  ORGANIZER_PAUSE: 'ORGANIZER_PAUSE',
  SUSPENDED: 'SUSPENDED',
  REFUND_OVERDUE: 'REFUND_OVERDUE',
  CANCELLATION_REQUESTED: 'CANCELLATION_REQUESTED',
  CANCELLING: 'CANCELLING',
};

/**
 * Gets currently active sales blocks (released_at is null)
 */
function getActiveSalesBlocks(salesBlocks) {
  if (!Array.isArray(salesBlocks)) return [];
  return salesBlocks.filter((b) => b && !b.released_at);
}

/**
 * Checks if sales are currently paused
 */
function isSalesPaused(salesBlocks, salesStatus) {
  if (salesStatus === 'PAUSED' || salesStatus === 'CLOSED') return true;
  const active = getActiveSalesBlocks(salesBlocks);
  return active.length > 0;
}

/**
 * Adds a sales block idempotently (BR-SB-03)
 */
function addSalesBlock(currentBlocks, { reason, source, createdBy, metadata = {} }) {
  const blocks = Array.isArray(currentBlocks) ? [...currentBlocks] : [];
  const existingActive = blocks.find((b) => b.reason === reason && !b.released_at);
  if (existingActive) {
    return { updatedBlocks: blocks, isChanged: false, block: existingActive };
  }

  const newBlock = {
    id: crypto.randomUUID(),
    reason,
    source, // ORGANIZER, ADMIN, SYSTEM
    created_by: createdBy || null,
    created_at: new Date().toISOString(),
    released_by: null,
    released_at: null,
    metadata,
  };

  blocks.push(newBlock);
  return { updatedBlocks: blocks, isChanged: true, block: newBlock };
}

/**
 * Releases a sales block adhering to ownership permissions (BR-SB-02)
 */
function releaseSalesBlock(currentBlocks, { reason, releasedBy, userRole }) {
  const blocks = Array.isArray(currentBlocks) ? [...currentBlocks] : [];
  const activeIndex = blocks.findIndex((b) => b.reason === reason && !b.released_at);

  if (activeIndex === -1) {
    const remainingActive = blocks.filter((b) => !b.released_at);
    return { updatedBlocks: blocks, remainingActive, isChanged: false };
  }

  const blockToRelease = blocks[activeIndex];
  const isPrivileged = ['ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin', 'SYSTEM', 'system'].includes(userRole);

  // Permission check: Organizer can only release HIDE or ORGANIZER_PAUSE
  if (!isPrivileged) {
    if (['SUSPENDED', 'REFUND_OVERDUE', 'CANCELLATION_REQUESTED', 'CANCELLING'].includes(blockToRelease.reason)) {
      throw new AppError(
        `Bạn không có quyền gỡ khóa dừng bán "${blockToRelease.reason}". Chỉ Quản trị viên hoặc hệ thống mới được gỡ.`,
        403,
        ErrorCodes.SUSPENDED_BY_ADMIN,
      );
    }
  }

  // CANCELLING cannot be released manually; it completes into CANCELLED
  if (blockToRelease.reason === 'CANCELLING' && !isPrivileged) {
    throw new AppError(
      'Khóa dừng bán đang trong tiến trình hủy sự kiện, không thể gỡ.',
      400,
      ErrorCodes.EVENT_INVALID_TRANSITION,
    );
  }

  blocks[activeIndex] = {
    ...blockToRelease,
    released_by: releasedBy || null,
    released_at: new Date().toISOString(),
  };

  const remainingActive = blocks.filter((b) => !b.released_at);
  return { updatedBlocks: blocks, remainingActive, isChanged: true };
}

/**
 * Computes the unified sales_status based on lifecycle status and active blocks (BR-SB-01)
 */
function computeSalesStatus({ status, salesBlocks, currentSalesStatus }) {
  if (['CANCELLED', 'ENDED'].includes(status)) {
    return 'CLOSED';
  }

  const active = getActiveSalesBlocks(salesBlocks);
  if (active.length > 0) {
    return 'PAUSED';
  }

  if (status === 'PUBLISHED') {
    return 'ON_SALE';
  }

  return currentSalesStatus || 'NOT_STARTED';
}

/**
 * Appends an entry to the event's audit trail (BR-UE-08, Section 10.5)
 */
function appendAuditTrail(currentTrail, { userId, role, action, reason, diff, stateBefore, stateAfter, requestId }) {
  const trail = Array.isArray(currentTrail) ? [...currentTrail] : [];
  trail.push({
    id: crypto.randomUUID(),
    user_id: userId || null,
    role: role || 'SYSTEM',
    action,
    reason: reason || null,
    diff: diff || null,
    state_before: stateBefore || null,
    state_after: stateAfter || null,
    request_id: requestId || null,
    timestamp: new Date().toISOString(),
  });
  return trail;
}

/**
 * Calculates min_quota for a ticket type (Section 4.6)
 * min_quota = (Ticket VALID + USED + REFUND_REQUESTED) + (Hold ACTIVE)
 */
function calculateMinQuota({ validCount = 0, usedCount = 0, refundRequestedCount = 0, activeHoldCount = 0 }) {
  return Number(validCount || 0) + Number(usedCount || 0) + Number(refundRequestedCount || 0) + Number(activeHoldCount || 0);
}

/**
 * Classifies an update payload into Minor, Major, or Critical according to Section 4.3 Matrix
 */
function classifyEventChanges(currentEvent, payload, { hasFinancialOrders = false }) {
  const changes = [];
  let changeClass = 'MINOR';

  const criticalFields = ['start_time', 'end_time', 'format'];
  const majorFields = ['title', 'category_id', 'additional_terms', 'refund_policy'];

  // Check critical fields
  for (const field of criticalFields) {
    if (payload[field] !== undefined && String(payload[field]) !== String(currentEvent[field])) {
      if (hasFinancialOrders) {
        changes.push({ field, type: 'CRITICAL', oldValue: currentEvent[field], newValue: payload[field] });
        changeClass = 'CRITICAL';
      } else {
        changes.push({ field, type: 'MAJOR', oldValue: currentEvent[field], newValue: payload[field] });
        if (changeClass !== 'CRITICAL') changeClass = 'MAJOR';
      }
    }
  }

  // Check major fields
  for (const field of majorFields) {
    if (payload[field] !== undefined && JSON.stringify(payload[field]) !== JSON.stringify(currentEvent[field])) {
      changes.push({ field, type: 'MAJOR', oldValue: currentEvent[field], newValue: payload[field] });
      if (changeClass === 'MINOR') changeClass = 'MAJOR';
    }
  }

  // Check sessions
  if (Array.isArray(payload.sessions)) {
    // If sessions changed in date/time/venue and has financial orders -> Critical
    if (hasFinancialOrders) {
      // compare session times
      const currentSessions = currentEvent.sessions || [];
      const sessionMap = new Map(currentSessions.map((s) => [s.id, s]));
      for (const s of payload.sessions) {
        if (s.id && sessionMap.has(s.id)) {
          const old = sessionMap.get(s.id);
          if (
            new Date(s.start_time).getTime() !== new Date(old.start_time).getTime() ||
            new Date(s.end_time).getTime() !== new Date(old.end_time).getTime() ||
            (s.venue_id && String(s.venue_id) !== String(old.venue_id))
          ) {
            changes.push({ field: `session_${s.id}`, type: 'CRITICAL', oldValue: old, newValue: s });
            changeClass = 'CRITICAL';
          }
        } else if (!s.id) {
          changes.push({ field: 'sessions_added', type: 'MAJOR', newValue: s });
          if (changeClass === 'MINOR') changeClass = 'MAJOR';
        }
      }
    } else {
      changes.push({ field: 'sessions', type: 'MAJOR' });
      if (changeClass === 'MINOR') changeClass = 'MAJOR';
    }
  }

  return { changeClass, changes };
}

module.exports = {
  SALES_BLOCK_REASONS,
  getActiveSalesBlocks,
  isSalesPaused,
  addSalesBlock,
  releaseSalesBlock,
  computeSalesStatus,
  appendAuditTrail,
  calculateMinQuota,
  classifyEventChanges,
};
