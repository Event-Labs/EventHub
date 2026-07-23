const emailService = require('../../infrastructure/email/email.service');
const logger = require('../../core/logger');
const env = require('../../config/env');

const MAX_TICKETS_PER_EMAIL = 6;

const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value || 0));
const date = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : 'N/A';
const maskEmail = (value) => {
  const [name = '', domain = ''] = String(value || '').split('@');
  return domain ? `${name.slice(0, 2)}***@${domain}` : 'missing';
};

function qrUrl(ticket) {
  const payload = JSON.stringify({ type: 'EVENTHUB_TICKET', ticket_id: ticket.id, ticket_code: ticket.ticket_code, qr_code: ticket.qr_code || ticket.ticket_code, event_id: ticket.event_id, session_id: ticket.event_session_id });
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=2&data=${encodeURIComponent(payload)}`;
}

function logoUrl() {
  return `${String(env.CLIENT_URL || '').replace(/\/$/, '')}/images/LogoEH.png`;
}

function ticketCard(ticket, order) {
  const venue = [ticket.venue_name, ticket.address_line, ticket.ward, ticket.district, ticket.city].filter(Boolean).join(', ');
  const holderName = ticket.attendee_name || order.buyer_name;
  const holderLabel = ticket.attendee_name ? 'Ng&#432;&#7901;i tham d&#7921;' : 'Ng&#432;&#7901;i mua v&#233;';
  return `<div style="margin:20px 0;overflow:hidden;border:1px solid #24304b;border-radius:18px;background:#101a33;color:#fff">
    <div style="padding:16px 20px;border-bottom:1px solid #293652;background:#0f172a">
      <table width="100%" cellspacing="0" cellpadding="0"><tr>
        <td><img src="${escapeHtml(logoUrl())}" width="150" alt="EventHub" style="display:block;width:150px;max-width:100%;height:auto" /></td>
        <td align="right"><span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#153f36;color:#6ee7b7;font-size:11px;font-weight:bold;text-transform:uppercase">H&#7907;p l&#7879;</span></td>
      </tr></table>
    </div>
    ${order.banner_url || order.thumbnail_url ? `<img src="${escapeHtml(order.banner_url || order.thumbnail_url)}" alt="${escapeHtml(order.event_title)}" style="display:block;width:100%;height:auto;max-height:230px;object-fit:cover" />` : ''}
    <div style="padding:22px">
      <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#ffffff18;color:#dbeafe;font-size:11px;font-weight:bold;text-transform:uppercase">${escapeHtml(ticket.ticket_type_name)}</span>
      <h2 style="margin:12px 0 20px;color:#fff;font-size:25px;line-height:1.25">${escapeHtml(order.event_title)}</h2>
      <table width="100%" cellspacing="0" cellpadding="0"><tr>
        <td style="padding-right:18px;vertical-align:top">
          <table width="100%" cellspacing="0" cellpadding="6" style="font-size:14px;color:#fff">
            <tr><td style="color:#94a3b8">${holderLabel}</td><td><b>${escapeHtml(holderName)}</b></td></tr>
            <tr><td style="color:#94a3b8">Th&#7901;i gian</td><td><b>${escapeHtml(date(ticket.session_start_time))}</b></td></tr>
            <tr><td style="color:#94a3b8">&#272;&#417;n h&#224;ng</td><td><b>${escapeHtml(order.order_code)}</b></td></tr>
            <tr><td style="color:#94a3b8">Phi&#234;n</td><td><b>${escapeHtml(ticket.session_name || order.event_title)}</b></td></tr>
            ${ticket.seat_label ? `<tr><td style="color:#94a3b8">Gh&#7871; ng&#7891;i</td><td><b>${escapeHtml(ticket.seat_label)}</b></td></tr>` : ''}
            <tr><td style="color:#94a3b8">&#272;&#7883;a &#273;i&#7875;m</td><td><b>${escapeHtml(venue || 'N/A')}</b></td></tr>
          </table>
        </td>
        <td width="190" style="padding-left:18px;border-left:1px dashed #475569;text-align:center;vertical-align:top">
          <div style="display:inline-block;padding:9px;border-radius:12px;background:#fff"><img src="${qrUrl(ticket)}" width="160" height="160" alt="QR check-in" style="display:block;width:160px;height:160px" /></div>
          <p style="margin:10px 0 0;color:#fff;font-family:monospace;font-size:13px;font-weight:bold;letter-spacing:1px">${escapeHtml(ticket.ticket_code)}</p>
          <small style="display:block;margin-top:5px;color:#94a3b8">Qu&#233;t &#273;&#7875; check-in</small>
        </td>
      </tr></table>
    </div>
  </div>`;
}

function buildHtml(order, tickets, delivery = {}) {
  const partNotice = delivery.totalParts > 1
    ? `<p style="padding:12px 16px;border-radius:10px;background:#e0f2fe;color:#075985"><b>Email ${delivery.part}/${delivery.totalParts}</b> &mdash; email n&#224;y c&#243; ${tickets.length} trong t&#7893;ng s&#7889; ${delivery.totalTickets} v&#233;.</p>`
    : '';
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
  ${partNotice}<h2>Ve cua ban (${tickets.length})</h2>${tickets.map((ticket) => ticketCard(ticket, order)).join('')}
  <p style="font-size:13px;color:#64748b">Khong chia se ma QR. Moi ve chi check-in mot lan.</p></div></div></body></html>`;
}

function localizeVietnameseHtml(html) {
  const replacements = [
    ['Xin chao', 'Xin ch\u00e0o'],
    ['EventHub da nhan thanh toan.', 'EventHub \u0111\u00e3 nh\u1eadn thanh to\u00e1n.'],
    ['Ma don', 'M\u00e3 \u0111\u01a1n'],
    ['Ma giao dich', 'M\u00e3 giao d\u1ecbch'],
    ['Thanh toan luc', 'Thanh to\u00e1n l\u00fac'],
    ['Tam tinh', 'T\u1ea1m t\u00ednh'],
    ['Giam gia', 'Gi\u1ea3m gi\u00e1'],
    ['Phi nen tang', 'Ph\u00ed n\u1ec1n t\u1ea3ng'],
    ['Tong thanh toan', 'T\u1ed5ng thanh to\u00e1n'],
    ['Ve cua ban', 'V\u00e9 c\u1ee7a b\u1ea1n'],
    ['Khong chia se ma QR. Moi ve chi check-in mot lan.', 'Kh\u00f4ng chia s\u1ebb m\u00e3 QR. M\u1ed7i v\u00e9 ch\u1ec9 \u0111\u01b0\u1ee3c check-in m\u1ed9t l\u1ea7n.'],
  ];
  return replacements.reduce((result, [source, target]) => result.replaceAll(source, target), html);
}

async function sendOrderConfirmation(order, tickets) {
  if (!order?.buyer_email || !tickets?.length) {
    logger.warn(`[TICKET_EMAIL] skipped orderId=${order?.id || 'missing'} reason=${!order?.buyer_email ? 'missing_recipient' : 'no_tickets'} ticketCount=${tickets?.length || 0}`);
    return false;
  }

  const ticketBatches = [];
  for (let index = 0; index < tickets.length; index += MAX_TICKETS_PER_EMAIL) {
    ticketBatches.push(tickets.slice(index, index + MAX_TICKETS_PER_EMAIL));
  }

  logger.info(`[TICKET_EMAIL] rendering orderId=${order.id} orderCode=${order.order_code} recipient=${maskEmail(order.buyer_email)} ticketCount=${tickets.length} emailParts=${ticketBatches.length} total=${order.total_amount} paidAt=${order.paid_at || 'missing'}`);

  const results = await Promise.allSettled(ticketBatches.map((ticketBatch, index) => {
    const part = index + 1;
    const partLabel = ticketBatches.length > 1 ? ` - Phần ${part}/${ticketBatches.length}` : '';
    return emailService.sendEmail({
      email: order.buyer_email,
      subject: `Vé EventHub - ${order.event_title} (${order.order_code})${partLabel}`,
      message: `Thanh toán thành công đơn ${order.order_code}. Email ${part}/${ticketBatches.length} gồm ${ticketBatch.length}/${tickets.length} vé. Tổng: ${money(order.total_amount)}.`,
      html: localizeVietnameseHtml(buildHtml(order, ticketBatch, {
        part,
        totalParts: ticketBatches.length,
        totalTickets: tickets.length,
      })),
    });
  }));

  const failedParts = [];
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      failedParts.push(index + 1);
      const error = result.reason || {};
      logger.error(`[TICKET_EMAIL] part failed orderId=${order.id} orderCode=${order.order_code} recipient=${maskEmail(order.buyer_email)} part=${index + 1}/${ticketBatches.length} ticketCount=${ticketBatches[index].length} code=${error.code || 'unknown'} message=${JSON.stringify(error.message || '')}`);
    }
  });

  if (failedParts.length) {
    logger.error(`[TICKET_EMAIL] incomplete orderId=${order.id} orderCode=${order.order_code} recipient=${maskEmail(order.buyer_email)} failedParts=${failedParts.join(',')} totalParts=${ticketBatches.length}`);
    return false;
  }

  logger.info(`[TICKET_EMAIL] sent orderId=${order.id} orderCode=${order.order_code} recipient=${maskEmail(order.buyer_email)} ticketCount=${tickets.length} emailParts=${ticketBatches.length}`);
  return true;
}

module.exports = { sendOrderConfirmation };
