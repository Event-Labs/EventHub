const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const platformFinanceService = require('../admin/platformFinance.service');
const ordersRepository = require('./orders.repository');

function normalizePhone(phone) {
  if (!phone) return null;
  if (phone.startsWith('+84')) return `0${phone.slice(3)}`;
  return phone;
}

function isSaleOpen(ticketType) {
  const now = Date.now();
  const saleStart = ticketType.sale_start ? new Date(ticketType.sale_start).getTime() : null;
  const saleEnd = ticketType.sale_end ? new Date(ticketType.sale_end).getTime() : null;
  return (!saleStart || saleStart <= now) && (!saleEnd || saleEnd >= now);
}

class OrdersService {
  async checkout(userId, payload) {
    const event = await ordersRepository.findEventById(payload.event_id);
    if (!event || event.deleted_at) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const ticketTypeIds = payload.items.map((item) => item.ticket_type_id);
    const ticketTypes = await ordersRepository.findTicketTypesByIds(ticketTypeIds);

    if (ticketTypes.length !== ticketTypeIds.length) {
      throw new AppError('Invalid ticket items', 400, ErrorCodes.ORDER_INVALID_ITEMS);
    }

    const ticketTypeMap = new Map(ticketTypes.map((row) => [row.id, row]));
    let subtotal = 0;
    const normalizedItems = [];

    for (const item of payload.items) {
      const ticketType = ticketTypeMap.get(item.ticket_type_id);

      if (!ticketType || ticketType.event_id !== payload.event_id) {
        throw new AppError(
          'Ticket type does not belong to this event',
          400,
          ErrorCodes.ORDER_INVALID_ITEMS,
        );
      }

      if (!isSaleOpen(ticketType)) {
        throw new AppError(
          `Ticket "${ticketType.name}" is not on sale`,
          400,
          ErrorCodes.ORDER_TICKET_SALE_CLOSED,
        );
      }

      if (item.quantity > (ticketType.max_per_order || 10)) {
        throw new AppError(
          `Maximum ${ticketType.max_per_order || 10} tickets per order for "${ticketType.name}"`,
          400,
          ErrorCodes.ORDER_INVALID_ITEMS,
        );
      }

      const sold = await ordersRepository.countSoldTickets(ticketType.id);
      const remaining = Number(ticketType.quantity) - sold;
      if (item.quantity > remaining) {
        throw new AppError(
          `Not enough tickets available for "${ticketType.name}"`,
          400,
          ErrorCodes.ORDER_TICKET_UNAVAILABLE,
        );
      }

      const unitPrice = Number(ticketType.price);
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;

      normalizedItems.push({
        ticket_type_id: ticketType.id,
        event_session_id: ticketType.event_session_id,
        quantity: item.quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        attendee_name: item.attendee_name,
        attendee_email: item.attendee_email.toLowerCase(),
      });
    }

    const activeFee = await platformFinanceService.findActiveFeeForCategory(event.category_id);
    const feeTotals = platformFinanceService.calculatePlatformFee(subtotal, activeFee);

    const result = await ordersRepository.checkout({
      userId,
      eventId: payload.event_id,
      buyer: {
        name: payload.buyer_name,
        email: payload.buyer_email.toLowerCase(),
        phone: normalizePhone(payload.buyer_phone),
      },
      items: normalizedItems,
      totals: { subtotal, ...feeTotals },
    });

    return {
      order: {
        id: result.order.id,
        order_code: result.order.order_code,
        status: result.order.status,
        subtotal: Number(result.order.subtotal),
        platform_fee: Number(result.order.platform_fee),
        total_amount: Number(result.order.total_amount),
        created_at: result.order.created_at,
      },
      tickets: result.tickets.map((ticket) => ({
        id: ticket.id,
        ticket_code: ticket.ticket_code,
        status: ticket.status,
        created_at: ticket.created_at,
      })),
    };
  }

  async getMyTickets(userId) {
    const rows = await ordersRepository.findTicketsByUserId(userId);
    return rows.map((row) => ({
      id: row.id,
      ticket_code: row.ticket_code,
      status: row.status,
      attendee_name: row.attendee_name,
      attendee_email: row.attendee_email,
      created_at: row.created_at,
      checked_in_at: row.checked_in_at,
      event: {
        id: row.event_id,
        title: row.event_title,
        slug: row.event_slug,
        start_time: row.event_start_time,
        end_time: row.event_end_time,
        thumbnail_url: row.event_thumbnail_url,
      },
      ticket_type: {
        name: row.ticket_type_name,
        price: Number(row.ticket_type_price),
      },
      order: {
        order_code: row.order_code,
        created_at: row.order_created_at,
      },
    }));
  }
}

module.exports = new OrdersService();
