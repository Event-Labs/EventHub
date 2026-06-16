const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const ordersRepository = require('./orders.repository');
const paymentsService = require('../payments/payments.service');

function normalizePhone(phone) {
  if (!phone) return null;
  if (phone.startsWith('+84')) return `0${phone.slice(3)}`;
  return phone;
}

function mapMoney(value) {
  return Number(value || 0);
}

function mapOrderStatus({ order, items }) {
  return {
    order: {
      id: order.id,
      order_code: order.order_code,
      status: order.status,
      subtotal: mapMoney(order.subtotal),
      discount_amount: mapMoney(order.discount_amount),
      platform_fee: mapMoney(order.platform_fee),
      total_amount: mapMoney(order.total_amount),
      expired_at: order.expired_at,
      created_at: order.created_at,
      event: order.event_id
        ? { id: order.event_id, title: order.event_title, slug: order.event_slug }
        : null,
    },
    payment: order.payment_order_id
      ? {
          id: order.payment_order_id,
          provider_order_code: order.provider_order_code,
          status: order.payment_status,
          amount: mapMoney(order.payment_amount),
          checkout_url: order.checkout_url,
          qr_code: order.qr_code,
        }
      : null,
    items: items.map((item) => ({
      id: item.id,
      ticket_type_id: item.ticket_type_id,
      ticket_type_name: item.ticket_type_name,
      quantity: Number(item.quantity),
      unit_price: mapMoney(item.unit_price),
      final_price: mapMoney(item.final_price),
      ticket: item.ticket_id
        ? {
            id: item.ticket_id,
            ticket_code: item.ticket_code,
            status: item.ticket_status,
          }
        : null,
      seat: item.session_seat_id
        ? {
            session_seat_id: item.session_seat_id,
            label: `${item.row_label || ''}${item.seat_number || ''}`,
          }
        : null,
    })),
  };
}

class OrdersService {
  async checkout(userId, payload) {
    await ordersRepository.expirePendingOrders();

    const normalizedItems = payload.items.map((item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unit_price || item.price || 0);
      return {
        ticket_type_id: item.ticket_type_id,
        session_seat_ids: item.session_seat_ids || [],
        quantity,
        unit_price: unitPrice,
        line_total: unitPrice * quantity,
      };
    });

    const subtotal = normalizedItems.reduce((sum, item) => sum + item.line_total, 0);
    const paymentChannel = await paymentsService.getOrganizerPayosChannelForEvent(payload.event_id);

    const created = await ordersRepository.createPendingCheckout({
      userId,
      eventId: payload.event_id,
      buyer: {
        name: payload.buyer_name,
        email: payload.buyer_email.toLowerCase(),
        phone: normalizePhone(payload.buyer_phone),
      },
      promoCode: payload.promo_code,
      items: normalizedItems,
      totals: {
        subtotal,
        total_amount: subtotal,
      },
      paymentChannel,
    });

    try {
      created.paymentOrder = await paymentsService.createTicketOrderPayosLink({
        paymentOrder: created.paymentOrder,
        channel: paymentChannel,
        orderItems: created.orderItems,
      });
    } catch (error) {
      await ordersRepository.cancelOrder(created.order.id);
      throw new AppError(
        error.message || 'Unable to create PayOS payment link',
        502,
        ErrorCodes.DATABASE_ERROR,
      );
    }

    return {
      order: {
        id: created.order.id,
        order_code: created.order.order_code,
        status: created.order.status,
        subtotal: mapMoney(created.order.subtotal),
        discount_amount: mapMoney(created.order.discount_amount),
        platform_fee: mapMoney(created.order.platform_fee),
        total_amount: mapMoney(created.order.total_amount),
        expired_at: created.order.expired_at,
        created_at: created.order.created_at,
        event: created.event,
      },
      payment: {
        id: created.paymentOrder.id,
        provider_order_code: created.paymentOrder.provider_order_code,
        status: created.paymentOrder.status,
        checkout_url: created.paymentOrder.checkout_url,
        qr_code: created.paymentOrder.qr_code,
        amount: mapMoney(created.paymentOrder.amount),
      },
      items: created.orderItems.map((item) => ({
        ticket_type_id: item.ticket_type_id,
        ticket_type_name: item.ticket_type_name,
        quantity: Number(item.quantity),
        unit_price: mapMoney(item.unit_price),
        final_price: mapMoney(item.final_price),
      })),
      hold_minutes: Number(process.env.TICKET_HOLD_MINUTES || 15),
    };
  }

  async getStatus(userId, orderId) {
    await ordersRepository.expirePendingOrders();
    try {
      await paymentsService.syncTicketOrderFromPayos(orderId, userId);
    } catch (error) {
      // Keep status polling usable even if PayOS status sync is temporarily unavailable.
    }
    const row = await ordersRepository.findOrderStatus(orderId, userId);
    if (!row) {
      throw new AppError('Order not found', 404, ErrorCodes.ORDER_NOT_FOUND);
    }
    return mapOrderStatus(row);
  }

  async cancel(userId, orderId) {
    const order = await ordersRepository.cancelOrder(orderId, userId);
    if (!order) {
      throw new AppError('Order not found or cannot be cancelled', 404, ErrorCodes.ORDER_NOT_FOUND);
    }
    return { id: order.id, status: order.status };
  }

}

module.exports = new OrdersService();
