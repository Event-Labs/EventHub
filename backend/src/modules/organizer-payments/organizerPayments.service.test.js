const organizerPaymentsService = require('./organizerPayments.service');
const organizerPaymentsRepository = require('./organizerPayments.repository');
const organizerEventsRepository = require('../organizer/organizerEvents.repository');
const fieldCrypto = require('../../core/security/fieldCrypto');
const axios = require('axios');

jest.mock('axios');
jest.mock('./organizerPayments.repository');
jest.mock('../organizer/organizerEvents.repository');
jest.mock('../egress/organizerEgress.service', () => ({
  ensureEgressGateway: jest.fn().mockResolvedValue({ egress_ip: '203.0.113.195' }),
  updateStatus: jest.fn().mockResolvedValue({}),
  getRealPublicIp: jest.fn().mockResolvedValue('198.23.243.226'),
}));
jest.mock('../payments/payoutEgress', () => ({
  assertEgressIp: jest.fn().mockResolvedValue(),
  payoutAxiosConfig: jest.fn().mockReturnValue({}),
}));

const FORBIDDEN_FIELDS = [
  'api_key_encrypted',
  'checksum_key_encrypted',
  'payout_api_key_encrypted',
  'payout_checksum_key_encrypted',
  'bank_account_number',
];

function assertNoSensitiveData(obj, secretsToReject = []) {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    expect(FORBIDDEN_FIELDS).not.toContain(k);
    if (typeof v === 'string') {
      for (const secret of secretsToReject) {
        if (secret && secret.length > 5) {
          expect(v).not.toContain(secret);
        }
      }
    } else if (typeof v === 'object' && v !== null) {
      assertNoSensitiveData(v, secretsToReject);
    }
  }
}

