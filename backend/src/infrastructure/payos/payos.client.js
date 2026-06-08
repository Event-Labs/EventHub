const crypto = require('crypto');

const PAYOS_BASE_URL = process.env.PAYOS_BASE_URL || 'https://api-merchant.payos.vn';

function sortObject(data) {
  return Object.keys(data || {})
    .sort()
    .reduce((acc, key) => {
      const value = data[key];
      if (value !== undefined && value !== null) acc[key] = value;
      return acc;
    }, {});
}

function createSignature(data, checksumKey) {
  const raw = Object.entries(sortObject(data))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return crypto.createHmac('sha256', checksumKey).update(raw).digest('hex');
}

function verifyWebhookData(data, signature, checksumKey) {
  if (!data || !signature || !checksumKey) return false;
  return createSignature(data, checksumKey) === signature;
}

async function createPaymentLink({ channel, order, items, returnUrl, cancelUrl }) {
  const body = {
    orderCode: Number(order.provider_order_code),
    amount: Number(order.amount),
    description: order.description,
    returnUrl,
    cancelUrl,
    items: items.map((item) => ({
      name: item.name,
      quantity: Number(item.quantity),
      price: Number(item.price),
    })),
    expiredAt: Math.floor(new Date(order.expired_at).getTime() / 1000),
  };

  body.signature = createSignature(
    {
      amount: body.amount,
      cancelUrl: body.cancelUrl,
      description: body.description,
      orderCode: body.orderCode,
      returnUrl: body.returnUrl,
    },
    channel.checksum_key_encrypted,
  );

  const response = await fetch(`${PAYOS_BASE_URL}/v2/payment-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': channel.client_id,
      'x-api-key': channel.api_key_encrypted,
    },
    body: JSON.stringify(body),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.code !== '00') {
    const message = json.desc || json.message || 'Unable to create PayOS payment link';
    throw new Error(message);
  }

  return json.data || {};
}

module.exports = {
  createPaymentLink,
  verifyWebhookData,
};
