const mockIotRepository = {
  findByMac: jest.fn(),
  findById: jest.fn(),
  pairingCodeExists: jest.fn(),
  upsertPendingDevice: jest.fn(),
  claimPendingSecretAtomic: jest.fn(),
  updateHeartbeat: jest.fn(),
  updateHeartbeatWithAutoConfirm: jest.fn(),
};

const mockTicketsRepository = {
  findTicketByRef: jest.fn(),
  validateTicketCheckInState: jest.fn(),
  checkInTicketByDevice: jest.fn(),
};

jest.mock('./iot.repository', () => mockIotRepository);
jest.mock('../tickets/tickets.repository', () => mockTicketsRepository);
jest.mock('../tickets/ticketSvgGenerator', () => ({ buildUniversalTicketSvg: jest.fn() }));

const iotService = require('./iot.service');
const { requireDeviceAuth } = require('./iot.middleware');
const { heartbeatSchema } = require('./iot.validation');
const {
  normalizeMacAddress,
  sha256Hex,
  extractClientIp,
} = require('./iot.utils');

describe('IoT Check-in Device Flow', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeMacAddress', () => {
    it('normalizes colon, hyphen, and raw hex MAC formats to lowercase colon format', () => {
      expect(normalizeMacAddress('E0:72:A1:D4:E9:00')).toBe('e0:72:a1:d4:e9:00');
      expect(normalizeMacAddress('e0-72-a1-d4-e9-00')).toBe('e0:72:a1:d4:e9:00');
      expect(normalizeMacAddress('E072A1D4E900')).toBe('e0:72:a1:d4:e9:00');
      expect(normalizeMacAddress('invalid-mac')).toBeNull();
    });
  });

  describe('registerDevice', () => {
    it('registers a new device with PENDING status, pairing_code, and claim_token', async () => {
      mockIotRepository.findByMac.mockResolvedValue(null);
      mockIotRepository.pairingCodeExists.mockResolvedValue(false);
      mockIotRepository.upsertPendingDevice.mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        mac_address: 'e0:72:a1:d4:e9:00',
        status: 'PENDING',
      });

      const res = await iotService.registerDevice(
        { mac_address: 'E0:72:A1:D4:E9:00', hardware: 'ESP32-S3-CAM', firmware_version: '1.0.0' },
        '192.168.1.50',
      );

      expect(res.httpStatus).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.device_id).toBe('11111111-1111-4111-8111-111111111111');
      expect(res.body.pairing_code).toMatch(/^EH[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
      expect(res.body.claim_token).toHaveLength(64);
      expect(res.body.poll_interval_sec).toBe(4);
      expect(mockIotRepository.upsertPendingDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          macAddress: 'e0:72:a1:d4:e9:00',
          claimTokenHash: sha256Hex(res.body.claim_token),
        }),
      );
    });

    it('rejects re-registration for an already ACTIVE device without Admin reset/re-pair', async () => {
      mockIotRepository.findByMac.mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        mac_address: 'e0:72:a1:d4:e9:00',
        status: 'ACTIVE',
      });

      const res = await iotService.registerDevice(
        { mac_address: 'e0:72:a1:d4:e9:00' },
        '192.168.1.50',
      );

      expect(res.httpStatus).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.result).toBe('REPAIR_REQUIRED');
      expect(mockIotRepository.upsertPendingDevice).not.toHaveBeenCalled();
    });
  });

  describe('getPairingStatus', () => {
    it('returns PENDING when Admin has not approved yet', async () => {
      const claimToken = 'secret-claim-token-value';
      mockIotRepository.findByMac.mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        mac_address: 'e0:72:a1:d4:e9:00',
        status: 'PENDING',
        claim_token_hash: sha256Hex(claimToken),
        pairing_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });

      const res = await iotService.getPairingStatus({
        macAddress: 'e0:72:a1:d4:e9:00',
        claimToken,
        clientIp: '192.168.1.50',
      });

      expect(res.httpStatus).toBe(200);
      expect(res.body).toEqual({ success: true, status: 'PENDING' });
    });

    it('returns one-time device_secret once when Admin approved', async () => {
      const claimToken = 'secret-claim-token-value';
      mockIotRepository.findByMac.mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        mac_address: 'e0:72:a1:d4:e9:00',
        status: 'ACTIVE',
        claim_token_hash: sha256Hex(claimToken),
        pairing_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
      mockIotRepository.claimPendingSecretAtomic.mockResolvedValue({
        state: 'CLAIMED',
        deviceSecret: 'plain-device-secret-once',
        device: {
          id: '11111111-1111-4111-8111-111111111111',
          assigned_event_id: '22222222-2222-4222-8222-222222222222',
          event_code: 'tech-2026',
          event_name: 'Tech 2026',
          auto_confirm: false,
          config_version: 2,
        },
      });

      const res = await iotService.getPairingStatus({
        macAddress: 'e0:72:a1:d4:e9:00',
        claimToken,
        clientIp: '192.168.1.50',
      });

      expect(res.httpStatus).toBe(200);
      expect(res.body).toEqual({
        success: true,
        status: 'ACTIVE',
        device_id: '11111111-1111-4111-8111-111111111111',
        device_secret: 'plain-device-secret-once',
        assigned_event_id: '22222222-2222-4222-8222-222222222222',
        event_code: 'tech-2026',
        event_name: 'Tech 2026',
        auto_confirm: false,
        config_version: 2,
      });
    });

    it('rejects expired pairing token', async () => {
      const claimToken = 'secret-claim-token-value';
      mockIotRepository.findByMac.mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        mac_address: 'e0:72:a1:d4:e9:00',
        status: 'PENDING',
        claim_token_hash: sha256Hex(claimToken),
        pairing_expires_at: new Date(Date.now() - 1000).toISOString(),
      });

      const res = await iotService.getPairingStatus({
        macAddress: 'e0:72:a1:d4:e9:00',
        claimToken,
        clientIp: '192.168.1.50',
      });

      expect(res.httpStatus).toBe(410);
      expect(res.body.result).toBe('PAIRING_EXPIRED');
    });
  });

  describe('requireDeviceAuth middleware', () => {
    const buildRes = () => {
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    };

    it('returns 403 DEVICE_DISABLED when device is disabled or revoked', async () => {
      const deviceId = '11111111-1111-4111-8111-111111111111';
      mockIotRepository.findById.mockResolvedValue({
        id: deviceId,
        status: 'DISABLED',
        secret_hash: sha256Hex('secret'),
      });

      const req = {
        get: (h) => (h.toLowerCase() === 'x-device-id' ? deviceId : 'secret'),
      };
      const res = buildRes();
      const next = jest.fn();

      await requireDeviceAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        result: 'DEVICE_DISABLED',
        message: 'Thiet bi da bi khoa boi Admin',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next and attaches req.device when credentials match an ACTIVE device', async () => {
      const deviceId = '11111111-1111-4111-8111-111111111111';
      const secret = 'valid-device-secret';
      const device = {
        id: deviceId,
        status: 'ACTIVE',
        secret_hash: sha256Hex(secret),
      };
      mockIotRepository.findById.mockResolvedValue(device);

      const req = {
        get: (h) => (h.toLowerCase() === 'x-device-id' ? deviceId : secret),
      };
      const res = buildRes();
      const next = jest.fn();

      await requireDeviceAuth(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.device).toEqual(device);
    });
  });

  describe('recordHeartbeat', () => {
    const baseDevice = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Cong A1',
      status: 'ACTIVE',
      assigned_event_id: '22222222-2222-4222-8222-222222222222',
      event_code: 'tech-2026',
      event_name: 'Tech Summit 2026',
      auto_confirm: false,
      config_version: 3,
    };

    it('keeps standard heartbeat behavior when auto_confirm_override is omitted', async () => {
      mockIotRepository.updateHeartbeat.mockResolvedValue({
        ...baseDevice,
        last_rssi: -45,
      });

      const parsed = heartbeatSchema.parse({
        rssi: -45,
        ip: '192.168.1.128',
        free_heap: 120000,
        uptime_sec: 300,
        firmware_version: '1.0.1',
      });

      const res = await iotService.recordHeartbeat(baseDevice, parsed, '10.0.0.1');

      expect(mockIotRepository.updateHeartbeat).toHaveBeenCalledWith(baseDevice.id, {
        rssi: -45,
        ip: '192.168.1.128',
        freeHeap: 120000,
        uptimeSec: 300,
        firmwareVersion: '1.0.1',
      });
      expect(mockIotRepository.updateHeartbeatWithAutoConfirm).not.toHaveBeenCalled();
      expect(res.httpStatus).toBe(200);
      expect(res.body).toEqual({
        success: true,
        status: 'ACTIVE',
        device_name: 'Cong A1',
        assigned_event_id: baseDevice.assigned_event_id,
        event_code: 'tech-2026',
        event_name: 'Tech Summit 2026',
        auto_confirm: false,
        config_version: 3,
      });
      expect(res.body).not.toHaveProperty('config_applied');
    });

    it('applies auto_confirm_override and increments config_version when base_config_version matches', async () => {
      mockIotRepository.updateHeartbeatWithAutoConfirm.mockResolvedValue({
        applied: true,
        device: {
          ...baseDevice,
          auto_confirm: true,
          config_version: 4,
        },
      });

      const parsed = heartbeatSchema.parse({
        rssi: -42,
        auto_confirm_override: true,
        base_config_version: 3,
      });

      const res = await iotService.recordHeartbeat(baseDevice, parsed, '192.168.1.128');

      expect(mockIotRepository.updateHeartbeatWithAutoConfirm).toHaveBeenCalledWith(baseDevice.id, {
        rssi: -42,
        ip: '192.168.1.128',
        freeHeap: undefined,
        uptimeSec: undefined,
        firmwareVersion: undefined,
        autoConfirm: true,
        expectedConfigVersion: 3,
      });
      expect(res.httpStatus).toBe(200);
      expect(res.body).toEqual({
        success: true,
        status: 'ACTIVE',
        device_name: 'Cong A1',
        config_applied: true,
        assigned_event_id: baseDevice.assigned_event_id,
        event_code: 'tech-2026',
        event_name: 'Tech Summit 2026',
        auto_confirm: true,
        config_version: 4,
      });
    });

    it('rejects auto_confirm_override and preserves Admin config when base_config_version is stale', async () => {
      const serverDevice = {
        ...baseDevice,
        auto_confirm: true,
        config_version: 5,
      };
      mockIotRepository.updateHeartbeat.mockResolvedValue(serverDevice);

      const parsed = heartbeatSchema.parse({
        rssi: -50,
        auto_confirm_override: false,
        base_config_version: 3,
      });

      const res = await iotService.recordHeartbeat(serverDevice, parsed, '192.168.1.128');

      expect(mockIotRepository.updateHeartbeatWithAutoConfirm).not.toHaveBeenCalled();
      expect(mockIotRepository.updateHeartbeat).toHaveBeenCalledTimes(1);
      expect(res.httpStatus).toBe(200);
      expect(res.body).toEqual({
        success: true,
        status: 'ACTIVE',
        device_name: 'Cong A1',
        config_applied: false,
        assigned_event_id: serverDevice.assigned_event_id,
        event_code: 'tech-2026',
        event_name: 'Tech Summit 2026',
        auto_confirm: true,
        config_version: 5,
      });
    });

    it('rejects negative base_config_version in heartbeatSchema validation', () => {
      expect(() =>
        heartbeatSchema.parse({
          auto_confirm_override: true,
          base_config_version: -1,
        }),
      ).toThrow();
    });
  });

  describe('scanTicket', () => {
    const activeDevice = {
      id: '11111111-1111-4111-8111-111111111111',
      status: 'ACTIVE',
      assigned_event_id: '22222222-2222-4222-8222-222222222222',
      event_code: 'tech-2026',
      event_name: 'Tech Summit 2026',
      auto_confirm: false,
      config_version: 3,
    };

    it('returns 400 NO_EVENT_ASSIGNED when device has no event assigned', async () => {
      const res = await iotService.scanTicket(
        { ...activeDevice, assigned_event_id: null, event_code: null, event_name: null },
        { qr_code: 'EH-TICKET-1', action: 'auto' },
      );

      expect(res.httpStatus).toBe(400);
      expect(res.body.result).toBe('NO_EVENT_ASSIGNED');
      expect(res.body.device_config).toEqual({
        assigned_event_id: null,
        event_code: null,
        event_name: null,
        auto_confirm: false,
        config_version: 3,
      });
    });

    it('returns 404 NOT_FOUND with device_config when ticket does not exist', async () => {
      mockTicketsRepository.findTicketByRef.mockResolvedValue(null);

      const res = await iotService.scanTicket(activeDevice, {
        qr_code: 'TCK-MISSING',
        action: 'auto',
      });

      expect(res.httpStatus).toBe(404);
      expect(res.body).toEqual({
        success: false,
        result: 'NOT_FOUND',
        message: 'Khong tim thay ve',
        device_config: {
          assigned_event_id: activeDevice.assigned_event_id,
          event_code: 'tech-2026',
          event_name: 'Tech Summit 2026',
          auto_confirm: false,
          config_version: 3,
        },
      });
    });

    it('returns 403 WRONG_EVENT when ticket belongs to a different event', async () => {
      mockTicketsRepository.findTicketByRef.mockResolvedValue({
        id: 'ticket-1',
        ticket_code: 'TCK-001',
        event_id: '33333333-3333-4333-8333-333333333333',
        event_slug: 'other-event',
      });

      const res = await iotService.scanTicket(activeDevice, {
        qr_code: '{"type":"EVENTHUB_TICKET","ticket_code":"TCK-001"}',
        action: 'auto',
      });

      expect(res.httpStatus).toBe(403);
      expect(res.body.result).toBe('WRONG_EVENT');
      expect(res.body.ticket_code).toBe('TCK-001');
      expect(res.body.device_config.auto_confirm).toBe(false);
    });

    it('returns USED with device_config when ticket is already checked in', async () => {
      mockTicketsRepository.findTicketByRef.mockResolvedValue({
        id: 'ticket-1',
        ticket_code: 'TCK-001',
        event_id: activeDevice.assigned_event_id,
        event_slug: 'tech-2026',
        status: 'USED',
      });
      mockTicketsRepository.validateTicketCheckInState.mockReturnValue('ALREADY_CHECKED_IN');

      const res = await iotService.scanTicket(activeDevice, {
        qr_code: 'TCK-001',
        action: 'auto',
      });

      expect(res.httpStatus).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.result).toBe('USED');
      expect(res.body.device_config).toEqual({
        assigned_event_id: activeDevice.assigned_event_id,
        event_code: 'tech-2026',
        event_name: 'Tech Summit 2026',
        auto_confirm: false,
        config_version: 3,
      });
    });

    it('returns VERIFIED without checking in when auto_confirm is false and action is auto', async () => {
      mockTicketsRepository.findTicketByRef.mockResolvedValue({
        id: 'ticket-1',
        ticket_code: 'TCK-001',
        event_id: activeDevice.assigned_event_id,
        event_slug: 'tech-2026',
        status: 'VALID',
      });
      mockTicketsRepository.validateTicketCheckInState.mockReturnValue(null);

      const res = await iotService.scanTicket(activeDevice, {
        qr_code: 'TCK-001',
        action: 'auto',
      });

      expect(res.httpStatus).toBe(200);
      expect(res.body).toEqual({
        success: true,
        result: 'VERIFIED',
        ticket_code: 'TCK-001',
        event_code: 'tech-2026',
        message: 'Ve hop le',
        device_config: {
          assigned_event_id: activeDevice.assigned_event_id,
          event_code: 'tech-2026',
          event_name: 'Tech Summit 2026',
          auto_confirm: false,
          config_version: 3,
        },
      });
      expect(mockTicketsRepository.checkInTicketByDevice).not.toHaveBeenCalled();
    });

    it('checks in ticket atomically and returns OK with device_config when auto_confirm is true', async () => {
      const autoDevice = { ...activeDevice, auto_confirm: true, config_version: 4 };
      mockTicketsRepository.findTicketByRef.mockResolvedValue({
        id: 'ticket-1',
        ticket_code: 'TCK-001',
        event_id: autoDevice.assigned_event_id,
        event_slug: 'tech-2026',
        status: 'VALID',
      });
      mockTicketsRepository.validateTicketCheckInState.mockReturnValue(null);
      mockTicketsRepository.checkInTicketByDevice.mockResolvedValue({
        state: 'CHECKED_IN',
        ticket: {
          id: 'ticket-1',
          ticket_code: 'TCK-001',
          event_slug: 'tech-2026',
        },
      });

      const res = await iotService.scanTicket(autoDevice, {
        qr_code: 'TCK-001',
        action: 'auto',
      });

      expect(res.httpStatus).toBe(200);
      expect(res.body).toEqual({
        success: true,
        result: 'OK',
        ticket_code: 'TCK-001',
        event_code: 'tech-2026',
        message: 'Check-in thanh cong',
        device_config: {
          assigned_event_id: autoDevice.assigned_event_id,
          event_code: 'tech-2026',
          event_name: 'Tech Summit 2026',
          auto_confirm: true,
          config_version: 4,
        },
      });
      expect(mockTicketsRepository.checkInTicketByDevice).toHaveBeenCalledWith(
        'ticket-1',
        autoDevice.id,
        autoDevice.assigned_event_id,
      );
    });
  });

  describe('extractClientIp', () => {
    it('extractClientIp prefers CF-Connecting-IP over X-Forwarded-For and req.ip', () => {
      expect(
        extractClientIp({
          headers: {
            'cf-connecting-ip': '203.0.113.50',
            'x-forwarded-for': '198.51.100.2, 10.0.0.1',
          },
          ip: '127.0.0.1',
        }),
      ).toBe('203.0.113.50');

      expect(
        extractClientIp({
          headers: {
            'x-forwarded-for': '198.51.100.2, 10.0.0.1',
          },
          ip: '127.0.0.1',
        }),
      ).toBe('198.51.100.2');
    });
  });
});

