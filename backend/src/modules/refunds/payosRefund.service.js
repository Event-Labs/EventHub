const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore on Node versions that do not support it
}

const crypto = require('crypto');
const logger = require('../../core/logger');

const PAYOS_BASE_URL = process.env.PAYOS_BASE_URL || 'https://api-merchant.payos.vn';

let cachedServerIp = null;
let lastServerIpTime = 0;

async function getServerIp() {
  const now = Date.now();
  if (cachedServerIp && now - lastServerIpTime < 300000) {
    return cachedServerIp;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal }).finally(() => clearTimeout(timeout));
    const data = await res.json();
    if (data?.ip) {
      cachedServerIp = data.ip;
      lastServerIpTime = now;
      return cachedServerIp;
    }
  } catch (e) {
    // fallback
  }
  return cachedServerIp || '171.231.199.214';
}

// VietQR Bank BIN mappings (NAPAS 24/7)
const VIETQR_BANK_BINS = {
  vietcombank: '970436',
  vcb: '970436',
  vietinbank: '970415',
  ctg: '970415',
  bidv: '970418',
  agribank: '970405',
  vba: '970405',
  mbbank: '970422',
  mb: '970422',
  'mb bank': '970422',
  techcombank: '970407',
  tcb: '970407',
  acb: '970416',
  vpbank: '970432',
  vpb: '970432',
  tpbank: '970423',
  tpb: '970423',
  vib: '970441',
  sacombank: '970403',
  stb: '970403',
  hdbank: '970437',
  hdb: '970437',
  shb: '970443',
  seabank: '970468',
  ocb: '970448',
  msb: '970426',
  lpbank: '970449',
  lienvietpostbank: '970449',
  pvcombank: '970412',
  bacabank: '970409',
  namabank: '970428',
  kienlongbank: '970452',
  bvbank: '970454',
  vietcapitalbank: '970454',
  baovietbank: '970438',
  saigonbank: '970400',
  vietbank: '970433',
  ncb: '970419',
  shinhanbank: '970424',
  shinhan: '970424',
  wooribank: '970457',
  cake: '546034',
  timo: '963388',
  viettelmoney: '971005',
  vnptmoney: '971011',
};

function resolveBankBin(bankInput) {
  if (!bankInput) return null;
  const cleaned = String(bankInput).trim().toLowerCase();
  if (/^\d{6}$/.test(cleaned)) {
    return cleaned;
  }
  if (VIETQR_BANK_BINS[cleaned]) {
    return VIETQR_BANK_BINS[cleaned];
  }
  for (const [name, bin] of Object.entries(VIETQR_BANK_BINS)) {
    if (cleaned.includes(name) || name.includes(cleaned)) {
      return bin;
    }
  }
  return null;
}

/**
 * Deep sort object with optional array sorting
 * Matches official @payos/node sort-obj-by-key implementation
 */
function deepSortObj(obj, sortArrays = false) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      const value = obj[key];
      if (Array.isArray(value)) {
        if (sortArrays) {
          acc[key] = value
            .map((item) => (typeof item === 'object' && item !== null ? deepSortObj(item, sortArrays) : item))
            .sort((a, b) => {
              if (typeof a !== 'object' && typeof b !== 'object') return String(a).localeCompare(String(b));
              return JSON.stringify(a).localeCompare(JSON.stringify(b));
            });
        } else {
          acc[key] = value.map((item) =>
            typeof item === 'object' && item !== null ? deepSortObj(item, sortArrays) : item
          );
        }
      } else if (typeof value === 'object' && value !== null) {
        acc[key] = deepSortObj(value, sortArrays);
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});
}

/**
 * Creates HMAC-SHA256 signature for PayOS Payouts (x-signature header)
 * Matches official @payos/node NodeCryptoProvider specification
 */
