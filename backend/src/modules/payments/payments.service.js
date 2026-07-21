const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const env = require('../../config/env');
const ordersRepository = require('../orders/orders.repository');
const payosClient = require('../../infrastructure/payos/payos.client');
const paymentsRepository = require('./payments.repository');
const ticketConfirmationEmail = require('../tickets/ticketConfirmationEmail.service');
const logger = require('../../core/logger');

function isPayosPaid(paymentData, paymentOrder) {
  const status = String(paymentData.status || paymentData.paymentStatus || '').toUpperCase();
  const paidStatuses = new Set(['PAID', 'PAID_SUCCESS', 'SUCCEEDED', 'SUCCESS', 'COMPLETED']);
  const amountPaid = Number(paymentData.amountPaid || paymentData.paidAmount || 0);
  return paidStatuses.has(status) || amountPaid >= Number(paymentOrder.amount || 0);
}

class PaymentsService {
  async sendTicketConfirmation(orderId) {
    try {
      const details = await ordersRepository.findPaidOrderEmailDetails(orderId);
      if (!details) return false;
      return await ticketConfirmationEmail.sendOrderConfirmation(details.order, details.tickets);
    } catch (error) {
      logger.error(`Could not prepare ticket email for order ${orderId}: ${error.message}`);
      return false;
    }
  }

  async confirmAndNotify(args) {
    const result = await ordersRepository.confirmPayment(args);
    if (!result.alreadyPaid) {
      await this.sendTicketConfirmation(result.order.id);
    }
    return result;
  }

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

  async createTicketOrderPayosLink({ paymentOrder, channel, orderItems, returnUrl, cancelUrl }) {
    const paymentData = await payosClient.createPaymentLink({
      channel,
      order: paymentOrder,
      items: orderItems.map((item) => ({
        name: item.ticket_type_name || 'Event ticket',
        quantity: item.quantity,
        price: item.unit_price,
      })),
      returnUrl: returnUrl || `${env.CLIENT_URL}/payment-confirmation?orderId=${paymentOrder.order_id}`,
      cancelUrl: cancelUrl || `${env.CLIENT_URL}/payment-confirmation?orderId=${paymentOrder.order_id}&cancelled=true`,
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

    await this.confirmAndNotify({
      providerOrderCode,
      amount,
      transactionId: data.reference || data.transactionId || data.transaction_id,
      rawPayload: payload,
    });

    return { ok: true };
  }

  async syncTicketOrderFromPayos(orderId, userId) {
    const paymentOrder = await paymentsRepository.findLatestPaymentOrderWithChannelByOrderId(orderId, userId);
    if (!paymentOrder || paymentOrder.status !== 'PENDING') {
      return null;
    }

    const paymentData = await payosClient.getPaymentLinkInformation({
      channel: paymentOrder,
      providerOrderCode: paymentOrder.provider_order_code,
    });

    if (!isPayosPaid(paymentData, paymentOrder)) {
      return paymentData;
    }

    await this.confirmAndNotify({
      providerOrderCode: paymentOrder.provider_order_code,
      amount: paymentData.amount || paymentData.amountPaid || paymentOrder.amount,
      transactionId:
        paymentData.reference ||
        paymentData.transactionId ||
        paymentData.transaction_id ||
        String(paymentOrder.provider_order_code),
      rawPayload: { source: 'payos_status_sync', data: paymentData },
    });

    return paymentData;
  }

  async syncTicketOrderFromPayosAnyUser(orderId) {
    const paymentOrder = await paymentsRepository.findLatestPaymentOrderWithChannelByOrderIdAnyUser(orderId);
    if (!paymentOrder || paymentOrder.status !== 'PENDING') {
      return null;
    }

    const paymentData = await payosClient.getPaymentLinkInformation({
      channel: paymentOrder,
      providerOrderCode: paymentOrder.provider_order_code,
    });

    if (!isPayosPaid(paymentData, paymentOrder)) {
      return paymentData;
    }

    await this.confirmAndNotify({
      providerOrderCode: paymentOrder.provider_order_code,
      amount: paymentData.amount || paymentData.amountPaid || paymentOrder.amount,
      transactionId:
        paymentData.reference ||
        paymentData.transactionId ||
        paymentData.transaction_id ||
        String(paymentOrder.provider_order_code),
      rawPayload: { source: 'staff_direct_payos_status_sync', data: paymentData },
    });

    return paymentData;
  }
}

module.exports = new PaymentsService();
