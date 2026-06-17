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

function buildTicketPayload(row) {
  return {
    id: row.id,
    ticket_code: row.ticket_code,
    qr_code: row.qr_code || row.ticket_code,
    status: row.status,
    check_in_status: row.checked_in_at ? 'CHECKED_IN' : 'NOT_CHECKED_IN',
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

function generateQrLikeMarkup(ticket, cellSize = 8) {
  const code = ticket.qr_code || ticket.ticket_code;
  const cells = Array.from({ length: 21 * 21 }, (_, index) => {
    const row = Math.floor(index / 21);
    const col = index % 21;
    const marker =
      (row < 7 && col < 7) ||
      (row < 7 && col > 13) ||
      (row > 13 && col < 7);
    const hash = code.charCodeAt(index % code.length) + row * 17 + col * 31;
    const filled = marker || hash % 3 === 0;
    return filled
      ? `<rect x="${col * cellSize}" y="${row * cellSize}" width="${cellSize}" height="${cellSize}" fill="#111827"/>`
      : '';
  }).join('');

  return cells;
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
  const seat = ticket.seat?.label || 'Free seating';
  const qrSize = 168;
  const qrCellSize = 8;
  const statusFill = invalid ? '#fee2e2' : '#dcfce7';
  const statusText = invalid ? '#991b1b' : '#166534';
  const attendee = clipText(ticket.attendee_name, 30);
  const orderCode = clipText(ticket.order.order_code, 26);
  const addressLine = clipText(venue, 74);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="680" viewBox="0 0 1200 680">
  <defs>
    <filter id="ticketShadow" x="-10%" y="-15%" width="120%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0f172a" flood-opacity=".20"/>
    </filter>
    <linearGradient id="ticketDark" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#172033"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="680" fill="#f4f7fb"/>
  <circle cx="160" cy="118" r="80" fill="#38bdf8" opacity=".10"/>
  <circle cx="1045" cy="570" r="120" fill="#10b981" opacity=".08"/>

  <g transform="translate(110 90)" filter="url(#ticketShadow)">
    <rect width="980" height="500" rx="28" fill="#ffffff"/>
    <path d="M28 0h632v500H28C12.5 500 0 487.5 0 472V28C0 12.5 12.5 0 28 0Z" fill="url(#ticketDark)"/>
    <path d="M660 0h292c15.5 0 28 12.5 28 28v444c0 15.5-12.5 28-28 28H660Z" fill="#ffffff"/>
    <path d="M660 30v440" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="10 12"/>
    <circle cx="660" cy="0" r="24" fill="#f4f7fb"/>
    <circle cx="660" cy="500" r="24" fill="#f4f7fb"/>

    <text x="44" y="62" fill="#38bdf8" font-family="Arial, sans-serif" font-size="15" font-weight="800" letter-spacing="3">EVENTHUB CHECK-IN TICKET</text>
    <text x="44" y="116" fill="#ffffff" font-family="Arial, sans-serif" font-size="42" font-weight="900">${escapeHtml(clipText(ticket.event.title, 24))}</text>
    <text x="44" y="152" fill="#a9bdd8" font-family="Arial, sans-serif" font-size="20">${escapeHtml(clipText(ticket.ticket_type.name, 40))}</text>

    <rect x="44" y="198" width="258" height="88" rx="14" fill="#1f2937" opacity=".72"/>
    <text x="66" y="232" fill="#9fb4d2" font-family="Arial, sans-serif" font-size="12" font-weight="800" letter-spacing="1">SESSION</text>
    <text x="66" y="260" fill="#ffffff" font-family="Arial, sans-serif" font-size="19" font-weight="800">${escapeHtml(formatForTicket(ticket.session.start_time))}</text>

    <rect x="328" y="198" width="244" height="88" rx="14" fill="#1f2937" opacity=".72"/>
    <text x="350" y="232" fill="#9fb4d2" font-family="Arial, sans-serif" font-size="12" font-weight="800" letter-spacing="1">SEAT</text>
    <text x="350" y="260" fill="#ffffff" font-family="Arial, sans-serif" font-size="22" font-weight="900">${escapeHtml(seat)}</text>

    <text x="44" y="338" fill="#9fb4d2" font-family="Arial, sans-serif" font-size="12" font-weight="800" letter-spacing="1">ATTENDEE</text>
    <text x="44" y="366" fill="#ffffff" font-family="Arial, sans-serif" font-size="21" font-weight="900">${escapeHtml(attendee)}</text>
    <text x="328" y="338" fill="#9fb4d2" font-family="Arial, sans-serif" font-size="12" font-weight="800" letter-spacing="1">ORDER</text>
    <text x="328" y="366" fill="#ffffff" font-family="Arial, sans-serif" font-size="19" font-weight="900">${escapeHtml(orderCode)}</text>

    <text x="44" y="426" fill="#9fb4d2" font-family="Arial, sans-serif" font-size="12" font-weight="800" letter-spacing="1">VENUE</text>
    <text x="44" y="453" fill="#ffffff" font-family="Arial, sans-serif" font-size="21" font-weight="900">${escapeHtml(clipText(ticket.venue.name, 36))}</text>
    <text x="44" y="478" fill="#d6e2f2" font-family="Arial, sans-serif" font-size="13">${escapeHtml(addressLine)}</text>

    <text x="820" y="54" fill="#0f172a" font-family="Arial, sans-serif" font-size="13" font-weight="900" text-anchor="middle" letter-spacing="2">SCAN TO CHECK IN</text>
    <rect x="712" y="82" width="216" height="216" rx="22" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <g transform="translate(736 106)">
      <rect width="${qrSize}" height="${qrSize}" fill="#ffffff"/>
    ${generateQrLikeMarkup(ticket, qrCellSize)}
    </g>
    <text x="820" y="342" fill="#0f172a" font-family="Consolas, monospace" font-size="17" font-weight="900" text-anchor="middle">${escapeHtml(ticket.ticket_code)}</text>
    <rect x="738" y="372" width="164" height="42" rx="21" fill="${statusFill}"/>
    <text x="820" y="399" fill="${statusText}" font-family="Arial, sans-serif" font-size="15" font-weight="900" text-anchor="middle">${escapeHtml(ticket.status)}</text>
    <text x="820" y="456" fill="#64748b" font-family="Arial, sans-serif" font-size="12" font-weight="700" text-anchor="middle">Keep this ticket ready at the gate</text>
  </g>
  ${invalid ? `<text x="600" y="354" fill="#dc2626" opacity=".15" font-family="Arial, sans-serif" font-size="92" font-weight="900" text-anchor="middle" transform="rotate(-15 600 354)">${escapeHtml(ticket.status)}</text>` : ''}
</svg>`;
}

class TicketsService {
  async getMyTickets(userId, filters = {}) {
    const allowedStatuses = ['VALID', 'USED', 'CANCELLED'];
    const status = filters.status?.toUpperCase();

    if (status && !allowedStatuses.includes(status)) {
      throw new AppError('Invalid ticket status', 400, ErrorCodes.INVALID_INPUT);
    }

    const rows = await ticketsRepository.findTicketsByUserId(userId, { status });
    return rows.map(buildTicketPayload);
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
}

module.exports = new TicketsService();
