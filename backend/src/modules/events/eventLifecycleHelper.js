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
  const activeEventBlocks = active.filter(
    (b) => !(b.metadata?.scope === 'SPECIFIC' && b.metadata?.ticket_type_id) && !(b.metadata?.scope === 'SEATS')
  );
  return activeEventBlocks.length > 0;
}

/**
 * Adds a sales block idempotently (BR-SB-03)
 */
function addSalesBlock(currentBlocks, { reason, source, createdBy, metadata = {} }) {
  const blocks = Array.isArray(currentBlocks) ? [...currentBlocks] : [];
  const isSpecific = metadata?.scope === 'SPECIFIC' && metadata?.ticket_type_id;
  const existingActive = blocks.find((b) => {
    if (b.reason !== reason || b.released_at) return false;
    const bSpecific = b.metadata?.scope === 'SPECIFIC' && b.metadata?.ticket_type_id;
    if (isSpecific) {
      return bSpecific && String(b.metadata.ticket_type_id) === String(metadata.ticket_type_id);
    }
    return !bSpecific;
  });
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
  const activeEventBlocks = active.filter(
    (b) => !(b.metadata?.scope === 'SPECIFIC' && b.metadata?.ticket_type_id) && !(b.metadata?.scope === 'SEATS')
  );
  if (activeEventBlocks.length > 0) {
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

function parseJsonSafe(val, fallback = {}) {
  if (!val) return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return typeof val === 'object' ? val : fallback;
}

function normalizeRefundPolicyCore(policy) {
  const p = parseJsonSafe(policy, {});
  const allowRefund = Boolean(p.allow_refund ?? p.allow_refunds);
  const rules = allowRefund && Array.isArray(p.refund_rules)
    ? p.refund_rules
        .map((r) => ({
          days_before: Number(r?.days_before || 0),
          refund_rate: Number(r?.refund_rate ?? r?.percentage ?? 0),
        }))
        .sort((a, b) => b.days_before - a.days_before)
    : [];
  return {
    allow_refund: allowRefund,
    refund_rules: rules,
    refund_notes: typeof p.refund_notes === 'string' ? p.refund_notes.trim() : '',
    deadline_days: p.deadline_days !== undefined && p.deadline_days !== null ? Number(p.deadline_days) : null,
    policy_file_url: p.policy_file_url || null,
    policy_file_name: p.policy_file_name || null,
  };
}

function normalizePermitFilesList(policyOrPermits) {
  const p = parseJsonSafe(policyOrPermits, {});
  const files = Array.isArray(policyOrPermits)
    ? policyOrPermits
    : Array.isArray(p.permit_files)
      ? p.permit_files
      : [];
  return files
    .filter(Boolean)
    .map((f) => ({
      id: f.id || null,
      url: f.url || f.file_url || null,
      name: f.name || f.file_name || null,
      size: f.size ? Number(f.size) : null,
      type: f.type || f.mime_type || null,
    }));
}

function normalizeSeatingRulesCore(rules) {
  const r = parseJsonSafe(rules, {});
  return {
    require_adjacent_seats: Boolean(r.require_adjacent_seats),
    require_same_row: Boolean(r.require_same_row),
    disallow_single_seat_left: Boolean(r.disallow_single_seat_left),
    max_tickets_per_order:
      Number.isInteger(Number(r.max_tickets_per_order)) && Number(r.max_tickets_per_order) > 0
        ? Number(r.max_tickets_per_order)
        : 10,
  };
}

function normalizeTagsList(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t ?? '').trim()).filter(Boolean);
}

/**
 * Classifies an update payload into Minor, Major, or Critical according to Section 4.3 Matrix
 */
