const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const env = require('../../config/env');
const ordersRepository = require('../orders/orders.repository');
const payosClient = require('../../infrastructure/payos/payos.client');
const paymentsRepository = require('./payments.repository');

class PaymentsService {
  async getOrganizerPayosChannelForEvent(eventId) {
    const channel = await paymentsRepository.findOrganizerPayosChannelForEvent(eventId);
    if (!channel) {
      throw new AppError(
        'Organizer has not configured payment channel.',
        400,
        ErrorCodes.ORDER_INVALID_ITEMS,
      );
    }
    return channel;
  }

  async createTicketOrderPayosLink({ paymentOrder, channel, orderItems }) {
    const paymentData = await payosClient.createPaymentLink({
      channel,
      order: paymentOrder,
      items: orderItems.map((item) => ({
        name: item.ticket_type_name || 'Event ticket',
        quantity: item.quantity,
        price: item.unit_price,
      })),
      returnUrl: `${env.CLIENT_URL}/payment-confirmation?orderId=${paymentOrder.order_id}`,
      cancelUrl: `${env.CLIENT_URL}/payment-confirmation?orderId=${paymentOrder.order_id}&cancelled=true`,
    });

    return paymentsRepository.attachPaymentLink(paymentOrder.id, paymentData);
  }

  async handlePayosWebhook(payload) {
    const data = payload.data || payload;
    const providerOrderCode = data.orderCode || data.order_code;
    const amount = data.amount;

    const paymentOrder = await paymentsRepository.findPaymentOrderByProviderCode(providerOrderCode);
    if (!paymentOrder) {
      throw new AppError('Payment order not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (!payosClient.verifyWebhookData(data, payload.signature, paymentOrder.checksum_key_encrypted)) {
      throw new AppError('Invalid PayOS webhook signature', 400, ErrorCodes.INVALID_INPUT);
    }

    const statusCode = data.code || payload.code;
    if (statusCode && statusCode !== '00') {
      return { ok: true, ignored: true };
    }

    await ordersRepository.confirmPayment({
      providerOrderCode,
      amount,
      transactionId: data.reference || data.transactionId || data.transaction_id,
      rawPayload: payload,
    });

    return { ok: true };
  }
}

module.exports = new PaymentsService();