function createPayoutSignature(data, checksumKey) {
  const sortedData = deepSortObj(data, false);
  const queryString = Object.keys(sortedData)
    .map((key) => {
      let value = sortedData[key];
      if (Array.isArray(value)) value = JSON.stringify(value);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) value = JSON.stringify(value);
      if (value === null || value === undefined) value = '';
      return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
    })
    .join('&');
  return crypto.createHmac('sha256', checksumKey).update(queryString).digest('hex');
}

class PayOSRefundService {
  /**
   * Processes a refund via PayOS API with idempotency and robust error handling.
   * Note: PayOS payment links (/v2/payment-requests) are direct VietQR transfers into the merchant's account
   * and do not support direct reversal/refund. Automated outbound refunds use PayOS Payouts (/v1/payouts/).
   *
   * @param {Object} params
   * @param {Object} params.refundRequest - The refund_requests row
   * @param {Object} params.paymentOrder - The payment_orders row for the order
   * @param {Object} params.channel - The organizer_payment_channels row
   * @param {number} params.amount - Refund amount to disburse
   * @param {Object} [params.options] - Testing / execution options
   * @returns {Promise<{ success: boolean, transactionId?: string, providerOrderCode?: number, error?: string, errorCode?: string }>}
   */
  async processRefund({ refundRequest, paymentOrder, channel, amount, options = {} }) {
    const refundId = refundRequest.id;
    const providerOrderCode = paymentOrder?.provider_order_code;
    const refundAmount = Math.round(Number(amount || refundRequest.refund_amount || 0));
    const hasDedicatedPayout = Boolean(channel?.payout_client_id && channel?.payout_api_key_encrypted);
    const activeClientId = hasDedicatedPayout ? channel.payout_client_id : channel?.client_id;
    const activeApiKey = hasDedicatedPayout ? channel.payout_api_key_encrypted : channel?.api_key_encrypted;
    const activeChecksumKey = hasDedicatedPayout
      ? channel.payout_checksum_key_encrypted
      : channel?.checksum_key_encrypted;

    logger.info(
      `[PAYOS_REFUND] Initiating refund refundId=${refundId} orderCode=${providerOrderCode} amount=${refundAmount} using ${hasDedicatedPayout ? 'DEDICATED Kênh chi' : 'INBOUND Kênh thu'} (clientId=${activeClientId?.slice(0, 8)}...)`,
    );

    // 1. Validation & Preconditions
    if (!paymentOrder) {
      return {
        success: false,
        error: 'Không tìm thấy thông tin đơn thanh toán PayOS ban đầu của đơn hàng.',
        errorCode: 'PAYMENT_ORDER_NOT_FOUND',
      };
    }

    if (!channel || !activeClientId || !activeApiKey) {
      return {
        success: false,
        error: 'Ban tổ chức chưa cấu hình hoặc thiếu thông tin kết nối cổng thanh toán PayOS.',
        errorCode: 'PAYOS_CHANNEL_NOT_CONFIGURED',
      };
    }

    if (hasDedicatedPayout && !activeChecksumKey) {
      return {
        success: false,
        error: 'Ban tổ chức chưa cấu hình Checksum Key của Kênh chi. Vui lòng vào Cài đặt thanh toán để cập nhật.',
        errorCode: 'PAYOUT_CHECKSUM_KEY_MISSING',
      };
    }

    if (refundAmount <= 0) {
      return {
        success: false,
        error: 'Số tiền hoàn phải lớn hơn 0.',
        errorCode: 'INVALID_REFUND_AMOUNT',
      };
    }

    // 2. Check for mock/simulation in test or configured environment
    if (options.mockSuccess || process.env.PAYOS_MOCK_REFUND === 'true') {
      const mockTxId = `MOCK_PAYOS_RF_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      logger.info(`[PAYOS_REFUND] Mock refund success refundId=${refundId} txId=${mockTxId}`);
      return {
        success: true,
        transactionId: mockTxId,
        providerOrderCode,
        rawData: { code: '00', desc: 'Mock refund successful', mock: true },
      };
    }

    if (options.mockFailure) {
      const failReason = options.mockFailureReason || 'PayOS Gateway balance insufficient';
      logger.warn(`[PAYOS_REFUND] Mock refund failure refundId=${refundId} reason=${failReason}`);
      return {
        success: false,
        error: failReason,
        errorCode: 'MOCK_GATEWAY_ERROR',
      };
    }

    // 3. Resolve destination bank account info (for PayOS Payouts /v1/payouts)
    const targetAccountNumber =
      refundRequest.bank_account_number ||
      options.toAccountNumber ||
      (process.env.NODE_ENV === 'test' ? '9704229999' : null);

    const targetBankName =
      refundRequest.bank_name ||
      options.bankName ||
      (process.env.NODE_ENV === 'test' ? 'MB Bank' : null);

    const targetBin = resolveBankBin(targetBankName) || options.toBin || (process.env.NODE_ENV === 'test' ? '970422' : null);

    if (!targetAccountNumber) {
      return {
        success: false,
        error: 'Khách hàng chưa cung cấp số tài khoản ngân hàng để thực hiện hoàn tiền tự động qua PayOS. Vui lòng chuyển khoản thủ công cho khách hàng.',
        errorCode: 'BANK_ACCOUNT_REQUIRED',
      };
    }

    if (!targetBin) {
      return {
        success: false,
        error: `Không thể xác định mã ngân hàng (BIN) từ tên "${targetBankName || 'N/A'}". Vui lòng chọn phương thức Chuyển khoản thủ công.`,
        errorCode: 'INVALID_BANK_BIN',
      };
    }

    // 4. Prepare PayOS Payout Request (/v1/payouts/)
    const endpoint = process.env.PAYOS_REFUND_ENDPOINT || `${PAYOS_BASE_URL}/v1/payouts/`;

    const referenceId = `RF_${String(refundId).replace(/-/g, '').slice(0, 12)}_${Date.now()}`;
    const requestBody = {
      referenceId,
      amount: refundAmount,
      description: `Hoan tien don ${paymentOrder.order_id || providerOrderCode || refundId}`.slice(0, 25),
      toBin: targetBin,
      toAccountNumber: String(targetAccountNumber).trim(),
    };

    const idempotencyKey = `idemp-${refundId}`;
    const headers = {
      'Content-Type': 'application/json',
      'x-client-id': activeClientId,
      'x-api-key': activeApiKey,
      'x-idempotency-key': idempotencyKey,
    };

    if (activeChecksumKey) {
      headers['x-signature'] = createPayoutSignature(requestBody, activeChecksumKey);
    }

    let timeoutId;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const json = await response.json().catch(() => ({}));

      const isCodeSuccess = json.code === '00' || json.code === '0' || json.code === 0;
      const approvalState = json.data?.approvalState;
      const firstTx = json.data?.transactions?.[0];
      const firstTxState = firstTx?.state;
      const isStateFailed =
        approvalState === 'FAILED' ||
        approvalState === 'REJECTED' ||
        approvalState === 'CANCELLED' ||
        firstTxState === 'FAILED' ||
        firstTxState === 'CANCELLED';

      if (!response.ok || !isCodeSuccess || isStateFailed) {
        let errorDesc = firstTx?.errorMessage || json.desc || json.message || '';

        // Map known PayOS responses to clear, actionable Vietnamese messages
        if (
          String(json.code) === '601' ||
          errorDesc.toLowerCase().includes('api key không tồn tại')
        ) {
          errorDesc =
            `Tài khoản PayOS của Ban tổ chức chưa kích hoạt dịch vụ Chi hộ (Payouts) trên payOS (Lỗi 601: ${errorDesc || 'API key không tồn tại trên hệ thống chi hộ'}). Do cổng PayOS chỉ nhận tiền vào tài khoản ngân hàng và không tự động trừ tiền để hoàn trả, Ban tổ chức vui lòng chọn phương thức "Chuyển khoản thủ công" (quét mã VietQR hoặc chuyển trực tiếp) để hoàn tiền cho khách hàng.`;
        } else if (
          errorDesc.toLowerCase().includes('địa chỉ ip') ||
          errorDesc.toLowerCase().includes('ip không được phép') ||
          errorDesc.toLowerCase().includes('ip') ||
          (response.status === 403 && (String(json.code) === '403' || String(json.code) === 'IP_BLOCKED'))
        ) {
          const currentIp = await getServerIp();
          errorDesc = `Cổng PayOS từ chối lệnh chi do IP máy chủ chưa được thêm vào IP Whitelist (${json.desc || errorDesc || 'Địa chỉ IP không được phép truy cập'}). Hệ thống đã lấy chính xác bộ khóa Kênh chi (Client ID: ${activeClientId?.slice(0, 8)}...). Vui lòng vào my.payos.vn > Kênh chi > Cài đặt > thêm địa chỉ IP "${currentIp}" vào danh sách "IP Whitelist", hoặc chọn phương thức "Chuyển khoản thủ công".`;
        } else if (
          response.status === 404 ||
          errorDesc.toLowerCase().includes('endpoint not found') ||
          errorDesc.toLowerCase().includes('not found')
        ) {
          errorDesc =
            'Cổng PayOS chưa kích hoạt Kênh chi (Payouts) cho tài khoản này (hoặc tính năng chi hộ tự động chưa được mở). Do PayOS nhận tiền trực tiếp về tài khoản ngân hàng và không hỗ trợ hoàn tiền đảo chiều tự động trên link thanh toán, vui lòng chọn phương thức "Chuyển khoản thủ công" để hoàn tiền cho khách hàng.';
        } else if (
          response.status === 403 ||
          errorDesc.toLowerCase().includes('forbidden') ||
          errorDesc.toLowerCase().includes('permission')
        ) {
          errorDesc =
            `Tài khoản PayOS từ chối thực hiện lệnh Chi hộ (Lỗi 403: ${errorDesc || 'Forbidden'}). Vui lòng kiểm tra lại quyền Chi hộ của API Key hoặc chọn phương thức "Chuyển khoản thủ công".`;
        } else if (
          errorDesc.toLowerCase().includes('balance') ||
          errorDesc.toLowerCase().includes('số dư') ||
          errorDesc.toLowerCase().includes('không đủ')
        ) {
          errorDesc = `Số dư tài khoản Chi hộ PayOS không đủ để thực hiện hoàn tiền (${errorDesc}). Vui lòng nạp thêm tiền vào ví Bảo Kim hoặc chọn phương thức "Chuyển khoản thủ công".`;
        } else if (!errorDesc) {
          errorDesc = `Lỗi từ cổng PayOS (${response.status}): ${response.statusText || 'Giao dịch không thành công'}`;
        }

        logger.error(
          `[PAYOS_REFUND] PayOS refund API returned error refundId=${refundId} status=${response.status} code=${json.code} desc=${errorDesc}`,
        );

        return {
          success: false,
          error: errorDesc,
          errorCode: firstTx?.errorCode || json.code || `HTTP_${response.status}`,
          rawData: json,
        };
      }

      const transactionId =
        firstTx?.id ||
        firstTx?.reference ||
        json.data?.id ||
        json.data?.transactionId ||
        json.data?.transactions?.[0]?.id ||
        json.data?.reference ||
        referenceId;

      logger.info(
        `[PAYOS_REFUND] PayOS refund succeeded refundId=${refundId} txId=${transactionId}`,
      );

      return {
        success: true,
        transactionId,
        providerOrderCode,
        rawData: json.data || json,
      };
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      const errorMessage = isTimeout
        ? 'Kết nối tới cổng PayOS quá thời gian chờ (Timeout).'
        : `Lỗi kết nối PayOS: ${err.message}`;

      logger.error(
        `[PAYOS_REFUND] PayOS refund network exception refundId=${refundId} error=${err.message}`,
        err,
      );

      return {
        success: false,
        error: errorMessage,
        errorCode: isTimeout ? 'PAYOS_TIMEOUT' : 'PAYOS_NETWORK_ERROR',
      };
    }
  }
}

module.exports = new PayOSRefundService();