function classifyEventChanges(currentEvent, payload, { hasFinancialOrders = false }) {
  const changes = [];
  let changeClass = 'MINOR';

  const criticalFields = ['start_time', 'end_time', 'format'];

  // Check critical fields
  for (const field of criticalFields) {
    if (payload[field] !== undefined) {
      const isTimeField = field === 'start_time' || field === 'end_time';
      const isDiff = isTimeField
        ? new Date(payload[field]).getTime() !== new Date(currentEvent[field]).getTime()
        : String(payload[field]) !== String(currentEvent[field]);
      if (isDiff) {
        if (hasFinancialOrders) {
          changes.push({ field, type: 'CRITICAL', oldValue: currentEvent[field], newValue: payload[field] });
          changeClass = 'CRITICAL';
        } else {
          changes.push({ field, type: 'MAJOR', oldValue: currentEvent[field], newValue: payload[field] });
          if (changeClass !== 'CRITICAL') changeClass = 'MAJOR';
        }
      }
    }
  }

  // Check major scalar fields
  if (payload.title !== undefined && String(payload.title || '').trim() !== String(currentEvent.title || '').trim()) {
    changes.push({ field: 'title', type: 'MAJOR', oldValue: currentEvent.title, newValue: payload.title });
    if (changeClass === 'MINOR') changeClass = 'MAJOR';
  }

  if (
    payload.category_id !== undefined &&
    String(payload.category_id || '') !== String(currentEvent.category_id || '')
  ) {
    changes.push({
      field: 'category_id',
      type: 'MAJOR',
      oldValue: currentEvent.category_id,
      newValue: payload.category_id,
      oldCategoryName: currentEvent.category_name || null,
    });
    if (changeClass === 'MINOR') changeClass = 'MAJOR';
  }

  if (
    payload.additional_terms !== undefined &&
    String(payload.additional_terms || '').trim() !== String(currentEvent.additional_terms || '').trim()
  ) {
    changes.push({
      field: 'additional_terms',
      type: 'MAJOR',
      oldValue: currentEvent.additional_terms || '',
      newValue: payload.additional_terms || '',
    });
    if (changeClass === 'MINOR') changeClass = 'MAJOR';
  }

  // Check refund_policy and permit_files separately using normalized comparison (avoids JSONB key-order false positives)
  if (payload.refund_policy !== undefined) {
    const oldCore = normalizeRefundPolicyCore(currentEvent.refund_policy);
    const newCore = normalizeRefundPolicyCore(payload.refund_policy);
    if (JSON.stringify(oldCore) !== JSON.stringify(newCore)) {
      changes.push({
        field: 'refund_policy',
        type: 'MAJOR',
        oldValue: oldCore,
        newValue: newCore,
      });
      if (changeClass === 'MINOR') changeClass = 'MAJOR';
    }

    const oldPermits = normalizePermitFilesList(currentEvent.refund_policy);
    const newPermits = normalizePermitFilesList(payload.refund_policy);
    if (
      JSON.stringify(oldPermits.map((p) => `${p.url || ''}__${p.name || ''}`)) !==
      JSON.stringify(newPermits.map((p) => `${p.url || ''}__${p.name || ''}`))
    ) {
      changes.push({
        field: 'permit_files',
        type: 'MAJOR',
        oldValue: oldPermits,
        newValue: newPermits,
      });
      if (changeClass === 'MINOR') changeClass = 'MAJOR';
    }
  }

  // Check informational / content / setting fields (classified as MINOR per Section 4.3, tracked in changes for diff review)
  if (
    payload.short_description !== undefined &&
    String(payload.short_description || '').trim() !== String(currentEvent.short_description || '').trim()
  ) {
    changes.push({
      field: 'short_description',
      type: 'MINOR',
      oldValue: currentEvent.short_description || '',
      newValue: payload.short_description || '',
    });
  }

  if (
    payload.description !== undefined &&
    String(payload.description || '').trim() !== String(currentEvent.description || '').trim()
  ) {
    changes.push({
      field: 'description',
      type: 'MINOR',
      oldValue: currentEvent.description || '',
      newValue: payload.description || '',
    });
  }

  if (payload.tags !== undefined) {
    const oldTags = normalizeTagsList(currentEvent.tags);
    const newTags = normalizeTagsList(payload.tags);
    if (JSON.stringify(oldTags) !== JSON.stringify(newTags)) {
      changes.push({
        field: 'tags',
        type: 'MINOR',
        oldValue: oldTags,
        newValue: newTags,
      });
    }
  }

  if (
    payload.thumbnail_url !== undefined &&
    String(payload.thumbnail_url || '') !== String(currentEvent.thumbnail_url || '')
  ) {
    changes.push({
      field: 'thumbnail_url',
      type: 'MINOR',
      oldValue: currentEvent.thumbnail_url || null,
      newValue: payload.thumbnail_url || null,
    });
  }

  if (
    payload.banner_url !== undefined &&
    String(payload.banner_url || '') !== String(currentEvent.banner_url || '')
  ) {
    changes.push({
      field: 'banner_url',
      type: 'MINOR',
      oldValue: currentEvent.banner_url || null,
      newValue: payload.banner_url || null,
    });
  }

  if (
    payload.visibility !== undefined &&
    String(payload.visibility || '') !== String(currentEvent.visibility || '')
  ) {
    changes.push({
      field: 'visibility',
      type: 'MINOR',
      oldValue: currentEvent.visibility || 'PUBLIC',
      newValue: payload.visibility || 'PUBLIC',
    });
  }

  if (
    payload.require_attendee_info !== undefined &&
    Boolean(payload.require_attendee_info) !== Boolean(currentEvent.require_attendee_info)
  ) {
    changes.push({
      field: 'require_attendee_info',
      type: 'MINOR',
      oldValue: Boolean(currentEvent.require_attendee_info),
      newValue: Boolean(payload.require_attendee_info),
    });
  }

  if (payload.seating_rules !== undefined) {
    const oldRules = normalizeSeatingRulesCore(currentEvent.seating_rules);
    const newRules = normalizeSeatingRulesCore(payload.seating_rules);
    if (JSON.stringify(oldRules) !== JSON.stringify(newRules)) {
      changes.push({
        field: 'seating_rules',
        type: 'MINOR',
        oldValue: oldRules,
        newValue: newRules,
      });
    }
  }

  // Check sessions
  if (Array.isArray(payload.sessions)) {
    const currentSessions = currentEvent.sessions || [];
    const sessionMap = new Map(currentSessions.map((s) => [s.id, s]));

    for (const s of payload.sessions) {
      if (s.id && sessionMap.has(s.id)) {
        const old = sessionMap.get(s.id);
        const timeOrVenueChanged =
          new Date(s.start_time).getTime() !== new Date(old.start_time).getTime() ||
          new Date(s.end_time).getTime() !== new Date(old.end_time).getTime() ||
          (s.venue_id && String(s.venue_id) !== String(old.venue_id));
        const nameChanged = s.session_name && s.session_name !== old.session_name;

        if (timeOrVenueChanged) {
          if (hasFinancialOrders) {
            changes.push({ field: `session_${s.id}`, type: 'CRITICAL', oldValue: old, newValue: s });
            changeClass = 'CRITICAL';
          } else {
            changes.push({ field: `session_${s.id}`, type: 'MAJOR', oldValue: old, newValue: s });
            if (changeClass !== 'CRITICAL') changeClass = 'MAJOR';
          }
        } else if (nameChanged) {
          changes.push({ field: `session_${s.id}_name`, type: 'MAJOR', oldValue: old.session_name, newValue: s.session_name });
          if (changeClass === 'MINOR') changeClass = 'MAJOR';
        }
      } else if (!s.id) {
        changes.push({ field: 'sessions_added', type: 'MAJOR', newValue: s });
        if (changeClass === 'MINOR') changeClass = 'MAJOR';
      }
    }

    // Check for removed sessions
    const payloadSessionIds = new Set(payload.sessions.filter((s) => s.id).map((s) => s.id));
    for (const old of currentSessions) {
      if (!payloadSessionIds.has(old.id)) {
        changes.push({ field: 'session_removed', type: hasFinancialOrders ? 'CRITICAL' : 'MAJOR', oldValue: old });
        if (hasFinancialOrders) changeClass = 'CRITICAL';
        else if (changeClass === 'MINOR') changeClass = 'MAJOR';
      }
    }
  }

  // Check ticket_types
  if (Array.isArray(payload.ticket_types)) {
    const currentTickets = currentEvent.ticket_types || [];
    const ticketMap = new Map(currentTickets.map((t) => [t.id, t]));

    for (const tt of payload.ticket_types) {
      if (tt.id && ticketMap.has(tt.id)) {
        const old = ticketMap.get(tt.id);
        const priceChanged = tt.price !== undefined && Number(tt.price) !== Number(old.price);
        const qtyChanged = tt.quantity !== undefined && Number(tt.quantity) !== Number(old.quantity);
        const nameChanged = tt.name !== undefined && tt.name.trim() !== (old.name || '').trim();
        const descChanged = tt.description !== undefined && (tt.description || '').trim() !== (old.description || '').trim();

        if (priceChanged || qtyChanged || nameChanged || descChanged) {
          changes.push({
            field: 'ticket_type',
            type: 'MAJOR',
            ticket_id: tt.id,
            ticket_name: tt.name || old.name,
            event_session_id: tt.event_session_id || old.event_session_id || null,
            priceChanged,
            qtyChanged,
            nameChanged,
            descChanged,
            oldPrice: Number(old.price),
            newPrice: tt.price !== undefined ? Number(tt.price) : Number(old.price),
            oldQuantity: Number(old.quantity),
            newQuantity: tt.quantity !== undefined ? Number(tt.quantity) : Number(old.quantity),
            oldValue: {
              name: old.name,
              price: Number(old.price),
              quantity: Number(old.quantity),
              description: old.description,
            },
            newValue: {
              name: tt.name !== undefined ? tt.name : old.name,
              price: tt.price !== undefined ? Number(tt.price) : Number(old.price),
              quantity: tt.quantity !== undefined ? Number(tt.quantity) : Number(old.quantity),
              description: tt.description !== undefined ? tt.description : old.description,
            },
          });
          if (changeClass === 'MINOR') changeClass = 'MAJOR';
        }
      } else if (!tt.id) {
        changes.push({
          field: 'ticket_added',
          type: 'MAJOR',
          ticket_name: tt.name,
          event_session_id: tt.event_session_id || null,
          newValue: {
            name: tt.name,
            price: Number(tt.price || 0),
            quantity: Number(tt.quantity || 0),
            description: tt.description || null,
          },
        });
        if (changeClass === 'MINOR') changeClass = 'MAJOR';
      }
    }

    // Check for removed ticket types
    const payloadTicketIds = new Set(payload.ticket_types.filter((t) => t.id).map((t) => t.id));
    for (const old of currentTickets) {
      if (!payloadTicketIds.has(old.id)) {
        changes.push({
          field: 'ticket_removed',
          type: 'MAJOR',
          ticket_id: old.id,
          ticket_name: old.name,
          event_session_id: old.event_session_id || null,
          oldValue: {
            id: old.id,
            name: old.name,
            price: Number(old.price),
            quantity: Number(old.quantity),
          },
        });
        if (changeClass === 'MINOR') changeClass = 'MAJOR';
      }
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
