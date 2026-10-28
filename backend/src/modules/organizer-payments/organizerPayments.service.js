const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore on Node versions that do not support it
}

const organizerPaymentsRepository = require('./organizerPayments.repository');
const organizerEventsRepository = require('../organizer/organizerEvents.repository');
const organizerEgressService = require('../egress/organizerEgress.service');
const fieldCrypto = require('../../core/security/fieldCrypto');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

const FIELD = {
  API_KEY: 'payos_api_key',
  CHECKSUM_KEY: 'payos_checksum_key',
  PAYOUT_API_KEY: 'payos_payout_api_key',
  PAYOUT_CHECKSUM_KEY: 'payos_payout_checksum_key',
  BANK_ACCOUNT: 'bank_account_number',
};
const LEGACY = { allowLegacy: true }; // TODO: xóa allowLegacy sau khi toàn bộ dữ liệu DB đã được migrate mã hóa
const isValidSecret = (s) => /^[\w-]{16,200}$/.test(s);

class OrganizerPaymentsService {
  _dec(channel, column, field) {
    if (!channel || channel[column] === null || channel[column] === undefined) return null;
    try {
      return fieldCrypto.decrypt(channel[column], channel.organizer_id, field, LEGACY);
    } catch {
      throw new AppError('Không thể giải mã thông tin xác thực', 500, ErrorCodes.PAYMENT_PROVIDER_ERROR);
    }
  }

  toPublicChannel(c) {
    if (!c) return null;
    let bankAccountMasked = null;
    if (c.bank_account_number) {
      try {
        const decryptedAcc = fieldCrypto.decrypt(c.bank_account_number, c.organizer_id, FIELD.BANK_ACCOUNT, LEGACY);
        bankAccountMasked = fieldCrypto.maskTail(decryptedAcc);
      } catch {
        bankAccountMasked = fieldCrypto.maskTail(c.bank_account_number);
      }
    }

    return {
      id: c.id,
      organizer_id: c.organizer_id,
      provider: c.provider,
      client_id: c.client_id,
      has_api_key: Boolean(c.api_key_encrypted),
      has_checksum_key: Boolean(c.checksum_key_encrypted),
      bank_name: c.bank_name,
      bank_account_holder: c.bank_account_holder,
      bank_account_masked: bankAccountMasked,
      status: c.status,
      payout_client_id: c.payout_client_id,
      has_payout_api_key: Boolean(c.payout_api_key_encrypted),
      has_payout_checksum_key: Boolean(c.payout_checksum_key_encrypted),
      payout_status: c.payout_status,
      is_default: c.is_default,
      created_at: c.created_at,
      updated_at: c.updated_at,
    };
  }

  /**
   * CHỈ DÙNG NỘI BỘ: Giải mã và trả về credentials để gọi PayOS.
   * TUYỆT ĐỐI không bao giờ trả kết quả này ra controller/response/log.
   */
  async getDecryptedCredentials(organizerId) {
    const channel = await organizerPaymentsRepository.findChannelByOrganizerId(organizerId);
    if (!channel) return null;

    const apiKey = this._dec(channel, 'api_key_encrypted', FIELD.API_KEY);
    const checksumKey = this._dec(channel, 'checksum_key_encrypted', FIELD.CHECKSUM_KEY);
    const bankAccountNumber = this._dec(channel, 'bank_account_number', FIELD.BANK_ACCOUNT);

    let payout = null;
    const isSameAsInbound =
      channel.payout_status === 'SAME_AS_INBOUND' ||
      (!channel.payout_client_id && !channel.payout_api_key_encrypted);

    if (isSameAsInbound) {
      payout = {
        clientId: channel.client_id,
        apiKey,
        checksumKey,
        isSameAsInbound: true,
      };
    } else if (channel.payout_client_id) {
      const payoutApiKey = this._dec(channel, 'payout_api_key_encrypted', FIELD.PAYOUT_API_KEY);
      const payoutChecksumKey = this._dec(channel, 'payout_checksum_key_encrypted', FIELD.PAYOUT_CHECKSUM_KEY);
      payout = {
        clientId: channel.payout_client_id,
        apiKey: payoutApiKey,
        checksumKey: payoutChecksumKey,
        isSameAsInbound: false,
      };
    }

    return {
      channelId: channel.id,
      organizerId: channel.organizer_id,
      clientId: channel.client_id,
      apiKey,
      checksumKey,
      payout,
      bankName: channel.bank_name,
      bankAccountHolder: channel.bank_account_holder,
      bankAccountNumber,
      status: channel.status,
      payoutStatus: channel.payout_status,
    };
  }

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
    const egress = await organizerEgressService.ensureEgressGateway(organizerId);
    const server_ip = egress?.egress_ip || null;
    return { ...(this.toPublicChannel(channel) || {}), server_ip, egress };
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

