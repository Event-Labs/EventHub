const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const ticketsRepository = require('./tickets.repository');

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
    event: {
      id: row.event_id,
      title: row.event_title,
      slug: row.event_slug,
      short_description: row.event_short_description,
      start_time: row.event_start_time,
      end_time: row.event_end_time,
      thumbnail_url: row.event_thumbnail_url,
      banner_url: row.event_banner_url || row.event_thumbnail_url,
      require_attendee_info: Boolean(row.require_attendee_info),
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
    order_item: {
      id: row.order_item_id,
      quantity: row.order_item_quantity ? Number(row.order_item_quantity) : undefined,
      unit_price: row.order_item_unit_price ? Number(row.order_item_unit_price) : undefined,
      final_price: row.order_item_final_price ? Number(row.order_item_final_price) : undefined,
      session_seat_id: row.order_item_session_seat_id,
    },
    seat: buildSeat(row),
    order: {
      id: row.order_id,
      order_code: row.order_code,
      buyer_name: row.buyer_name,
      buyer_email: row.buyer_email,
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
        parsed.ticket_id ||
          parsed.ticketId ||
          parsed.ticket_code ||
          parsed.ticketCode ||
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
  if (qrPayload.type && qrPayload.type !== 'EVENTHUB_TICKET') {
    throw new AppError('QR không đúng định dạng vé EventHub.', 400, ErrorCodes.INVALID_INPUT);
  }

  if (qrPayload.eventId && ticket.event_id && qrPayload.eventId !== ticket.event_id) {
    throw new AppError('QR không khớp sự kiện của vé.', 400, ErrorCodes.INVALID_INPUT);
  }

  if (qrPayload.sessionId && ticket.event_session_id && qrPayload.sessionId !== ticket.event_session_id) {
    throw new AppError('QR không khớp phiên của vé.', 400, ErrorCodes.INVALID_INPUT);
  }
}

function invalidTicketMessage(status) {
  if (status === 'USED') return 'Vé này đã được sử dụng.';
  if (status === 'CANCELLED') return 'Vé đã bị hủy, hoàn tiền hoặc không còn hợp lệ.';
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
    ticket_id: ticket.id,
    ticket_code: ticket.ticket_code,
    qr_code: ticket.qr_code || ticket.ticket_code,
    event_id: ticket.event?.id,
    session_id: ticket.session?.id,
  });
}

