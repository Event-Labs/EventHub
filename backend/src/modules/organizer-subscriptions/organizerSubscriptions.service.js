const organizerSubscriptionsRepository = require('./organizerSubscriptions.repository');
const subscriptionsRepository = require('../admin/subscriptions.repository');
const subPaymentRepository = require('./organizerSubscriptions.payment.repository');
const payosClient = require('../../infrastructure/payos/payos.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const env = require('../../config/env');

// Hold a pending payment for 15 minutes
const PAYMENT_HOLD_MINUTES = 15;

class OrganizerSubscriptionsService {
  async getCurrentPlan(userId) {
    const current = await organizerSubscriptionsRepository.findCurrentSubscription(userId);
    if (!current) {
      return { active: false, plan: null, days_remaining: null };
    }

    return {
      active: true,
      plan: current,
      days_remaining: current.end_date
        ? Math.max(
            0,
            Math.ceil(
              (new Date(current.end_date) - new Date()) / (1000 * 60 * 60 * 24),
            ),
          )
        : null,
    };
  }

  /**
   * Initiate subscription purchase.
   *
   * - If platform PayOS is configured  → create payment link, return checkout_url + qr_code
   * - If not configured (dev/free plan) → activate immediately (legacy behaviour)
   */
  async subscribeToPlan(userId, subscriptionId) {
    const plan = await subscriptionsRepository.findById(subscriptionId);
    if (!plan || !plan.is_active) {
      throw new AppError(
        'Gói dịch vụ không tồn tại hoặc đã bị vô hiệu hoá.',
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
    }

    const platformChannel = subPaymentRepository.getPlatformChannel();

    // ── Free plan or PayOS not configured → activate immediately ──────────
    if (!platformChannel || Number(plan.price) === 0) {
      const reason = !platformChannel ? 'no platform channel' : 'free plan';
      require('../../core/logger').info(`[Subscriptions] Direct activation (${reason}) for plan ${plan.name}`);
      await organizerSubscriptionsRepository.cancelActiveSubscriptions(userId);
      const newSub = await organizerSubscriptionsRepository.activateNewSubscription(
        userId,
        subscriptionId,
        plan.duration_days || 30,
      );
      return { requires_payment: false, subscription: newSub };
    }

    // ── Paid plan with PayOS ───────────────────────────────────────────────
    const organizerId = await organizerSubscriptionsRepository.findOrganizerIdByUserId(userId);
    if (!organizerId) {
      throw new AppError('Organizer profile not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const providerOrderCode = Date.now(); // numeric, unique enough for PayOS
    const expiredAt = new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60 * 1000);
    const description = `Sub ${plan.name}`.slice(0, 25); // PayOS max 25 chars

    const paymentRecord = await subPaymentRepository.createPending({
      organizerId,
      subscriptionId,
      amount:            Number(plan.price),
      description,
      providerOrderCode,
      expiredAt,
    });

    // Build PayOS link
    const payosOrder = {
      provider_order_code: providerOrderCode,
      amount:              Number(plan.price),
      description,
      expired_at:          expiredAt.toISOString(),
    };

    const paymentData = await payosClient.createPaymentLink({
      channel:   platformChannel,
      order:     payosOrder,
      items: [{
        name:     plan.name,
        quantity: 1,
        price:    Number(plan.price),
      }],
      returnUrl: `${env.CLIENT_URL}/organizer/subscriptions/payment-result?paymentId=${paymentRecord.id}`,
      cancelUrl: `${env.CLIENT_URL}/organizer/subscriptions/payment-result?paymentId=${paymentRecord.id}&cancelled=true`,
    });

    await subPaymentRepository.attachPaymentLink(paymentRecord.id, {
      checkoutUrl: paymentData.checkoutUrl,
      qrCode:      paymentData.qrCode,
    });

    return {
      requires_payment: true,
      payment_id:       paymentRecord.id,
      checkout_url:     paymentData.checkoutUrl,
      qr_code:          paymentData.qrCode,
      amount:           Number(plan.price),
      expired_at:       expiredAt.toISOString(),
      plan: {
        id:   plan.id,
        name: plan.name,
      },
    };
  }

  /**
   * Get the status of a pending subscription payment and sync with PayOS if needed.
   */
  async getPaymentStatus(userId, paymentId) {
    const record = await subPaymentRepository.findById(paymentId);
    if (!record) {
      throw new AppError('Payment record not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    // Verify this payment belongs to the requesting organizer
    const organizerId = await organizerSubscriptionsRepository.findOrganizerIdByUserId(userId);
    if (!organizerId || record.organizer_id !== organizerId) {
      throw new AppError('Forbidden', 403, ErrorCodes.AUTH_FORBIDDEN);
    }

    // If already paid, return current plan
    if (record.status === 'PAID') {
      const current = await this.getCurrentPlan(userId);
      return { status: 'PAID', payment: record, current_plan: current };
    }

    // Check expiry
    if (new Date(record.expired_at) < new Date()) {
      await subPaymentRepository.markExpired(paymentId);
      return { status: 'EXPIRED', payment: record };
    }

    // Try to sync from PayOS
    const platformChannel = subPaymentRepository.getPlatformChannel();
    if (platformChannel && record.status === 'PENDING') {
      try {
        const payosData = await payosClient.getPaymentLinkInformation({
          channel:           platformChannel,
          providerOrderCode: record.provider_order_code,
        });

        const isPaid = ['PAID', 'SUCCESS', 'COMPLETED'].includes(
          String(payosData.status || '').toUpperCase(),
        ) || Number(payosData.amountPaid || 0) >= Number(record.amount);

        if (isPaid) {
          return await this._activateAfterPayment(record, userId);
        }
      } catch (_) {
        // PayOS sync failed — return current pending status
      }
    }

    return { status: record.status, payment: record };
  }

  /**
   * Handle PayOS webhook for subscription payment.
   */
  async handlePayosWebhook(payload) {
    const data = payload.data || payload;
    const providerOrderCode = data.orderCode || data.order_code;

    const record = await subPaymentRepository.findByProviderOrderCode(providerOrderCode);
    if (!record) return null; // not a subscription payment

    const platformChannel = subPaymentRepository.getPlatformChannel();
    if (!platformChannel) return null;

    if (!payosClient.verifyWebhookData(data, payload.signature, platformChannel.checksum_key_encrypted)) {
      throw new AppError('Invalid PayOS webhook signature', 400, ErrorCodes.INVALID_INPUT);
    }

    const statusCode = data.code || payload.code;
    if (statusCode && statusCode !== '00') return { ok: true, ignored: true };

    if (record.status !== 'PENDING') return { ok: true, already_processed: true };

    // Find userId from organizer_id
    const { rows } = await require('../../infrastructure/database/db.client').query(
      `SELECT user_id FROM organizers WHERE id = $1 LIMIT 1`,
      [record.organizer_id],
    );
    const userId = rows[0]?.user_id;
    if (!userId) return { ok: true, ignored: true };

    await this._activateAfterPayment(record, userId);
    return { ok: true };
  }

  async _activateAfterPayment(record, userId) {
    if (record.status === 'PAID') {
      const current = await this.getCurrentPlan(userId);
      return { status: 'PAID', payment: record, current_plan: current };
    }

    const plan = await subscriptionsRepository.findById(record.subscription_id);
    await organizerSubscriptionsRepository.cancelActiveSubscriptions(userId);
    const newSub = await organizerSubscriptionsRepository.activateNewSubscription(
      userId,
      record.subscription_id,
      plan?.duration_days || 30,
    );

    const updated = await subPaymentRepository.markPaid(record.id, newSub.id);
    const current  = await this.getCurrentPlan(userId);

    return { status: 'PAID', payment: updated, current_plan: current };
  }
}

module.exports = new OrganizerSubscriptionsService();
