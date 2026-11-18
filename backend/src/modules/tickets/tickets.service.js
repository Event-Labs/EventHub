const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const ticketsRepository = require('./tickets.repository');
const { buildUniversalTicketSvg } = require('./ticketSvgGenerator');

function buildVenue(row) {
  return {
    id: row.venue_id,
    name: row.venue_name,
    address_line: row.venue_address,
    ward: row.venue_ward,
    district: row.venue_district,
    city: row.venue_city,
  };
}

function buildSeat(row) {
  if (!row.session_seat_id) return null;
  return {
    session_seat_id: row.session_seat_id,
    session_seat_status: row.session_seat_status,
    seat_id: row.seat_id,
    seat_map_id: row.seat_map_id,
    row_label: row.row_label,
    seat_number: row.seat_number,
    x_position: row.x_position,
    y_position: row.y_position,
    is_disabled: row.is_disabled,
    label: [row.row_label, row.seat_number].filter(Boolean).join(''),
  };
}

function effectiveTicketStatus(row) {
  if (row.event_status === 'CANCELLED' && !['REFUNDED', 'CANCELLED'].includes(row.status)) {
    return 'REFUND_REQUESTED';
  }
  if (row.status !== 'VALID') return row.status;
  const endTime = row.session_end_time || row.event_end_time;
  return endTime && new Date(endTime).getTime() < Date.now() ? 'EXPIRED' : row.status;
}

function buildTicketPayload(row) {
  const status = effectiveTicketStatus(row);
  return {
    id: row.id,
    ticket_code: row.ticket_code,
    qr_code: row.qr_code || row.ticket_code,
    status,
    check_in_status: status === 'EXPIRED' ? 'EXPIRED' : row.checked_in_at ? 'CHECKED_IN' : 'NOT_CHECKED_IN',
    attendee_name: row.attendee_name,
    attendee_email: row.attendee_email,
    created_at: row.created_at,
    checked_in_at: row.checked_in_at,
    ticket_source: row.ticket_source || 'STANDARD',
    original_price: row.original_price !== undefined && row.original_price !== null ? Number(row.original_price) : Number(row.ticket_type_price || 0),
    discount_allocated: row.discount_allocated !== undefined && row.discount_allocated !== null ? Number(row.discount_allocated) : 0,
    payable_price: row.payable_price !== undefined && row.payable_price !== null ? Number(row.payable_price) : Number(row.order_item_final_price || 0),
    event: {
      id: row.event_id,
      status: row.event_status,
      title: row.event_title,
      slug: row.event_slug,
      short_description: row.event_short_description,
      start_time: row.event_start_time,
      end_time: row.event_end_time,
      thumbnail_url: row.event_thumbnail_url,
      banner_url: row.event_banner_url || row.event_thumbnail_url,
      require_attendee_info: Boolean(row.require_attendee_info),
      refund_policy: typeof row.event_refund_policy === 'string' ? JSON.parse(row.event_refund_policy) : (row.event_refund_policy || {}),
    },
    session: {
      id: row.event_session_id,
      name: row.session_name,
      start_time: row.session_start_time,
      end_time: row.session_end_time,
      checkin_start_time: row.checkin_start_time,
    },
    venue: buildVenue(row),
    ticket_type: {
      id: row.ticket_type_id,
      name: row.ticket_type_name,
      price: Number(row.ticket_type_price),
    },
    order_item: (() => {
      const unitPrice = Number(row.order_item_unit_price || row.ticket_type_price || 0);
      const subtotal = Number(row.order_subtotal || 0);
      const orderDiscount = Number(row.order_discount_amount || 0);
      const totalAmount = Number(row.total_amount || 0);
      let ticketDiscount = 0;
      let actualPaidPrice = unitPrice;

      if (subtotal > 0 && orderDiscount > 0) {
        ticketDiscount = Math.round((unitPrice / subtotal) * orderDiscount);
        actualPaidPrice = Math.max(0, unitPrice - ticketDiscount);
      } else if (totalAmount > 0 && totalAmount < unitPrice) {
        actualPaidPrice = totalAmount;
        ticketDiscount = Math.max(0, unitPrice - actualPaidPrice);
      }
      if (totalAmount > 0 && actualPaidPrice > totalAmount) {
        actualPaidPrice = totalAmount;
      }

      return {
        id: row.order_item_id,
        quantity: row.order_item_quantity ? Number(row.order_item_quantity) : undefined,
        unit_price: row.order_item_unit_price ? Number(row.order_item_unit_price) : undefined,
        final_price: row.order_item_final_price ? Number(row.order_item_final_price) : undefined,
        actual_price: actualPaidPrice,
        discount_amount: ticketDiscount,
        session_seat_id: row.order_item_session_seat_id,
      };
    })(),
    seat: buildSeat(row),
    order: {
      id: row.order_id,
      order_code: row.order_code,
      status: row.order_status,
      buyer_name: row.buyer_name,
      buyer_email: row.buyer_email,
      subtotal: row.order_subtotal !== undefined && row.order_subtotal !== null ? Number(row.order_subtotal) : undefined,
      discount_amount: row.order_discount_amount !== undefined && row.order_discount_amount !== null ? Number(row.order_discount_amount) : 0,
      platform_fee: row.order_platform_fee !== undefined && row.order_platform_fee !== null ? Number(row.order_platform_fee) : 0,
      total_amount: row.total_amount ? Number(row.total_amount) : undefined,
      created_at: row.order_created_at,
    },
    payment: row.payment_status
      ? {
          transaction_code: row.transaction_code,
          method: row.payment_method,
          provider: row.provider,
          status: row.payment_status,
          paid_at: row.paid_at,
        }
      : null,
  };
}

