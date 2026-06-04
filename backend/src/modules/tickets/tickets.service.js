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

function buildQrSvg(content) {
  const encoded = Buffer.from(String(content)).toString('base64');
  return `data:image/svg+xml;base64,${encoded}`;
}

function generateQrLikeSvg(ticket) {
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
      ? `<rect x="${col * 8}" y="${row * 8}" width="8" height="8" fill="#111827"/>`
      : '';
  }).join('');

  return buildQrSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="168" height="168" viewBox="0 0 168 168"><rect width="168" height="168" fill="#fff"/>${cells}</svg>`,
  );
}

function buildDownloadHtml(ticket) {
  const invalid = ticket.status !== 'VALID';
  const venue = [
    ticket.venue.address_line,
    ticket.venue.ward,
    ticket.venue.district,
    ticket.venue.city,
  ].filter(Boolean).join(', ');
  const seat = ticket.seat?.label || 'Free seating';
  const qr = generateQrLikeSvg(ticket);

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(ticket.ticket_code)}</title>
  <style>
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, sans-serif; }
    .ticket { width: 880px; margin: 32px auto; display: grid; grid-template-columns: 1fr 260px; overflow: hidden; border-radius: 18px; background: #ffffff; box-shadow: 0 24px 80px rgba(15, 23, 42, .18); }
    .main { padding: 34px; background: #24262d; color: #ffffff; }
    .side { padding: 28px; border-left: 2px dashed #d1d5db; text-align: center; }
    .label { margin: 0 0 6px; color: #9ca3af; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 0 0 24px; font-size: 30px; line-height: 1.18; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .value { margin: 0; font-size: 16px; font-weight: 700; }
    .code { margin-top: 18px; color: #10b981; font-size: 22px; font-weight: 800; letter-spacing: .08em; }
    img { width: 168px; height: 168px; }
    .status { display: inline-block; margin-top: 18px; padding: 8px 12px; border-radius: 999px; background: ${invalid ? '#fee2e2' : '#dcfce7'}; color: ${invalid ? '#991b1b' : '#166534'}; font-weight: 800; }
    .watermark { position: fixed; inset: 0; display: ${invalid ? 'grid' : 'none'}; place-items: center; color: rgba(220, 38, 38, .16); font-size: 96px; font-weight: 900; transform: rotate(-24deg); pointer-events: none; }
  </style>
</head>
<body>
  <div class="watermark">${escapeHtml(ticket.status)}</div>
  <main class="ticket">
    <section class="main">
      <p class="label">Official Entry Pass</p>
      <h1>${escapeHtml(ticket.event.title)}</h1>
      <div class="grid">
        <div><p class="label">Session</p><p class="value">${escapeHtml(formatForTicket(ticket.session.start_time))}</p></div>
        <div><p class="label">Ticket type</p><p class="value">${escapeHtml(ticket.ticket_type.name)}</p></div>
        <div><p class="label">Venue</p><p class="value">${escapeHtml(ticket.venue.name)}</p></div>
        <div><p class="label">Seat</p><p class="value">${escapeHtml(seat)}</p></div>
        <div><p class="label">Attendee</p><p class="value">${escapeHtml(ticket.attendee_name)}</p></div>
        <div><p class="label">Email</p><p class="value">${escapeHtml(ticket.attendee_email)}</p></div>
      </div>
      <p class="code">${escapeHtml(ticket.ticket_code)}</p>
      <p>${escapeHtml(venue)}</p>
    </section>
    <aside class="side">
      <img src="${qr}" alt="QR code" />
      <div class="status">${escapeHtml(ticket.status)}</div>
      <p class="label" style="margin-top:24px">Order</p>
      <p class="value">${escapeHtml(ticket.order.order_code)}</p>
    </aside>
  </main>
</body>
</html>`;
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
      fileName: `${ticket.ticket_code}.html`,
      contentType: 'text/html; charset=utf-8',
      content: buildDownloadHtml(ticket),
    };
  }
}

module.exports = new TicketsService();
