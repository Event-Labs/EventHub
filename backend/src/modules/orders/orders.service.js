const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const ordersRepository = require('./orders.repository');
const paymentsService = require('../payments/payments.service');
const env = require('../../config/env');

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

function mapVenue(row) {
  if (!row) return null;
  return {
    name: row.name || row.venue_name || null,
    address_line: row.address_line || null,
    ward: row.ward || null,
    district: row.district || null,
    city: row.city || null,
  };
}

function mapStaffDirectEvent(event) {
  return {
    ...event,
    ticket_types: (event.ticket_types || []).map((ticketType) => ({
      ...ticketType,
      price: mapMoney(ticketType.price),
      quantity: Number(ticketType.quantity || 0),
      max_per_order: Number(ticketType.max_per_order || 0),
      available_quantity: Number(ticketType.available_quantity || 0),
    })),
  };
}

function mapStaffDirectBooking(data) {
  const itemSummaries = new Map();
  for (const item of data.items || []) {
    const current = itemSummaries.get(item.ticket_type_id) || {
      ticket_type_id: item.ticket_type_id,
      ticket_type_name: item.ticket_type_name,
      quantity: 0,
      unit_price: mapMoney(item.unit_price),
      final_price: 0,
    };
    current.quantity += Number(item.quantity || 0);
    current.final_price += mapMoney(item.final_price);
    itemSummaries.set(item.ticket_type_id, current);
  }

  return {
    order: {
      id: data.order.id,
      order_code: data.order.order_code,
      status: data.order.status,
      subtotal: mapMoney(data.order.subtotal),
      discount_amount: mapMoney(data.order.discount_amount),
      platform_fee: mapMoney(data.order.platform_fee),
      total_amount: mapMoney(data.order.total_amount),
      buyer_name: data.order.buyer_name,
      buyer_email: data.order.buyer_email,
      buyer_phone: data.order.buyer_phone,
      staff_id: data.order.created_by_staff_id,
      staff_name: data.order.created_by_staff_name,
      created_by_role: data.order.created_by_role,
      payment_method: data.order.payment_method,
      internal_note: data.order.internal_note,
      booking_source: data.order.booking_source,
      created_at: data.order.created_at,
      requires_payment: data.order.status === 'PENDING',
    },
    payment: {
      id: data.paymentOrder.id,
      provider: data.paymentOrder.provider,
      provider_order_code: data.paymentOrder.provider_order_code,
      status: data.paymentOrder.status,
      amount: mapMoney(data.paymentOrder.amount),
      checkout_url: data.paymentOrder.checkout_url,
      qr_code: data.paymentOrder.qr_code,
      paid_at: data.paymentOrder.paid_at,
    },
    staff: {
      id: data.staff.id,
      name: data.staff.full_name,
      email: data.staff.email,
    },
    event: data.event,
    items: [...itemSummaries.values()],
    tickets: (data.tickets || []).map((ticket) => ({
      id: ticket.id,
      ticket_code: ticket.ticket_code,
      qr_code: ticket.qr_code,
      status: ticket.status,
      attendee_name: ticket.attendee_name,
      attendee_email: ticket.attendee_email,
      created_at: ticket.created_at,
      ticket_type: {
        name: ticket.ticket_type_name,
        price: mapMoney(ticket.ticket_type_price),
      },
      event: {
        id: ticket.event_id,
        title: ticket.event_title,
        banner_url: ticket.banner_url,
        thumbnail_url: ticket.thumbnail_url,
      },
      session: {
        name: ticket.session_name,
        start_time: ticket.session_start_time,
        end_time: ticket.session_end_time,
      },
      seat: ticket.seat_label ? { label: ticket.seat_label } : null,
      venue: mapVenue(ticket),
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
      attendees: (payload.attendees || []).map((attendee) => ({
        ticket_type_id: attendee.ticket_type_id,
        session_seat_id: attendee.session_seat_id || null,
        name: attendee.name,
        email: attendee.email.toLowerCase(),
      })),
      promoCode: payload.promo_code,
      items: normalizedItems,
      totals: {
        subtotal,
        total_amount: subtotal,
      },
      paymentChannel,
      requireEventTermsAcceptance: true,
      eventTermsAccepted: payload.event_terms_accepted,
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
      throw new AppError('Kh\u00f4ng t\u00ecm th\u1ea5y \u0111\u01a1n h\u00e0ng.', 404, ErrorCodes.ORDER_NOT_FOUND);
    }
    return mapOrderStatus(row);
  }

  async cancel(userId, orderId) {
    const order = await ordersRepository.cancelOrder(orderId, userId);
    if (!order) {
      throw new AppError('Kh\u00f4ng t\u00ecm th\u1ea5y \u0111\u01a1n h\u00e0ng ho\u1eb7c kh\u00f4ng th\u1ec3 h\u1ee7y.', 404, ErrorCodes.ORDER_NOT_FOUND);
    }
    return { id: order.id, status: order.status };
  }

  async getStaffDirectBookingEvents(staffId, roles = []) {
    await ordersRepository.expirePendingOrders();
    const events = await ordersRepository.findStaffDirectBookingEvents({ staffId, roles });
    return events.map(mapStaffDirectEvent);
  }

  async createStaffDirectBooking(staffId, roles = [], payload) {
    await ordersRepository.expirePendingOrders();

    const normalizedItems = payload.items.map((item) => ({
      ticket_type_id: item.ticket_type_id,
      quantity: Number(item.quantity),
      session_seat_ids: item.session_seat_ids || [],
    }));
    const hasSelectedSeats = normalizedItems.some((item) => item.session_seat_ids.length > 0);

    // Use one transactional checkout path for every staff-direct payment
    // method.  The previous cash/no-seat shortcut used a separate INSERT
    // flow and could fail on installations with slightly different schema.
    // Cash is confirmed immediately below; bank transfer remains pending
    // until PayOS confirms it.
    if (['cash', 'bank_transfer'].includes(payload.payment_method)) {
      const paymentChannel =
        payload.payment_method === 'bank_transfer'
          ? await paymentsService.getOrganizerPayosChannelForEvent(payload.event_id)
          : null;
      const created = await ordersRepository.createPendingCheckout({
        // Use the staff member as the temporary hold owner while the order is
        // being created.  The order is converted to an offline/staff order
        // immediately afterwards, but keeping a real user id here is
        // important for seated bookings: ticket_holds and session_seats use
        // this value to validate ownership and some database deployments do
        // not accept NULL hold owners.
        userId: staffId,
        eventId: payload.event_id,
        buyer: {
          name: payload.buyer_name,
          email: payload.buyer_email ? payload.buyer_email.toLowerCase() : null,
          phone: normalizePhone(payload.buyer_phone),
        },
        promoCode: null,
        items: normalizedItems,
        totals: {
          subtotal: 0,
          total_amount: 0,
        },
        paymentChannel,
      });

      await ordersRepository.attachStaffDirectBookingMetadata({
        orderId: created.order.id,
        staffId,
        staffRoles: roles,
        paymentMethod: payload.payment_method,
        internalNote: payload.internal_note || null,
      });

      if (payload.payment_method !== 'bank_transfer') {
        await ordersRepository.confirmStaffDirectManualPayment({
          orderId: created.order.id,
          paymentMethod: payload.payment_method,
          staffId,
          rawPayload: {
            staffDirect: true,
            hasSelectedSeats,
          },
        });

        const confirmationEmailSent = await paymentsService.sendTicketConfirmation(created.order.id);

        const status = await ordersRepository.findStaffDirectBookingStatus({
          orderId: created.order.id,
          staffId,
          roles,
        });
        return {
          ...mapStaffDirectBooking(status),
          confirmation_email_sent: confirmationEmailSent,
        };
      }

      try {
        await paymentsService.createTicketOrderPayosLink({
          paymentOrder: created.paymentOrder,
          channel: paymentChannel,
          orderItems: created.orderItems,
          returnUrl: `${env.CLIENT_URL}/staff/direct-booking?directOrderId=${created.order.id}`,
          cancelUrl: `${env.CLIENT_URL}/staff/direct-booking?directOrderId=${created.order.id}&cancelled=true`,
        });
      } catch (error) {
        await ordersRepository.cancelOrder(created.order.id);
        throw new AppError(
          error.message || 'Unable to create PayOS payment link',
          502,
          ErrorCodes.DATABASE_ERROR,
        );
      }

      const status = await ordersRepository.findStaffDirectBookingStatus({
        orderId: created.order.id,
        staffId,
        roles,
      });
      return mapStaffDirectBooking(status);
    }

    const data = await ordersRepository.createStaffDirectBooking({
      staffId,
      staffRoles: roles,
      eventId: payload.event_id,
      buyer: {
        name: payload.buyer_name,
        email: payload.buyer_email ? payload.buyer_email.toLowerCase() : null,
        phone: normalizePhone(payload.buyer_phone),
      },
      paymentMethod: payload.payment_method,
      internalNote: payload.internal_note || null,
      items: normalizedItems,
    });

    const confirmationEmailSent = await paymentsService.sendTicketConfirmation(data.order.id);
    return {
      ...mapStaffDirectBooking(data),
      confirmation_email_sent: confirmationEmailSent,
    };
  }

  async getStaffDirectBookingStatus(staffId, roles = [], orderId) {
    await ordersRepository.expirePendingOrders();
    try {
      await paymentsService.syncTicketOrderFromPayosAnyUser(orderId);
    } catch (error) {
      // Keep counter status polling usable even if PayOS sync is temporarily unavailable.
    }
    const data = await ordersRepository.findStaffDirectBookingStatus({ orderId, staffId, roles });
    if (!data) {
      throw new AppError('Không tìm thấy booking trực tiếp.', 404, ErrorCodes.ORDER_NOT_FOUND);
    }
    return mapStaffDirectBooking(data);
  }

}

module.exports = new OrdersService();


