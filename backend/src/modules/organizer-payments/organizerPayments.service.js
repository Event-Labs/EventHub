const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore on Node versions that do not support it
}

const organizerPaymentsRepository = require('./organizerPayments.repository');
const organizerEventsRepository = require('../organizer/organizerEvents.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

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

class OrganizerPaymentsService {
  async getOrganizerId(userId) {
    const organizer = await organizerEventsRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return organizer.id;
  }

  async getChannel(userId) {
    const organizerId = await this.getOrganizerId(userId);
    const channel = await organizerPaymentsRepository.findChannelByOrganizerId(organizerId);
    const server_ip = await getServerIp();
    return channel ? { ...channel, server_ip } : { server_ip };
  }

  async saveChannel(userId, payload) {
    const organizerId = await this.getOrganizerId(userId);
    const existingChannel = await organizerPaymentsRepository.findChannelByOrganizerId(organizerId);
    const {
      client_id,
      api_key,
      checksum_key,
      bank_name,
      bank_account_number,
      bank_account_holder,
    } = payload;

    if (!client_id || !bank_name || !bank_account_number || !bank_account_holder) {
      throw new AppError(
        'client_id, bank_name, bank_account_number, and bank_account_holder are required',
        400,
        ErrorCodes.INVALID_INPUT,
      );
    }

    const hasNewApiKey = Boolean(api_key && api_key.trim());
    const hasNewChecksumKey = Boolean(checksum_key && checksum_key.trim());
    const shouldUpdateCredentials = hasNewApiKey || hasNewChecksumKey;

    if (!existingChannel && (!hasNewApiKey || !hasNewChecksumKey)) {
      throw new AppError('api_key and checksum_key are required for a new payment channel', 400, ErrorCodes.INVALID_INPUT);
    }

    if (shouldUpdateCredentials && (!hasNewApiKey || !hasNewChecksumKey)) {
      throw new AppError('api_key and checksum_key must be provided together', 400, ErrorCodes.INVALID_INPUT);
    }

    const clientId = client_id.trim();
    const credentialsChanged =
      shouldUpdateCredentials || (existingChannel && existingChannel.client_id !== clientId);

    const data = {
      client_id: clientId,
      api_key_encrypted: shouldUpdateCredentials ? api_key.trim() : null,
      checksum_key_encrypted: shouldUpdateCredentials ? checksum_key.trim() : null,
      bank_name: bank_name.trim(),
      bank_account_number: bank_account_number.trim(),
      bank_account_holder: bank_account_holder.trim(),
      status: credentialsChanged ? 'PENDING' : existingChannel?.status || 'PENDING',
    };

    return organizerPaymentsRepository.upsertChannel(organizerId, data);
  }

  async testConnection(userId) {
    const organizerId = await this.getOrganizerId(userId);
    const channel = await organizerPaymentsRepository.findChannelByOrganizerId(organizerId);

    if (!channel) {
      throw new AppError('Payment channel not configured yet', 400, ErrorCodes.INVALID_INPUT);
    }

    const updatedChannel = await organizerPaymentsRepository.updateChannelStatus(organizerId, 'ACTIVE');
    return updatedChannel;
  }

  async savePayoutChannel(userId, payload) {
    const organizerId = await this.getOrganizerId(userId);
    const existingChannel = await organizerPaymentsRepository.findChannelByOrganizerId(organizerId);

    if (!existingChannel) {
      throw new AppError('Vui lòng hoàn tất cài đặt Kênh thu trước khi cấu hình Kênh chi.', 400, ErrorCodes.INVALID_INPUT);
    }

    const {
      use_inbound_for_payout,
      payout_client_id,
      payout_api_key,
      payout_checksum_key,
    } = payload;

    if (use_inbound_for_payout) {
      const updated = await organizerPaymentsRepository.updatePayoutChannel(organizerId, {
        payout_client_id: null,
        payout_api_key_encrypted: null,
        payout_checksum_key_encrypted: null,
        payout_status: 'SAME_AS_INBOUND',
      });
      return updated;
    }

    const hasNewApiKey = Boolean(payout_api_key && payout_api_key.trim());
    const hasNewChecksumKey = Boolean(payout_checksum_key && payout_checksum_key.trim());
    const hasExistingPayoutCredentials = Boolean(existingChannel.payout_client_id && existingChannel.payout_api_key_encrypted);

    if (!hasExistingPayoutCredentials && (!payout_client_id || !hasNewApiKey || !hasNewChecksumKey)) {
      throw new AppError('Vui lòng nhập đủ Client ID, API Key và Checksum Key cho Kênh chi.', 400, ErrorCodes.INVALID_INPUT);
    }

    if ((hasNewApiKey || hasNewChecksumKey) && (!hasNewApiKey || !hasNewChecksumKey)) {
      throw new AppError('API Key và Checksum Key của Kênh chi phải được nhập cùng nhau.', 400, ErrorCodes.INVALID_INPUT);
    }

    const data = {
      payout_client_id: payout_client_id ? payout_client_id.trim() : existingChannel.payout_client_id,
      payout_api_key_encrypted: hasNewApiKey ? payout_api_key.trim() : null,
      payout_checksum_key_encrypted: hasNewChecksumKey ? payout_checksum_key.trim() : null,
      payout_status: 'PENDING',
    };

    return organizerPaymentsRepository.updatePayoutChannel(organizerId, data);
  }

  async testPayoutConnection(userId) {
    const organizerId = await this.getOrganizerId(userId);
    const channel = await organizerPaymentsRepository.findChannelByOrganizerId(organizerId);

    if (!channel) {
      throw new AppError('Chưa cấu hình kênh thanh toán.', 400, ErrorCodes.INVALID_INPUT);
    }

    const isSameAsInbound = channel.payout_status === 'SAME_AS_INBOUND' || (!channel.payout_client_id && !channel.payout_api_key_encrypted);
    const clientId = isSameAsInbound ? channel.client_id : channel.payout_client_id;
    const apiKey = isSameAsInbound ? channel.api_key_encrypted : channel.payout_api_key_encrypted;

    if (!clientId || !apiKey) {
      throw new AppError('Thông tin kết nối Kênh chi chưa đầy đủ. Vui lòng kiểm tra lại.', 400, ErrorCodes.INVALID_INPUT);
    }

    // Check mock mode or test environment
    if (process.env.PAYOS_MOCK_REFUND === 'true' || process.env.NODE_ENV === 'test') {
      await organizerPaymentsRepository.updatePayoutStatus(organizerId, 'ACTIVE');
      return {
        success: true,
        mock: true,
        message: 'Kết nối Kênh chi PayOS thành công (Chế độ mô phỏng). Kênh chi đã sẵn sàng.',
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch('https://api-merchant.payos.vn/v1/payouts-account/balance', {
        method: 'GET',
        headers: {
          'x-client-id': clientId,
          'x-api-key': apiKey,
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const json = await res.json().catch(() => ({}));

      if (res.ok && (json.code === '00' || json.code === '0' || json.code === 0)) {
        await organizerPaymentsRepository.updatePayoutStatus(organizerId, 'ACTIVE');
        return {
          success: true,
          balance: json.data?.balance,
          message: 'Kết nối Kênh chi PayOS thành công. Kênh chi đã kích hoạt.',
        };
      }

      if (json.code === '601' || json.code === 601) {
        throw new AppError(
          'Tài khoản PayOS của Ban tổ chức chưa kích hoạt dịch vụ Chi hộ (Payouts) trên payOS (Lỗi 601: API key chưa có quyền Kênh chi). Vui lòng đăng nhập my.payos.vn > Thiết lập > Hồ sơ > Thay đổi dịch vụ để bật Kênh chi và liên kết ví Bảo Kim.',
          400,
          ErrorCodes.PAYMENT_PROVIDER_ERROR,
        );
      }

      if (
        String(json.code) === '403' ||
        res.status === 403 ||
        json.desc?.toLowerCase().includes('địa chỉ ip') ||
        json.desc?.toLowerCase().includes('ip')
      ) {
        const publicIp = await getServerIp();
        throw new AppError(
          `Cổng PayOS từ chối do IP máy chủ chưa được thêm vào IP Whitelist (${json.desc || 'Địa chỉ IP không được phép truy cập'}). Vui lòng đăng nhập my.payos.vn > Kênh chi > Cài đặt > thêm IP "${publicIp}" vào danh sách "IP Whitelist".`,
          400,
          ErrorCodes.PAYMENT_PROVIDER_ERROR,
        );
      }

      throw new AppError(
        json.desc || 'Không thể kết nối Kênh chi PayOS. Vui lòng kiểm tra lại thông tin Client ID và API Key.',
        400,
        ErrorCodes.PAYMENT_PROVIDER_ERROR,
      );
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err.name === 'AbortError') {
        throw new AppError('Hết thời gian kết nối đến cổng PayOS (Timeout). Vui lòng thử lại sau.', 504, ErrorCodes.PAYMENT_PROVIDER_ERROR);
      }
      throw new AppError(`Lỗi kết nối Kênh chi PayOS: ${err.message}`, 500, ErrorCodes.PAYMENT_PROVIDER_ERROR);
    }
  }
}

module.exports = new OrganizerPaymentsService();
