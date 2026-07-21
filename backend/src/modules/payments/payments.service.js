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
      logger.info(`[PAYMENT_EMAIL] preparing orderId=${orderId}`);
      const details = await ordersRepository.findPaidOrderEmailDetails(orderId);
      if (!details) {
        logger.warn(`[PAYMENT_EMAIL] skipped orderId=${orderId} reason=paid_order_details_not_found`);
        return false;
      }
      logger.info(`[PAYMENT_EMAIL] details loaded orderId=${orderId} ticketCount=${details.tickets.length} hasRecipient=${Boolean(details.order.buyer_email)}`);
      const sent = await ticketConfirmationEmail.sendOrderConfirmation(details.order, details.tickets);
      logger.info(`[PAYMENT_EMAIL] finished orderId=${orderId} sent=${sent}`);
      return sent;
    } catch (error) {
      logger.error(`[PAYMENT_EMAIL] failed orderId=${orderId} code=${error.code || 'unknown'} message=${JSON.stringify(error.message || '')} stack=${JSON.stringify(error.stack || '')}`);
      return false;
    }
  }

  async confirmAndNotify(args) {
    logger.info(`[PAYMENT_CONFIRM] started providerOrderCode=${args.providerOrderCode || 'missing'} transactionId=${args.transactionId || 'missing'} amount=${args.amount ?? 'missing'}`);
    const result = await ordersRepository.confirmPayment(args);
    if (!result.alreadyPaid) {
      logger.info(`[PAYMENT_CONFIRM] order paid orderId=${result.order.id} issuedTickets=${result.issuedTickets?.length || 0}`);
      const emailSent = await this.sendTicketConfirmation(result.order.id);
      logger.info(`[PAYMENT_CONFIRM] notification completed orderId=${result.order.id} emailSent=${emailSent}`);
    } else {
      logger.warn(`[PAYMENT_CONFIRM] already paid orderId=${result.orderId}; confirmation email is not retried`);
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

    logger.info(`[PAYOS_WEBHOOK] received providerOrderCode=${providerOrderCode || 'missing'} amount=${amount ?? 'missing'} code=${data.code || payload.code || 'missing'} hasSignature=${Boolean(payload.signature)}`);

    const paymentOrder = await paymentsRepository.findPaymentOrderByProviderCode(providerOrderCode);
    if (!paymentOrder) {
      logger.warn(`[PAYOS_WEBHOOK] payment order not found providerOrderCode=${providerOrderCode || 'missing'}`);
      throw new AppError('Payment order not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (!payosClient.verifyWebhookData(data, payload.signature, paymentOrder.checksum_key_encrypted)) {
      logger.warn(`[PAYOS_WEBHOOK] invalid signature providerOrderCode=${providerOrderCode}`);
      throw new AppError('Invalid PayOS webhook signature', 400, ErrorCodes.INVALID_INPUT);
    }

    const statusCode = data.code || payload.code;
    if (statusCode && statusCode !== '00') {
      logger.info(`[PAYOS_WEBHOOK] ignored providerOrderCode=${providerOrderCode} statusCode=${statusCode}`);
      return { ok: true, ignored: true };
    }

    await this.confirmAndNotify({
      providerOrderCode,
      amount,
      transactionId: data.reference || data.transactionId || data.transaction_id,
      rawPayload: payload,
    });

    logger.info(`[PAYOS_WEBHOOK] processed providerOrderCode=${providerOrderCode}`);

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