    if (!client_id || !bank_name || !bank_account_holder) {
      throw new AppError(
        'client_id, bank_name, and bank_account_holder are required',
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

    if (hasNewApiKey && !isValidSecret(api_key.trim())) {
      throw new AppError('API Key không hợp lệ', 400, ErrorCodes.INVALID_INPUT);
    }
    if (hasNewChecksumKey && !isValidSecret(checksum_key.trim())) {
      throw new AppError('Checksum Key không hợp lệ', 400, ErrorCodes.INVALID_INPUT);
    }

    const clientId = client_id.trim();
    const credentialsChanged =
      shouldUpdateCredentials || (existingChannel && existingChannel.client_id !== clientId);

    let encryptedBankAccount;
    const rawAccount = bank_account_number ? String(bank_account_number).trim() : '';
    const isMaskedOrEmpty = !rawAccount || rawAccount.includes('*') || rawAccount.includes('•');

    if (isMaskedOrEmpty && existingChannel?.bank_account_number) {
      if (fieldCrypto.isEncrypted(existingChannel.bank_account_number)) {
        encryptedBankAccount = existingChannel.bank_account_number;
      } else {
        const cleanExisting = String(existingChannel.bank_account_number).replace(/[\s.\-_]/g, '');
        encryptedBankAccount = fieldCrypto.encrypt(cleanExisting, organizerId, FIELD.BANK_ACCOUNT);
      }
    } else {
      const cleanAccount = rawAccount.replace(/[\s.\-_]/g, '');
      if (!cleanAccount) {
        throw new AppError('Số tài khoản ngân hàng là bắt buộc', 400, ErrorCodes.INVALID_INPUT);
      }
      if (!/^[0-9A-Za-z]{4,30}$/.test(cleanAccount)) {
        throw new AppError('Số tài khoản ngân hàng không hợp lệ (4-30 ký tự chữ hoặc số)', 400, ErrorCodes.INVALID_INPUT);
      }
      encryptedBankAccount = fieldCrypto.encrypt(cleanAccount, organizerId, FIELD.BANK_ACCOUNT);
    }

    const data = {
      client_id: clientId,
      api_key_encrypted: shouldUpdateCredentials
        ? fieldCrypto.encrypt(api_key.trim(), organizerId, FIELD.API_KEY)
        : null,
      checksum_key_encrypted: shouldUpdateCredentials
        ? fieldCrypto.encrypt(checksum_key.trim(), organizerId, FIELD.CHECKSUM_KEY)
        : null,
      bank_name: bank_name.trim(),
      bank_account_number: encryptedBankAccount,
      bank_account_holder: bank_account_holder.trim(),
      status: credentialsChanged ? 'PENDING' : existingChannel?.status || 'PENDING',
    };

    const saved = await organizerPaymentsRepository.upsertChannel(organizerId, data);
    return this.toPublicChannel(saved);
  }

  async testConnection(userId) {
    const organizerId = await this.getOrganizerId(userId);
    const channel = await organizerPaymentsRepository.findChannelByOrganizerId(organizerId);

    if (!channel) {
      throw new AppError('Payment channel not configured yet', 400, ErrorCodes.INVALID_INPUT);
    }

    // TODO: testConnection hiện chỉ cập nhật status thành ACTIVE mà chưa thực hiện gọi kiểm tra thực tế tới PayOS. Cần thống nhất cơ chế kiểm tra trước khi tích hợp gọi endpoint PayOS.
    const updatedChannel = await organizerPaymentsRepository.updateChannelStatus(organizerId, 'ACTIVE');
    return this.toPublicChannel(updatedChannel);
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
      const updated = await organizerPaymentsRepository.clearPayoutCredentials(organizerId);
      return this.toPublicChannel(updated);
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

    if (hasNewApiKey && !isValidSecret(payout_api_key.trim())) {
      throw new AppError('API Key Kênh chi không hợp lệ', 400, ErrorCodes.INVALID_INPUT);
    }
    if (hasNewChecksumKey && !isValidSecret(payout_checksum_key.trim())) {
      throw new AppError('Checksum Key Kênh chi không hợp lệ', 400, ErrorCodes.INVALID_INPUT);
    }

    const data = {
      payout_client_id: payout_client_id ? payout_client_id.trim() : existingChannel.payout_client_id,
      payout_api_key_encrypted: hasNewApiKey
        ? fieldCrypto.encrypt(payout_api_key.trim(), organizerId, FIELD.PAYOUT_API_KEY)
        : null,
      payout_checksum_key_encrypted: hasNewChecksumKey
        ? fieldCrypto.encrypt(payout_checksum_key.trim(), organizerId, FIELD.PAYOUT_CHECKSUM_KEY)
        : null,
      payout_status: 'PENDING',
    };

    const updated = await organizerPaymentsRepository.updatePayoutChannel(organizerId, data);
    return this.toPublicChannel(updated);
  }

  async testPayoutConnection(userId) {
    const organizerId = await this.getOrganizerId(userId);
    const channel = await organizerPaymentsRepository.findChannelByOrganizerId(organizerId);

    if (!channel) {
      throw new AppError('Chưa cấu hình kênh thanh toán.', 400, ErrorCodes.INVALID_INPUT);
    }

    const isSameAsInbound =
      channel.payout_status === 'SAME_AS_INBOUND' ||
      (!channel.payout_client_id && !channel.payout_api_key_encrypted);

    const clientId = isSameAsInbound ? channel.client_id : channel.payout_client_id;
    const apiKeyField = isSameAsInbound ? FIELD.API_KEY : FIELD.PAYOUT_API_KEY;
    const apiKeyColumn = isSameAsInbound ? 'api_key_encrypted' : 'payout_api_key_encrypted';

    if (!clientId || !channel[apiKeyColumn]) {
      throw new AppError('Thông tin kết nối Kênh chi chưa đầy đủ. Vui lòng kiểm tra lại.', 400, ErrorCodes.INVALID_INPUT);
    }

    // Check mock mode or test environment (Ở production KHÔNG BAO GIỜ mock)
    const isMockAllowed =
      process.env.NODE_ENV === 'test' ||
      (process.env.NODE_ENV !== 'production' && process.env.PAYOS_MOCK_REFUND === 'true');

    if (isMockAllowed) {
      await organizerPaymentsRepository.updatePayoutStatus(organizerId, 'ACTIVE');
      return {
        success: true,
        mock: true,
        message: 'Kết nối Kênh chi PayOS thành công (Chế độ mô phỏng). Kênh chi đã sẵn sàng.',
      };
    }

    try {
      // Giải mã apiKey ngay trước khi gọi fetch, không giữ ở biến phạm vi rộng, không đưa vào log/error
      const apiKey = this._dec(channel, apiKeyColumn, apiKeyField);

      let balance = null;
      let verified = false;

      // Bước 1: Thử kiểm tra số dư ví Bảo Kim qua payouts-account/balance (timeout ngắn 3s)
      try {
        const balController = new AbortController();
        const balTimeout = setTimeout(() => balController.abort(), 3000);

        const balRes = await fetch('https://api-merchant.payos.vn/v1/payouts-account/balance', {
          method: 'GET',
          headers: {
            'x-client-id': clientId,
            'x-api-key': apiKey,
          },
          signal: balController.signal,
        }).finally(() => clearTimeout(balTimeout));

        const balJson = await balRes.json().catch(() => ({}));

        if (balRes.ok && (balJson.code === '00' || balJson.code === '0' || balJson.code === 0)) {
          verified = true;
          balance = balJson.data?.balance;
        } else if (balJson.code === '601' || balJson.code === 601) {
          throw new AppError(
            'Tài khoản PayOS của Ban tổ chức chưa kích hoạt dịch vụ Chi hộ (Payouts) trên payOS (Lỗi 601: API key chưa có quyền Kênh chi). Vui lòng đăng nhập my.payos.vn > Thiết lập > Hồ sơ > Thay đổi dịch vụ để bật Kênh chi và liên kết ví Bảo Kim.',
            400,
            ErrorCodes.PAYMENT_PROVIDER_ERROR,
          );
        } else if (
          String(balJson.code) === '403' ||
          balRes.status === 403 ||
          balJson.desc?.toLowerCase().includes('địa chỉ ip') ||
          balJson.desc?.toLowerCase().includes('ip')
        ) {
          const realIp = await organizerEgressService.getRealPublicIp();
          throw new AppError(
            `Cổng PayOS từ chối do IP chưa được thêm vào IP Whitelist (${balJson.desc || 'Địa chỉ IP không được phép truy cập'}). IP Outbound thực tế của máy chủ là "${realIp}". Vui lòng đăng nhập my.payos.vn > Kênh chi > Cài đặt > thêm chính xác IP "${realIp}" vào danh sách "IP Whitelist" (xóa bỏ IP mock 198.51.100.1 nếu có).`,
            400,
            ErrorCodes.PAYMENT_PROVIDER_ERROR,
          );
        }
      } catch (balErr) {
        if (balErr instanceof AppError) throw balErr;
        // Nếu balance endpoint bị timeout hoặc lỗi upstream từ Bảo Kim, tiếp tục sang Bước 2 xác thực trực tiếp
      }

      // Bước 2: Xác thực trực tiếp quyền chi hộ & IP Whitelist qua endpoint Payouts của PayOS
      if (!verified) {
        const verifyController = new AbortController();
        const verifyTimeout = setTimeout(() => verifyController.abort(), 6000);

        const verifyRes = await fetch('https://api-merchant.payos.vn/v1/payouts/EH_VERIFY', {
          method: 'GET',
          headers: {
            'x-client-id': clientId,
            'x-api-key': apiKey,
          },
          signal: verifyController.signal,
        }).finally(() => clearTimeout(verifyTimeout));

        const verifyJson = await verifyRes.json().catch(() => ({}));

        // Mã 608: "Mã payout không tồn tại" => PayOS xác thực Client ID, API Key và IP Whitelist đều hợp lệ 100%!
        if (verifyJson.code === '608' || verifyJson.code === '00' || verifyJson.code === 0 || verifyJson.code === '0') {
          verified = true;
        } else if (verifyJson.code === '601' || verifyJson.code === 601) {
          throw new AppError(
            'Tài khoản PayOS của Ban tổ chức chưa kích hoạt dịch vụ Chi hộ (Payouts) trên payOS (Lỗi 601: API key chưa có quyền Kênh chi). Vui lòng đăng nhập my.payos.vn > Thiết lập > Hồ sơ > Thay đổi dịch vụ để bật Kênh chi và liên kết ví Bảo Kim.',
            400,
            ErrorCodes.PAYMENT_PROVIDER_ERROR,
          );
        } else if (
          String(verifyJson.code) === '403' ||
          verifyRes.status === 403 ||
          verifyJson.desc?.toLowerCase().includes('địa chỉ ip') ||
          verifyJson.desc?.toLowerCase().includes('ip')
        ) {
          const realIp = await organizerEgressService.getRealPublicIp();
          throw new AppError(
            `Cổng PayOS từ chối do IP chưa được thêm vào IP Whitelist (${verifyJson.desc || 'Địa chỉ IP không được phép truy cập'}). IP Outbound thực tế của máy chủ là "${realIp}". Vui lòng đăng nhập my.payos.vn > Kênh chi > Cài đặt > thêm chính xác IP "${realIp}" vào danh sách "IP Whitelist" (xóa bỏ IP mock 198.51.100.1 nếu có).`,
            400,
            ErrorCodes.PAYMENT_PROVIDER_ERROR,
          );
        } else {
          throw new AppError(
            verifyJson.desc || 'Không thể kết nối Kênh chi PayOS. Vui lòng kiểm tra lại thông tin Client ID và API Key.',
            400,
            ErrorCodes.PAYMENT_PROVIDER_ERROR,
          );
        }
      }

      if (verified) {
        await organizerPaymentsRepository.updatePayoutStatus(organizerId, 'ACTIVE');
        await organizerEgressService.updateStatus(organizerId, 'ACTIVE');
        return {
          success: true,
          balance,
          message: 'Kết nối Kênh chi PayOS thành công. Kênh chi đã kích hoạt.',
        };
      }
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
