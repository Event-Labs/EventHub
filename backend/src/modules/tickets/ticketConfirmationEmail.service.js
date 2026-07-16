const emailService = require('../../infrastructure/email/email.service');
const logger = require('../../core/logger');

const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value || 0));
const date = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : 'N/A';

function qrUrl(ticket) {
  const payload = JSON.stringify({ type: 'EVENTHUB_TICKET', ticket_id: ticket.id, ticket_code: ticket.ticket_code, qr_code: ticket.qr_code || ticket.ticket_code, event_id: ticket.event_id, session_id: ticket.event_session_id });
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=2&data=${encodeURIComponent(payload)}`;
}

function ticketCard(ticket, eventTitle) {
  const venue = [ticket.venue_name, ticket.address_line, ticket.ward, ticket.district, ticket.city].filter(Boolean).join(', ');
  return `<div style="margin:16px 0;padding:20px;border:1px solid #e2e8f0;border-radius:16px"><table width="100%"><tr><td style="vertical-align:top">
    <small>M&#195; V&#201;</small><h3>${escapeHtml(ticket.ticket_code)}</h3><p><b>Lo&#7841;i v&#233;:</b> ${escapeHtml(ticket.ticket_type_name)}</p>
    <p><b>Phi&#234;n:</b> ${escapeHtml(ticket.session_name || eventTitle)}</p><p><b>Th&#7901;i gian:</b> ${escapeHtml(date(ticket.session_start_time))}</p>
    <p><b>&#272;&#7883;a &#273;i&#7875;m:</b> ${escapeHtml(venue)}</p>${ticket.seat_label ? `<p><b>Gh&#7871;:</b> ${escapeHtml(ticket.seat_label)}</p>` : ''}
    ${ticket.attendee_name ? `<p><b>Ng&#432;&#7901;i tham d&#7921;:</b> ${escapeHtml(ticket.attendee_name)}</p>` : ''}</td>
    <td width="180" style="text-align:center;vertical-align:top"><img src="${qrUrl(ticket)}" width="170" height="170" alt="QR check-in" style="border:1px solid #e2e8f0;border-radius:10px" /><small style="display:block;color:#64748b">QR check-in</small></td>
  </tr></table></div>`;
}

function buildHtml(order, tickets) {
  const image = order.banner_url || order.thumbnail_url;
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial;color:#334155">
  <div style="max-width:720px;margin:auto;padding:24px"><div style="background:#0f172a;color:white;padding:24px;border-radius:18px 18px 0 0">
    <small style="color:#38bdf8">EVENTHUB</small><h1>Thanh to&#225;n th&#224;nh c&#244;ng</h1><p>V&#233; &#273;&#227; &#273;&#432;&#7907;c ph&#225;t h&#224;nh. H&#227;y gi&#7919; email n&#224;y &#273;&#7875; check-in.</p></div>
  ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(order.event_title)}" style="width:100%;max-height:300px;object-fit:cover" />` : ''}
  <div style="background:white;padding:24px"><h2>${escapeHtml(order.event_title)}</h2><p>Xin chao <b>${escapeHtml(order.buyer_name)}</b>, EventHub da nhan thanh toan.</p>
  <table width="100%" cellpadding="7" style="background:#f8fafc"><tr><td>Ma don</td><td align="right"><b>${escapeHtml(order.order_code)}</b></td></tr>
  <tr><td>Ma giao dich</td><td align="right">${escapeHtml(order.transaction_code || 'N/A')}</td></tr><tr><td>Thanh toan luc</td><td align="right">${escapeHtml(date(order.paid_at))}</td></tr>
  <tr><td>Tam tinh</td><td align="right">${money(order.subtotal)}</td></tr><tr><td>Giam gia</td><td align="right">-${money(order.discount_amount)}</td></tr>
  <tr><td>Phi nen tang</td><td align="right">${money(order.platform_fee)}</td></tr><tr><td><b>Tong thanh toan</b></td><td align="right"><b>${money(order.total_amount)}</b></td></tr></table>
  <h2>Ve cua ban (${tickets.length})</h2>${tickets.map((ticket) => ticketCard(ticket, order.event_title)).join('')}
  <p style="font-size:13px;color:#64748b">Khong chia se ma QR. Moi ve chi check-in mot lan.</p></div></div></body></html>`;
}

async function sendOrderConfirmation(order, tickets) {
  if (!order?.buyer_email || !tickets?.length) return false;
  try {
    await emailService.sendEmail({
      email: order.buyer_email,
      subject: `V\u00e9 EventHub - ${order.event_title} (${order.order_code})`,
      message: `Thanh to\u00e1n th\u00e0nh c\u00f4ng \u0111\u01a1n ${order.order_code}. ${tickets.length} v\u00e9 \u0111\u00e3 ph\u00e1t h\u00e0nh. T\u1ed5ng: ${money(order.total_amount)}.`,
      html: buildHtml(order, tickets),
    });
    return true;
  } catch (error) {
    logger.error(`Could not send ticket confirmation for order ${order.id}: ${error.message}`);
    return false;
  }
}

module.exports = { sendOrderConfirmation };