describe('OrganizerPaymentsService - Security & Encryption Suite', () => {
  const mockUserId = 'user-123';
  const mockOrganizerId = 'org-456';
  const secretApiKey = 'test_api_key_secret_0123456789abcdef';
  const secretChecksum = 'test_checksum_secret_0123456789abcdef';
  const secretPayoutApiKey = 'test_payout_api_key_0123456789abcdef';
  const secretPayoutChecksum = 'test_payout_checksum_0123456789abcdef';
  const secretBankAccount = '19036582910385';

  beforeEach(() => {
    jest.clearAllMocks();
    organizerEventsRepository.findOrganizerByUserId.mockResolvedValue({ id: mockOrganizerId });
  });

  describe('1. Response Sanitization (No sensitive fields in response)', () => {
    it('getChannel không trả bất kỳ field cấm nào và che số tài khoản', async () => {
      const encryptedAcc = fieldCrypto.encrypt(secretBankAccount, mockOrganizerId, 'bank_account_number');
      const encryptedApiKey = fieldCrypto.encrypt(secretApiKey, mockOrganizerId, 'payos_api_key');
      const encryptedChecksum = fieldCrypto.encrypt(secretChecksum, mockOrganizerId, 'payos_checksum_key');

      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue({
        id: 'channel-1',
        organizer_id: mockOrganizerId,
        provider: 'PAYOS',
        client_id: 'test-client-id',
        api_key_encrypted: encryptedApiKey,
        checksum_key_encrypted: encryptedChecksum,
        bank_name: 'MB Bank',
        bank_account_number: encryptedAcc,
        bank_account_holder: 'NGUYEN VAN A',
        status: 'ACTIVE',
        payout_status: 'SAME_AS_INBOUND',
      });

      const res = await organizerPaymentsService.getChannel(mockUserId);

      assertNoSensitiveData(res, [secretApiKey, secretChecksum, secretBankAccount]);
      expect(res.has_api_key).toBe(true);
      expect(res.has_checksum_key).toBe(true);
      expect(res.bank_account_masked).toBe('****0385');
    });

    it('saveChannel không trả field cấm và lưu ciphertext bắt đầu bằng enc.', async () => {
      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue(null);
      organizerPaymentsRepository.upsertChannel.mockImplementation((orgId, data) => {
        return Promise.resolve({
          id: 'channel-1',
          organizer_id: orgId,
          ...data,
        });
      });

      const res = await organizerPaymentsService.saveChannel(mockUserId, {
        client_id: 'client-test-id',
        api_key: secretApiKey,
        checksum_key: secretChecksum,
        bank_name: 'MB Bank',
        bank_account_number: secretBankAccount,
        bank_account_holder: 'NGUYEN VAN A',
      });

      assertNoSensitiveData(res, [secretApiKey, secretChecksum, secretBankAccount]);
      expect(res.has_api_key).toBe(true);
      expect(res.has_checksum_key).toBe(true);

      // Kiểm tra dữ liệu truyền vào repository phải bắt đầu bằng enc.
      const savedData = organizerPaymentsRepository.upsertChannel.mock.calls[0][1];
      expect(savedData.api_key_encrypted.startsWith('enc.')).toBe(true);
      expect(savedData.checksum_key_encrypted.startsWith('enc.')).toBe(true);
      expect(savedData.bank_account_number.startsWith('enc.')).toBe(true);
      expect(fieldCrypto.decrypt(savedData.api_key_encrypted, mockOrganizerId, 'payos_api_key')).toBe(secretApiKey);
    });

    it('testConnection trả toPublicChannel không lộ field cấm', async () => {
      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue({
        id: 'channel-1',
        organizer_id: mockOrganizerId,
        api_key_encrypted: 'enc.test.key',
        status: 'PENDING',
      });
      organizerPaymentsRepository.updateChannelStatus.mockResolvedValue({
        id: 'channel-1',
        organizer_id: mockOrganizerId,
        status: 'ACTIVE',
        api_key_encrypted: 'enc.test.key',
      });

      const res = await organizerPaymentsService.testConnection(mockUserId);
      assertNoSensitiveData(res, [secretApiKey]);
      expect(res.status).toBe('ACTIVE');
    });
  });

  describe('2. Bank Account Preservation & Normalization', () => {
    it('giữ nguyên số tài khoản cũ khi nhận chuỗi đã che ****0385', async () => {
      const existingEncryptedAcc = fieldCrypto.encrypt(secretBankAccount, mockOrganizerId, 'bank_account_number');
      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue({
        id: 'channel-1',
        client_id: 'client-test-id',
        bank_account_number: existingEncryptedAcc,
        status: 'ACTIVE',
      });
      organizerPaymentsRepository.upsertChannel.mockImplementation((orgId, data) => Promise.resolve(data));

      await organizerPaymentsService.saveChannel(mockUserId, {
        client_id: 'client-test-id',
        bank_name: 'MB Bank',
        bank_account_number: '****0385',
        bank_account_holder: 'NGUYEN VAN A',
      });

      const savedData = organizerPaymentsRepository.upsertChannel.mock.calls[0][1];
      expect(savedData.bank_account_number).toBe(existingEncryptedAcc);
      expect(fieldCrypto.decrypt(savedData.bank_account_number, mockOrganizerId, 'bank_account_number')).toBe(secretBankAccount);
    });

    it('tự động chuẩn hóa và lưu số tài khoản có dấu cách hoặc dấu gạch ngang (VD: 1011 6666 8668)', async () => {
      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue(null);
      organizerPaymentsRepository.upsertChannel.mockImplementation((orgId, data) => Promise.resolve(data));

      await organizerPaymentsService.saveChannel(mockUserId, {
        client_id: 'client-test-id',
        api_key: secretApiKey,
        checksum_key: secretChecksum,
        bank_name: 'MB Bank',
        bank_account_number: '1011 6666 8668',
        bank_account_holder: 'NGUYEN VAN A',
      });

      const savedData = organizerPaymentsRepository.upsertChannel.mock.calls[0][1];
      const decrypted = fieldCrypto.decrypt(savedData.bank_account_number, mockOrganizerId, 'bank_account_number');
      expect(decrypted).toBe('101166668668');
    });

    it('chấp nhận số tài khoản ngắn 4 chữ số (VD: 8888 VIP)', async () => {
      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue(null);
      organizerPaymentsRepository.upsertChannel.mockImplementation((orgId, data) => Promise.resolve(data));

      await organizerPaymentsService.saveChannel(mockUserId, {
        client_id: 'client-test-id',
        api_key: secretApiKey,
        checksum_key: secretChecksum,
        bank_name: 'MB Bank',
        bank_account_number: '8888',
        bank_account_holder: 'NGUYEN VAN A',
      });

      const savedData = organizerPaymentsRepository.upsertChannel.mock.calls[0][1];
      const decrypted = fieldCrypto.decrypt(savedData.bank_account_number, mockOrganizerId, 'bank_account_number');
      expect(decrypted).toBe('8888');
    });
  });

  describe('3. Payout Channel Security', () => {
    it('use_inbound_for_payout gọi clearPayoutCredentials để xóa sạch key cũ', async () => {
      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue({
        id: 'channel-1',
        client_id: 'client-test-id',
        payout_client_id: 'old-payout-client',
        payout_api_key_encrypted: 'old-key',
      });
      organizerPaymentsRepository.clearPayoutCredentials.mockResolvedValue({
        id: 'channel-1',
        payout_status: 'SAME_AS_INBOUND',
        payout_client_id: null,
      });

      const res = await organizerPaymentsService.savePayoutChannel(mockUserId, {
        use_inbound_for_payout: true,
      });

      expect(organizerPaymentsRepository.clearPayoutCredentials).toHaveBeenCalledWith(mockOrganizerId);
      assertNoSensitiveData(res);
      expect(res.payout_status).toBe('SAME_AS_INBOUND');
    });

    it('savePayoutChannel mã hóa payout_api_key và payout_checksum_key với tiền tố enc.', async () => {
      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue({
        id: 'channel-1',
        client_id: 'client-test-id',
      });
      organizerPaymentsRepository.updatePayoutChannel.mockImplementation((orgId, data) => Promise.resolve(data));

      const res = await organizerPaymentsService.savePayoutChannel(mockUserId, {
        payout_client_id: 'payout-client-999',
        payout_api_key: secretPayoutApiKey,
        payout_checksum_key: secretPayoutChecksum,
      });

      assertNoSensitiveData(res, [secretPayoutApiKey, secretPayoutChecksum]);

      const savedData = organizerPaymentsRepository.updatePayoutChannel.mock.calls[0][1];
      expect(savedData.payout_api_key_encrypted.startsWith('enc.')).toBe(true);
      expect(savedData.payout_checksum_key_encrypted.startsWith('enc.')).toBe(true);

      const decApi = fieldCrypto.decrypt(savedData.payout_api_key_encrypted, mockOrganizerId, 'payos_payout_api_key');
      expect(decApi).toBe(secretPayoutApiKey);
    });

    it('testPayoutConnection KHÔNG BAO GIỜ mock ở NODE_ENV=production', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevMock = process.env.PAYOS_MOCK_REFUND;
      process.env.NODE_ENV = 'production';
      process.env.PAYOS_MOCK_REFUND = 'true';

      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue({
        id: 'channel-1',
        organizer_id: mockOrganizerId,
        client_id: 'client-id',
        api_key_encrypted: fieldCrypto.encrypt('key-1234567890123456', mockOrganizerId, 'payos_api_key'),
        payout_status: 'SAME_AS_INBOUND',
      });

      // Mock axios call to simulate PayOS call
      axios.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { code: '00', data: { balance: 5000000 } },
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: '00', data: { balance: 5000000 } }),
      });
      organizerPaymentsRepository.updatePayoutStatus.mockResolvedValue({});

      try {
        const res = await organizerPaymentsService.testPayoutConnection(mockUserId);
        expect(res.mock).toBeUndefined(); // Không được là mock!
        expect(axios.get).toHaveBeenCalled(); // Phải gọi HTTP thật đến PayOS
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.PAYOS_MOCK_REFUND = prevMock;
      }
    });
  });

  describe('4. getDecryptedCredentials (Internal Only)', () => {
    it('giải mã đúng toàn bộ credentials cho PayOS internal call', async () => {
      const encInboundApi = fieldCrypto.encrypt(secretApiKey, mockOrganizerId, 'payos_api_key');
      const encInboundChecksum = fieldCrypto.encrypt(secretChecksum, mockOrganizerId, 'payos_checksum_key');
      const encBank = fieldCrypto.encrypt(secretBankAccount, mockOrganizerId, 'bank_account_number');

      organizerPaymentsRepository.findChannelByOrganizerId.mockResolvedValue({
        id: 'ch-1',
        organizer_id: mockOrganizerId,
        client_id: 'client-001',
        api_key_encrypted: encInboundApi,
        checksum_key_encrypted: encInboundChecksum,
        bank_name: 'MB Bank',
        bank_account_holder: 'NGUYEN VAN A',
        bank_account_number: encBank,
        status: 'ACTIVE',
        payout_status: 'SAME_AS_INBOUND',
      });

      const creds = await organizerPaymentsService.getDecryptedCredentials(mockOrganizerId);
      expect(creds.apiKey).toBe(secretApiKey);
      expect(creds.checksumKey).toBe(secretChecksum);
      expect(creds.bankAccountNumber).toBe(secretBankAccount);
      expect(creds.payout.apiKey).toBe(secretApiKey);
    });
  });
});
