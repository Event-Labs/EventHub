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
    attendee_email: row.attendee_email || row.buyer_email,
    checked_in_at: row.checked_in_at,
    checked_in_by: row.checked_in_by_id
      ? {
          id: row.checked_in_by_id,
          name: row.checked_in_by_name,
          email: row.checked_in_by_email,
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
    buyerName: trimString(payload.buyerName || payload.buyer_name),
    buyerEmail: trimString(payload.buyerEmail || payload.buyer_email),
    buyerPhone: trimString(payload.buyerPhone || payload.buyer_phone),
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

class TicketsService {
  async getMyTickets(userId, filters = {}) {
    const allowedStatuses = ['VALID', 'USED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'REFUND_PENDING', 'REFUND_REQUESTED'];
    const status = filters.status?.toUpperCase();

    if (status && status !== 'ALL' && !allowedStatuses.includes(status)) {
      throw new AppError('Invalid ticket status', 400, ErrorCodes.INVALID_INPUT);
    }

    const repositoryStatus = ['EXPIRED', 'REFUND_PENDING', 'REFUND_REQUESTED'].includes(status) ? undefined : status;
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

  async staffVerifyTicketByQr(staffId, payload = {}) {
    const qrPayload = extractQrTicketPayload(payload);
    if (!qrPayload.ticketRef) {
      throw new AppError('QR không hợp lệ.', 400, ErrorCodes.INVALID_INPUT);
    }

    const ticket = await ticketsRepository.findTicketAccessForStaff(qrPayload.ticketRef, staffId);
    if (!ticket) {
      throw new AppError('Không tìm thấy vé.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (!ticket.has_staff_access) {
      throw new AppError('Staff không có quyền check-in vé này.', 403, ErrorCodes.AUTH_FORBIDDEN);
    }

    assertCheckInOpen(ticket);
    assertQrMatchesTicket(qrPayload, ticket);

    return buildStaffTicketPayload(ticket);
  }

  async staffCheckInByQr(staffId, payload = {}) {
    const ticket = await this.staffVerifyTicketByQr(staffId, payload);
    return this.staffCheckInTicket(staffId, ticket.id, 'QR');
  }

  async staffCheckInTicket(staffId, ticketId, method = 'MANUAL') {
    const result = await ticketsRepository.checkInTicket(ticketId, staffId, method);

    if (result.state === 'NOT_FOUND') {
      throw new AppError('Không tìm thấy vé.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (result.state === 'FORBIDDEN_ACTION' || result.state === 'FORBIDDEN') {
      throw new AppError('Nhân viên không được phân công cho sự kiện này.', 403, ErrorCodes.FORBIDDEN_ACTION);
    }

    if (result.state === 'SESSION_CANCELLED') {
      throw new AppError('Sự kiện hoặc suất diễn đã bị hủy.', 400, ErrorCodes.SESSION_CANCELLED);
    }

    if (result.state === 'TICKET_REFUND_IN_PROGRESS') {
      throw new AppError('Vé đang trong tiến trình hoàn tiền, không được phép check-in.', 400, ErrorCodes.TICKET_REFUND_IN_PROGRESS);
    }

    if (result.state === 'ALREADY_CHECKED_IN') {
      const checkedTime = result.ticket?.checked_in_at ? new Date(result.ticket.checked_in_at).toLocaleTimeString('vi-VN') : '';
      throw new AppError(`Vé đã được check-in trước đó${checkedTime ? ' lúc ' + checkedTime : ''}.`, 400, ErrorCodes.ALREADY_CHECKED_IN);
    }

    if (result.state === 'TICKET_NOT_VALID' || result.state === 'INVALID_STATUS') {
      throw new AppError(invalidTicketMessage(result.ticket?.status), 400, ErrorCodes.TICKET_NOT_VALID);
    }

    if (result.state === 'INVALID_ORDER') {
      throw new AppError('Vé chưa được thanh toán hoặc đơn hàng không hợp lệ.', 400, ErrorCodes.INVALID_INPUT);
    }

    if (result.state === 'CHECKIN_NOT_OPEN') {
      throw new AppError('Vé này chưa đến giờ tham gia.', 400, ErrorCodes.INVALID_INPUT);
    }

    if (result.state === 'EXPIRED') {
      throw new AppError('Vé đã hết hạn.', 400, ErrorCodes.TICKET_NOT_VALID);
    }

    return buildStaffTicketPayload(result.ticket);
  }

  cancelFreeTicket = async (userId, ticketId, reason) => {
    return ticketsRepository.cancelFreeTicket(ticketId, userId, reason);
  };
}

module.exports = new TicketsService();