function qrImageUrl(ticket, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=2&data=${encodeURIComponent(buildQrPayload(ticket))}`;
}

function clipText(value, maxLength = 64) {
  const text = String(value ?? 'N/A');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function buildDownloadSvg(ticket) {
  const invalid = ticket.status !== 'VALID';
  const venue = [
    ticket.venue.address_line,
    ticket.venue.ward,
    ticket.venue.district,
    ticket.venue.city,
  ].filter(Boolean).join(', ');
  const seat = ticket.seat?.label || 'Không có ghế cố định';
  const qrSize = 204;
  const statusFill = invalid ? '#fee2e2' : '#dcfce7';
  const statusText = invalid ? '#991b1b' : '#166534';
  const holderName = ticket.event?.require_attendee_info
    ? ticket.attendee_name || ticket.order.buyer_name
    : ticket.order.buyer_name;
  const holderLabel = ticket.event?.require_attendee_info
    ? 'NG&#431;&#7900;I THAM D&#7920; (ATTENDEE)'
    : 'NG&#431;&#7900;I MUA V&#201; (BUYER)';
  const attendee = clipText(holderName, 30);
  const orderCode = clipText(ticket.order.order_code, 26);
  const addressLine = clipText(venue, 74);
  const uiFont = 'Manrope, Inter, Segoe UI, Arial, sans-serif';
  const monoFont = 'Cascadia Mono, Consolas, monospace';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100vh" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" style="display:block;background:#f4f7fb">
  <defs>
    <filter id="ticketShadow" x="-10%" y="-15%" width="120%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0f172a" flood-opacity=".20"/>
    </filter>
    <linearGradient id="ticketDark" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#172033"/>
    </linearGradient>
  </defs>

  <rect width="1600" height="900" fill="#f4f7fb"/>
  <circle cx="230" cy="200" r="104" fill="#38bdf8" opacity=".10"/>
  <circle cx="1340" cy="710" r="150" fill="#10b981" opacity=".08"/>
  <circle cx="1050" cy="188" r="62" fill="#94a3b8" opacity=".08"/>

  <g transform="translate(300 200)" filter="url(#ticketShadow)">
    <rect width="980" height="500" rx="28" fill="#ffffff"/>
    <path d="M28 0h632v500H28C12.5 500 0 487.5 0 472V28C0 12.5 12.5 0 28 0Z" fill="url(#ticketDark)"/>
    <path d="M660 0h292c15.5 0 28 12.5 28 28v444c0 15.5-12.5 28-28 28H660Z" fill="#ffffff"/>
    <path d="M660 30v440" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="10 12"/>
    <circle cx="660" cy="0" r="24" fill="#f4f7fb"/>
    <circle cx="660" cy="500" r="24" fill="#f4f7fb"/>

    <text x="44" y="62" fill="#38bdf8" font-family="${uiFont}" font-size="15" font-weight="800" letter-spacing="2.5">V&#201; CHECK-IN EVENTHUB (EVENTHUB CHECK-IN TICKET)</text>
    <text x="44" y="116" fill="#ffffff" font-family="${uiFont}" font-size="42" font-weight="850">${escapeHtml(clipText(ticket.event.title, 24))}</text>
    <text x="44" y="152" fill="#a9bdd8" font-family="${uiFont}" font-size="20" font-weight="500">${escapeHtml(clipText(ticket.ticket_type.name, 40))}</text>

    <rect x="44" y="198" width="258" height="88" rx="14" fill="#1f2937" opacity=".72"/>
    <text x="66" y="232" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">PHI&#202;N (SESSION)</text>
    <text x="66" y="260" fill="#ffffff" font-family="${uiFont}" font-size="19" font-weight="800">${escapeHtml(formatForTicket(ticket.session.start_time))}</text>

    <rect x="328" y="198" width="244" height="88" rx="14" fill="#1f2937" opacity=".72"/>
    <text x="350" y="232" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">GH&#7870; (SEAT)</text>
    <text x="350" y="260" fill="#ffffff" font-family="${uiFont}" font-size="22" font-weight="850">${escapeHtml(seat)}</text>

    <text x="44" y="338" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">${holderLabel}</text>
    <text x="44" y="366" fill="#ffffff" font-family="${uiFont}" font-size="21" font-weight="850">${escapeHtml(attendee)}</text>
    <text x="328" y="338" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">&#272;&#416;N H&#192;NG (ORDER)</text>
    <text x="328" y="366" fill="#ffffff" font-family="${uiFont}" font-size="19" font-weight="850">${escapeHtml(orderCode)}</text>

    <text x="44" y="426" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">&#272;&#7882;A &#272;I&#7874;M (VENUE)</text>
    <text x="44" y="453" fill="#ffffff" font-family="${uiFont}" font-size="21" font-weight="850">${escapeHtml(clipText(ticket.venue.name, 36))}</text>
    <text x="44" y="478" fill="#d6e2f2" font-family="${uiFont}" font-size="13" font-weight="500">${escapeHtml(addressLine)}</text>

    <text x="820" y="54" fill="#0f172a" font-family="${uiFont}" font-size="13" font-weight="850" text-anchor="middle" letter-spacing="1.4">QU&#201;T &#272;&#7874; CHECK-IN (SCAN TO CHECK IN)</text>
    <rect x="712" y="82" width="216" height="216" rx="22" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <image x="718" y="88" width="${qrSize}" height="${qrSize}" href="${escapeHtml(qrImageUrl(ticket, qrSize))}"/>
    <text x="820" y="342" fill="#0f172a" font-family="${monoFont}" font-size="17" font-weight="800" text-anchor="middle">${escapeHtml(ticket.ticket_code)}</text>
    <rect x="738" y="372" width="164" height="42" rx="21" fill="${statusFill}"/>
    <text x="820" y="399" fill="${statusText}" font-family="${uiFont}" font-size="15" font-weight="850" text-anchor="middle">${escapeHtml(ticket.status)}</text>
    <text x="820" y="450" fill="#64748b" font-family="${uiFont}" font-size="11" font-weight="700" text-anchor="middle">Lu&#244;n s&#7861;n s&#224;ng v&#233; t&#7841;i c&#7893;ng</text>
    <text x="820" y="468" fill="#64748b" font-family="${uiFont}" font-size="11" font-weight="700" text-anchor="middle">(Keep this ticket ready at the gate)</text>
  </g>
  ${invalid ? `<text x="800" y="470" fill="#dc2626" opacity=".15" font-family="${uiFont}" font-size="92" font-weight="900" text-anchor="middle" transform="rotate(-15 800 470)">${escapeHtml(ticket.status)}</text>` : ''}
</svg>`;
}

class TicketsService {
  async getMyTickets(userId, filters = {}) {
    const allowedStatuses = ['VALID', 'USED', 'CANCELLED', 'EXPIRED'];
    const status = filters.status?.toUpperCase();

    if (status && !allowedStatuses.includes(status)) {
      throw new AppError('Invalid ticket status', 400, ErrorCodes.INVALID_INPUT);
    }

    const repositoryStatus = status === 'EXPIRED' ? undefined : status;
    const tickets = (await ticketsRepository.findTicketsByUserId(userId, { status: repositoryStatus }))
      .map(buildTicketPayload);
    if (status === 'VALID' || status === 'EXPIRED') {
      return tickets.filter((ticket) => ticket.status === status);
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

    if (result.state === 'FORBIDDEN') {
      throw new AppError('Staff không có quyền check-in vé này.', 403, ErrorCodes.AUTH_FORBIDDEN);
    }

    if (result.state === 'INVALID_STATUS') {
      throw new AppError(invalidTicketMessage(result.ticket?.status), 400, ErrorCodes.INVALID_INPUT);
    }

    if (result.state === 'INVALID_ORDER') {
      throw new AppError('Vé chưa được thanh toán hoặc đơn hàng không hợp lệ.', 400, ErrorCodes.INVALID_INPUT);
    }

    if (result.state === 'EXPIRED') {
      throw new AppError('Vé đã hết hạn.', 400, ErrorCodes.INVALID_INPUT);
    }

    return buildStaffTicketPayload(result.ticket);
  }
}

module.exports = new TicketsService();