function buildStaffTicketPayload(row) {
  const status = effectiveTicketStatus(row);
  return {
    id: row.id,
    ticket_code: row.ticket_code,
    qr_code: row.qr_code || row.ticket_code,
    status,
    attendee_name: row.attendee_name || row.buyer_name,
    raw_attendee_name: row.attendee_name || null,
    attendee_email: row.attendee_email || row.buyer_email,
    raw_attendee_email: row.attendee_email || null,
    buyer_name: row.buyer_name || null,
    buyer_email: row.buyer_email || null,
    buyer_phone: row.buyer_phone || null,
    checked_in_at: row.checked_in_at,
    checkin_method: row.checkin_method || null,
    checked_in_gate_id: row.checked_in_gate_id || null,
    checked_in_gate: row.checked_in_gate || null,
    checked_in_by: row.checked_in_by_id
      ? {
          id: row.checked_in_by_id,
          name: row.checked_in_by_name,
          email: row.checked_in_by_email,
          source: 'STAFF',
        }
      : row.checked_in_device_id
        ? {
            id: row.checked_in_device_id,
            name: row.checked_in_device_name || row.checked_in_device_mac || 'Thiết bị IoT',
            email: null,
            source: 'IOT',
          }
        : null,
    event: {
      id: row.event_id,
      title: row.event_title,
      slug: row.event_slug,
      start_time: row.event_start_time,
      end_time: row.event_end_time,
    },
    session: {
      id: row.event_session_id,
      name: row.session_name,
      start_time: row.session_start_time,
      end_time: row.session_end_time,
      checkin_start_time: row.checkin_start_time || row.session_start_time,
    },
    ticket_type: {
      id: row.ticket_type_id,
      name: row.ticket_type_name,
      price: row.ticket_type_price ? Number(row.ticket_type_price) : undefined,
    },
    seat: row.session_seat_id
      ? {
          session_seat_id: row.session_seat_id,
          seat_id: row.seat_id,
          row_label: row.row_label,
          seat_number: row.seat_number,
          label: [row.row_label, row.seat_number].filter(Boolean).join(''),
        }
      : null,
    order: {
      id: row.order_id,
      order_code: row.order_code,
      status: row.order_status,
      buyer_name: row.buyer_name,
      buyer_email: row.buyer_email,
      buyer_phone: row.buyer_phone,
    },
    buyer: {
      name: row.buyer_name || row.attendee_name,
      email: row.buyer_email || row.attendee_email,
      phone: row.buyer_phone,
    },
  };
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSearchPayload(payload = {}) {
  return {
    eventId: trimString(payload.eventId || payload.event_id),
    ticketCode: trimString(payload.ticketCode || payload.ticket_code),
    buyerName: trimString(payload.buyerName || payload.buyer_name || payload.name || payload.attendeeName || payload.attendee_name),
    buyerEmail: trimString(payload.buyerEmail || payload.buyer_email || payload.email || payload.attendeeEmail || payload.attendee_email),
    buyerPhone: trimString(payload.buyerPhone || payload.buyer_phone || payload.phone),
  };
}

function extractQrTicketPayload(payload = {}) {
  const raw =
    payload.ticketId ||
    payload.ticket_id ||
    payload.ticketCode ||
    payload.ticket_code ||
    payload.qrCode ||
    payload.qr_code ||
    payload.code ||
    payload.raw ||
    '';

  if (!raw || typeof raw !== 'string') {
    return { ticketRef: '' };
  }

  const value = raw.trim();
  if (!value) return { ticketRef: '' };

  try {
    const parsed = JSON.parse(value);
    return {
      type: trimString(parsed.type),
      ticketRef: trimString(
        parsed.ticket_code ||
          parsed.ticketCode ||
          parsed.code ||
          parsed.t ||
          parsed.ticket_id ||
          parsed.ticketId ||
          parsed.qr_code ||
          parsed.qrCode ||
          parsed.id,
      ),
      eventId: trimString(parsed.event_id || parsed.eventId),
      sessionId: trimString(parsed.session_id || parsed.sessionId),
      raw: value,
    };
  } catch {
    return { ticketRef: value, raw: value };
  }
}

function assertQrMatchesTicket(qrPayload, ticket) {
  if (qrPayload.type && !['EVENTHUB_TICKET', 'EH_TICKET', 'EHT', 'EH'].includes(qrPayload.type)) {
    throw new AppError('QR không đúng định dạng vé EventHub.', 400, ErrorCodes.INVALID_INPUT);
  }

  if (qrPayload.eventId && ticket.event_id && qrPayload.eventId !== ticket.event_id) {
    throw new AppError('QR không khớp sự kiện của vé.', 400, ErrorCodes.INVALID_INPUT);
  }

  if (qrPayload.sessionId && ticket.event_session_id && qrPayload.sessionId !== ticket.event_session_id) {
    throw new AppError('QR không khớp phiên của vé.', 400, ErrorCodes.INVALID_INPUT);
  }
}

function assertCheckInOpen(ticket) {
  const checkinStartTime = ticket?.checkin_start_time || ticket?.session_start_time;
  if (checkinStartTime && new Date(checkinStartTime).getTime() > Date.now()) {
    throw new AppError(
      'Vé này chưa đến giờ tham gia.',
      400,
      ErrorCodes.INVALID_INPUT,
    );
  }
}

function invalidTicketMessage(status) {
  if (status === 'USED') return 'Vé này đã được sử dụng.';
  if (status === 'CANCELLED') return 'Vé đã bị hủy hoặc không còn hợp lệ.';
  if (status === 'REFUND_PENDING') return 'Vé đang trong quá trình xử lý hoàn tiền, không thể check-in.';
  if (status === 'REFUNDED') return 'Vé đã được hoàn tiền, không còn hợp lệ để check-in.';
  return 'Vé không hợp lệ để check-in.';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatForTicket(value) {
  if (!value) return 'N/A';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

function buildQrPayload(ticket) {
  return JSON.stringify({
    type: 'EVENTHUB_TICKET',
    ticket_code: ticket.ticket_code || ticket.qr_code || ticket.id,
  });
}

function qrImageUrl(ticket, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=2&data=${encodeURIComponent(buildQrPayload(ticket))}`;
}

function buildDownloadSvg(ticket) {
  const qrUrl = qrImageUrl(ticket, 220);
  return buildUniversalTicketSvg(ticket, qrUrl);
}

function buildDeviceTicketDetails(ticket, device = null) {
  if (!ticket) return {};
  const seatLabel = [ticket.row_label, ticket.seat_number].filter(Boolean).join('') || null;
  const buyerName = ticket.attendee_name || ticket.buyer_name || null;
  const buyerEmail = ticket.attendee_email || ticket.buyer_email || null;
  const buyerPhone = ticket.buyer_phone || null;
  const checkedInBy =
    ticket.checked_in_by_name
    || ticket.checked_in_by_email
    || (ticket.checked_in_device_id
      ? (device?.id === ticket.checked_in_device_id && device?.name ? device.name : 'Thiết bị IoT')
      : null);

  const details = {};
  if (ticket.event_title) details.event_name = ticket.event_title;
  if (buyerName) details.buyer_name = buyerName;
  if (buyerEmail) details.buyer_email = buyerEmail;
  if (buyerPhone) details.buyer_phone = buyerPhone;
  if (ticket.ticket_type_name) details.ticket_type_name = ticket.ticket_type_name;
  if (seatLabel) details.seat_label = seatLabel;
  if (ticket.checked_in_at) details.checked_in_at = ticket.checked_in_at;
  if (checkedInBy) details.checked_in_by = checkedInBy;
  return details;
}

function mapDeviceCheckInState(state, ticket = null, device = null) {
  const ticketCode = ticket?.ticket_code || null;
  const details = buildDeviceTicketDetails(ticket, device);

  switch (state) {
    case 'NOT_FOUND':
      return { httpStatus: 404, success: false, result: 'NOT_FOUND', message: 'Khong tim thay ve' };
    case 'WRONG_EVENT':
      return {
        httpStatus: 403,
        success: false,
        result: 'WRONG_EVENT',
        ticket_code: ticketCode,
        ...details,
        message: 'Ve khong thuoc su kien nay',
      };
    case 'ALREADY_CHECKED_IN':
      return {
        httpStatus: 409,
        success: false,
        result: 'USED',
        ticket_code: ticketCode,
        ...details,
        message: 'Ve da duoc su dung',
      };
    case 'SESSION_CANCELLED':
      return {
        httpStatus: 400,
        success: false,
        result: 'CANCELLED',
        ticket_code: ticketCode,
        ...details,
        message: 'Su kien hoac suat dien da bi huy',
      };
    case 'TICKET_REFUND_IN_PROGRESS':
      return {
        httpStatus: 400,
        success: false,
        result: 'REFUND_IN_PROGRESS',
        ticket_code: ticketCode,
        ...details,
        message: 'Ve dang xu ly hoan tien',
      };
    case 'INVALID_ORDER':
      return {
        httpStatus: 400,
        success: false,
        result: 'INVALID_ORDER',
        ticket_code: ticketCode,
        ...details,
        message: 'Ve chua thanh toan',
      };
    case 'CHECKIN_NOT_OPEN':
      return {
        httpStatus: 400,
        success: false,
        result: 'NOT_OPEN',
        ticket_code: ticketCode,
        ...details,
        message: 'Chua den gio check-in',
      };
    case 'EXPIRED':
      return {
        httpStatus: 400,
        success: false,
        result: 'EXPIRED',
        ticket_code: ticketCode,
        ...details,
        message: 'Ve da het han',
      };
    case 'TICKET_NOT_VALID':
    case 'INVALID_STATUS':
    default:
      return {
        httpStatus: 400,
        success: false,
        result: 'INVALID',
        ticket_code: ticketCode,
        ...details,
        message: 'Ve khong hop le',
      };
  }
}

class TicketsService {
  async getMyTickets(userId, filters = {}) {
    const allowedStatuses = ['VALID', 'USED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'REFUND_PENDING', 'REFUND_REQUESTED'];
    const status = filters.status?.toUpperCase();

    if (status && status !== 'ALL' && !allowedStatuses.includes(status)) {
      throw new AppError('Invalid ticket status', 400, ErrorCodes.INVALID_INPUT);
    }

    const repositoryStatus = (!status || status === 'ALL' || ['EXPIRED', 'REFUND_PENDING', 'REFUND_REQUESTED'].includes(status)) ? undefined : status;
    const tickets = (await ticketsRepository.findTicketsByUserId(userId, { status: repositoryStatus }))
      .map(buildTicketPayload);

    if (status === 'VALID' || status === 'EXPIRED') {
      return tickets.filter((ticket) => ticket.status === status);
    }
    if (status === 'REFUND_PENDING' || status === 'REFUND_REQUESTED') {
      return tickets.filter((ticket) => ticket.status === 'REFUND_PENDING' || ticket.status === 'REFUND_REQUESTED');
    }
    return tickets;
  }

  async getTicketDetail(userId, ticketId) {
    const row = await ticketsRepository.findTicketByIdAndUserId(ticketId, userId);
    if (!row) {
      throw new AppError('Ticket not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    return buildTicketPayload(row);
  }

  async generateTicketDownload(userId, ticketId) {
    const ticket = await this.getTicketDetail(userId, ticketId);
    return {
      fileName: `${ticket.ticket_code}.svg`,
      contentType: 'image/svg+xml; charset=utf-8',
      content: buildDownloadSvg(ticket),
    };
  }

  async staffSearchTickets(staffId, payload = {}) {
    const filters = normalizeSearchPayload(payload);

    if (!filters.eventId) {
      throw new AppError('Vui lòng chọn sự kiện trước khi tải danh sách vé.', 400, ErrorCodes.INVALID_INPUT);
    }

    const rows = await ticketsRepository.searchStaffTickets(staffId, filters);
    return {
      count: rows.length,
      tickets: rows.map(buildStaffTicketPayload),
    };
  }

  async getStaffTicket(staffId, ticketId) {
    const ticket = await ticketsRepository.findTicketAccessForStaff(ticketId, staffId);
    if (!ticket) {
      throw new AppError('Không tìm thấy vé.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    if (!ticket.has_staff_access) {
      throw new AppError('Nhân sự không có quyền xem vé này.', 403, ErrorCodes.AUTH_FORBIDDEN);
    }
    return buildStaffTicketPayload(ticket);
  }

  async recordStaffScanLog(
    staffId,
    {
      ticket = null,
      eventId = null,
      ticketCode = null,
      qrCodeRaw = null,
      action = 'verify',
      result,
      success = false,
      message = null,
      forceAssignedEvent = false,
    } = {},
  ) {
    if (!staffId || !result) return;
    try {
      const preferredEventId = forceAssignedEvent
        ? (eventId || null)
        : (eventId || (ticket?.has_staff_access === false ? null : ticket?.event_id) || null);

      let gateId = ticket?.checked_in_gate_id || ticket?.staff_gate_id || null;
      let gateName = ticket?.checked_in_gate || ticket?.staff_gate_name || null;
      let resolvedEventId = forceAssignedEvent ? null : preferredEventId;

      if (!resolvedEventId || (!gateId && !gateName)) {
        const ctx = await ticketsRepository.findStaffActiveGateContext(staffId, preferredEventId);
        if (ctx) {
          if (!resolvedEventId) resolvedEventId = ctx.event_id;
          if (!gateId) gateId = ctx.gate_id || null;
          if (!gateName) gateName = ctx.gate_name || null;
        }
      }

      if (!resolvedEventId && ticket?.event_id && !forceAssignedEvent) {
        resolvedEventId = ticket.event_id;
      }

      await ticketsRepository.insertStaffScanLog({
        staffId,
        eventId: resolvedEventId,
        ticketId: ticket?.id || null,
        ticketCode: ticket?.ticket_code || ticketCode || null,
        qrCodeRaw: qrCodeRaw || null,
        action,
        result,
        success,
        message,
        attendeeName: ticket?.attendee_name || ticket?.buyer_name || null,
        gateId,
        gateName,
      });
    } catch (logErr) {
      // Never block Staff check-in/verify response because of audit log persistence failure
      console.error('[TicketsService] Failed to persist staff scan log:', logErr.message);
    }
  }

  async staffVerifyTicketByQr(staffId, payload = {}, { skipLog = false } = {}) {
    const qrPayload = extractQrTicketPayload(payload);
    const qrCodeRaw = qrPayload.raw || qrPayload.ticketRef || null;

    if (!qrPayload.ticketRef) {
      await this.recordStaffScanLog(staffId, {
        qrCodeRaw,
        action: 'verify',
        result: 'INVALID_QR',
        success: false,
        message: 'QR không hợp lệ.',
      });
      throw new AppError('QR không hợp lệ.', 400, ErrorCodes.INVALID_INPUT);
    }

    const ticket = await ticketsRepository.findTicketAccessForStaff(qrPayload.ticketRef, staffId);
    if (!ticket) {
      await this.recordStaffScanLog(staffId, {
        ticketCode: qrPayload.ticketRef,
        qrCodeRaw,
        action: 'verify',
        result: 'NOT_FOUND',
        success: false,
        message: 'Không tìm thấy vé.',
      });
      throw new AppError('Không tìm thấy vé.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (!ticket.has_staff_access) {
      await this.recordStaffScanLog(staffId, {
        ticket,
        qrCodeRaw,
        action: 'verify',
        result: 'WRONG_EVENT',
        success: false,
        message: 'Vé thuộc sự kiện khác hoặc nhân sự không có quyền check-in vé này.',
        forceAssignedEvent: true,
      });
      throw new AppError('Vé thuộc sự kiện khác hoặc nhân sự không có quyền check-in vé này.', 403, ErrorCodes.AUTH_FORBIDDEN);
    }

    try {
      assertCheckInOpen(ticket);
    } catch (err) {
      await this.recordStaffScanLog(staffId, {
        ticket,
        qrCodeRaw,
        action: 'verify',
        result: 'NOT_OPEN',
        success: false,
        message: err.message,
      });
      throw err;
    }

    try {
      assertQrMatchesTicket(qrPayload, ticket);
    } catch (err) {
      await this.recordStaffScanLog(staffId, {
        ticket,
        qrCodeRaw,
        action: 'verify',
        result: 'INVALID_QR',
        success: false,
        message: err.message,
      });
      throw err;
    }

    const staffTicketPayload = buildStaffTicketPayload(ticket);
    if (!skipLog) {
      const status = staffTicketPayload.status;
      if (status === 'USED') {
        await this.recordStaffScanLog(staffId, {
          ticket,
          qrCodeRaw,
          action: 'verify',
          result: 'USED',
          success: false,
          message: 'Vé đã được sử dụng.',
        });
      } else if (status === 'CANCELLED') {
        await this.recordStaffScanLog(staffId, {
          ticket,
          qrCodeRaw,
          action: 'verify',
          result: 'CANCELLED',
          success: false,
          message: invalidTicketMessage(status),
        });
      } else if (['REFUND_REQUESTED', 'REFUND_PENDING', 'REFUNDED'].includes(status)) {
        await this.recordStaffScanLog(staffId, {
          ticket,
          qrCodeRaw,
          action: 'verify',
          result: 'REFUND_IN_PROGRESS',
          success: false,
          message: invalidTicketMessage(status),
        });
      } else if (status === 'EXPIRED') {
        await this.recordStaffScanLog(staffId, {
          ticket,
          qrCodeRaw,
          action: 'verify',
          result: 'EXPIRED',
          success: false,
          message: 'Vé đã hết hạn.',
        });
      } else if (status !== 'VALID') {
        await this.recordStaffScanLog(staffId, {
          ticket,
          qrCodeRaw,
          action: 'verify',
          result: 'INVALID',
          success: false,
          message: invalidTicketMessage(status),
        });
      } else {
        await this.recordStaffScanLog(staffId, {
          ticket,
          qrCodeRaw,
          action: 'verify',
          result: 'VERIFIED',
          success: true,
          message: 'Vé hợp lệ',
        });
      }
    }

    return staffTicketPayload;
  }

  async staffCheckInByQr(staffId, payload = {}) {
    const qrPayload = extractQrTicketPayload(payload);
    const ticket = await this.staffVerifyTicketByQr(staffId, payload, { skipLog: true });
    return this.staffCheckInTicket(staffId, ticket.id, 'QR', {
      qrCodeRaw: qrPayload.raw || qrPayload.ticketRef || null,
    });
  }

  async staffCheckInTicket(staffId, ticketId, method = 'MANUAL', { qrCodeRaw = null } = {}) {
    const result = await ticketsRepository.checkInTicket(ticketId, staffId, method);
    const action = String(method || 'MANUAL').toLowerCase();

    if (result.state === 'NOT_FOUND') {
      await this.recordStaffScanLog(staffId, {
        ticketCode: ticketId,
        qrCodeRaw,
        action,
        result: 'NOT_FOUND',
        success: false,
        message: 'Không tìm thấy vé.',
      });
      throw new AppError('Không tìm thấy vé.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (result.state === 'FORBIDDEN_ACTION' || result.state === 'FORBIDDEN') {
      await this.recordStaffScanLog(staffId, {
        ticket: result.ticket || null,
        qrCodeRaw,
        action,
        result: 'WRONG_EVENT',
        success: false,
        message: 'Vé thuộc sự kiện khác hoặc nhân viên không được phân công cho sự kiện này.',
        forceAssignedEvent: true,
      });
      throw new AppError('Vé thuộc sự kiện khác hoặc nhân viên không được phân công cho sự kiện này.', 403, ErrorCodes.FORBIDDEN_ACTION);
    }

    if (result.state === 'MANUAL_CHECKIN_NOT_ALLOWED') {
      await this.recordStaffScanLog(staffId, {
        ticket: result.ticket || null,
        qrCodeRaw,
        action,
        result: 'FORBIDDEN',
        success: false,
        message: 'Gói dịch vụ của sự kiện này không hỗ trợ tính năng check-in thủ công.',
      });
      throw new AppError(
        'Gói dịch vụ của sự kiện này không hỗ trợ tính năng check-in thủ công. Vui lòng quét mã QR hoặc liên hệ Ban tổ chức nâng cấp gói.',
        403,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }

    if (result.state === 'SESSION_CANCELLED') {
      await this.recordStaffScanLog(staffId, {
        ticket: result.ticket || null,
        qrCodeRaw,
        action,
        result: 'CANCELLED',
        success: false,
        message: 'Sự kiện hoặc suất diễn đã bị hủy.',
      });
      throw new AppError('Sự kiện hoặc suất diễn đã bị hủy.', 400, ErrorCodes.SESSION_CANCELLED);
    }

    if (result.state === 'TICKET_REFUND_IN_PROGRESS') {
      await this.recordStaffScanLog(staffId, {
        ticket: result.ticket || null,
        qrCodeRaw,
        action,
        result: 'REFUND_IN_PROGRESS',
        success: false,
        message: 'Vé đang trong tiến trình hoàn tiền, không được phép check-in.',
      });
      throw new AppError('Vé đang trong tiến trình hoàn tiền, không được phép check-in.', 400, ErrorCodes.TICKET_REFUND_IN_PROGRESS);
    }

    if (result.state === 'ALREADY_CHECKED_IN') {
      const checkedTime = result.ticket?.checked_in_at ? new Date(result.ticket.checked_in_at).toLocaleTimeString('vi-VN') : '';
      const msg = `Vé đã được check-in trước đó${checkedTime ? ' lúc ' + checkedTime : ''}.`;
      await this.recordStaffScanLog(staffId, {
        ticket: result.ticket || null,
        qrCodeRaw,
        action,
        result: 'USED',
        success: false,
        message: msg,
      });
      throw new AppError(msg, 400, ErrorCodes.ALREADY_CHECKED_IN);
    }

    if (result.state === 'TICKET_NOT_VALID' || result.state === 'INVALID_STATUS') {
      const msg = invalidTicketMessage(result.ticket?.status);
      await this.recordStaffScanLog(staffId, {
        ticket: result.ticket || null,
        qrCodeRaw,
        action,
        result: result.ticket?.status === 'CANCELLED' ? 'CANCELLED' : 'INVALID',
        success: false,
        message: msg,
      });
      throw new AppError(msg, 400, ErrorCodes.TICKET_NOT_VALID);
    }

    if (result.state === 'INVALID_ORDER') {
      await this.recordStaffScanLog(staffId, {
        ticket: result.ticket || null,
        qrCodeRaw,
        action,
        result: 'INVALID_ORDER',
        success: false,
        message: 'Vé chưa được thanh toán hoặc đơn hàng không hợp lệ.',
      });
      throw new AppError('Vé chưa được thanh toán hoặc đơn hàng không hợp lệ.', 400, ErrorCodes.INVALID_INPUT);
    }

    if (result.state === 'CHECKIN_NOT_OPEN') {
      await this.recordStaffScanLog(staffId, {
        ticket: result.ticket || null,
        qrCodeRaw,
        action,
        result: 'NOT_OPEN',
        success: false,
        message: 'Vé này chưa đến giờ tham gia.',
      });
      throw new AppError('Vé này chưa đến giờ tham gia.', 400, ErrorCodes.INVALID_INPUT);
    }

    if (result.state === 'EXPIRED') {
      await this.recordStaffScanLog(staffId, {
        ticket: result.ticket || null,
        qrCodeRaw,
        action,
        result: 'EXPIRED',
        success: false,
        message: 'Vé đã hết hạn.',
      });
      throw new AppError('Vé đã hết hạn.', 400, ErrorCodes.TICKET_NOT_VALID);
    }

    await this.recordStaffScanLog(staffId, {
      ticket: result.ticket || null,
      qrCodeRaw,
      action,
      result: 'OK',
      success: true,
      message: 'Check-in thành công',
    });

    return buildStaffTicketPayload(result.ticket);
  }

  async scanTicketForDevice(device, { qrCode, action = 'auto' } = {}) {
    const withLogMeta = (payload, ticket = null) => ({
      ...payload,
      _logMeta: {
        ticketId: ticket?.id || null,
        eventId: ticket?.event_id || device?.assigned_event_id || null,
        attendeeName: ticket?.attendee_name || ticket?.buyer_name || null,
      },
    });

    if (!device?.assigned_event_id) {
      return withLogMeta({
        httpStatus: 400,
        success: false,
        result: 'NO_EVENT_ASSIGNED',
        message: 'Chua gan su kien',
      });
    }

    const qrPayload = extractQrTicketPayload({ qr_code: qrCode });
    if (
      !qrPayload.ticketRef
      || (qrPayload.type && !['EVENTHUB_TICKET', 'EH_TICKET', 'EHT', 'EH'].includes(qrPayload.type))
    ) {
      return withLogMeta({
        httpStatus: 400,
        success: false,
        result: 'INVALID_QR',
        message: 'Ma QR khong hop le',
      });
    }

    const ticket = await ticketsRepository.findTicketByRef(qrPayload.ticketRef, device.assigned_event_id);
    if (!ticket) {
      return withLogMeta(mapDeviceCheckInState('NOT_FOUND'));
    }

    if (
      ticket.event_id !== device.assigned_event_id
      || (qrPayload.eventId && qrPayload.eventId !== device.assigned_event_id)
    ) {
      return withLogMeta(mapDeviceCheckInState('WRONG_EVENT', ticket, device), ticket);
    }

    if (
      (qrPayload.eventId && ticket.event_id && qrPayload.eventId !== ticket.event_id)
      || (qrPayload.sessionId && ticket.event_session_id && qrPayload.sessionId !== ticket.event_session_id)
    ) {
      return withLogMeta({
        httpStatus: 400,
        success: false,
        result: 'INVALID_QR',
        ticket_code: ticket.ticket_code,
        ...buildDeviceTicketDetails(ticket, device),
        message: 'QR khong khop thong tin ve',
      }, ticket);
    }

    const invalidState = ticketsRepository.validateTicketCheckInState(ticket);
    if (invalidState) {
      return withLogMeta(mapDeviceCheckInState(invalidState, ticket, device), ticket);
    }

    const normalizedAction = action === 'auto'
      ? (device.auto_confirm ? 'checkin' : 'verify')
      : action;

    if (normalizedAction === 'verify') {
      return withLogMeta({
        httpStatus: 200,
        success: true,
        result: 'VERIFIED',
        ticket_code: ticket.ticket_code,
        event_code: ticket.event_slug,
        ...buildDeviceTicketDetails(ticket, device),
        message: 'Ve hop le',
      }, ticket);
    }

    const checkInResult = device.assigned_gate_id || device.assigned_gate
      ? await ticketsRepository.checkInTicketByDevice(
          ticket.id,
          device.id,
          device.assigned_event_id,
          {
            gateId: device.assigned_gate_id || null,
            gateName: device.assigned_gate || null,
          },
        )
      : await ticketsRepository.checkInTicketByDevice(
          ticket.id,
          device.id,
          device.assigned_event_id,
        );

    if (checkInResult.state !== 'CHECKED_IN') {
      const mergedFailureTicket = { ...ticket, ...(checkInResult.ticket || {}) };
      return withLogMeta(
        mapDeviceCheckInState(checkInResult.state, mergedFailureTicket, device),
        mergedFailureTicket,
      );
    }

    const mergedCheckedInTicket = { ...ticket, ...(checkInResult.ticket || {}) };
    return withLogMeta({
      httpStatus: 200,
      success: true,
      result: 'OK',
      ticket_code: mergedCheckedInTicket.ticket_code,
      event_code: mergedCheckedInTicket.event_slug,
      ...buildDeviceTicketDetails(mergedCheckedInTicket, device),
      message: 'Check-in thanh cong',
    }, mergedCheckedInTicket);
  }

  cancelFreeTicket = async (userId, ticketId, reason) => {
    return ticketsRepository.cancelFreeTicket(ticketId, userId, reason);
  };
}

module.exports = new TicketsService();
