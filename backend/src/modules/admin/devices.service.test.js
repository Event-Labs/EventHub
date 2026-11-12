const mockAdminDevicesRepository = {
  listDevices: jest.fn(),
  getStats: jest.fn(),
  listAssignableEvents: jest.fn(),
  findAssignableEventById: jest.fn(),
  findById: jest.fn(),
  findRawById: jest.fn(),
  getRecentCheckIns: jest.fn(),
  approveDevice: jest.fn(),
  updateDeviceConfig: jest.fn(),
  disableDevice: jest.fn(),
  enableDevice: jest.fn(),
  revokeDevice: jest.fn(),
  resetDevicePairing: jest.fn(),
  deleteDevice: jest.fn(),
};

jest.mock('./devices.repository', () => mockAdminDevicesRepository);

const adminDevicesService = require('./devices.service');
const { sha256Hex } = require('../iot/iot.utils');

describe('AdminDevicesService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('approves a PENDING device and stores secret_hash + temporary pending_secret_plain', async () => {
    const deviceId = '11111111-1111-4111-8111-111111111111';
    const eventId = '22222222-2222-4222-8222-222222222222';
    mockAdminDevicesRepository.findRawById.mockResolvedValue({
      id: deviceId,
      status: 'PENDING',
      claim_token_hash: 'abc',
      pairing_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    mockAdminDevicesRepository.findAssignableEventById.mockResolvedValue({
      id: eventId,
      status: 'PUBLISHED',
    });
    mockAdminDevicesRepository.approveDevice.mockImplementation(async (_id, data) => ({
      id: deviceId,
      name: data.name,
      status: 'ACTIVE',
      assigned_event_id: data.assignedEventId,
      auto_confirm: data.autoConfirm,
    }));

    const result = await adminDevicesService.approveDevice(deviceId, 'admin-1', {
      name: 'Cổng A1',
      assigned_event_id: eventId,
      auto_confirm: true,
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.name).toBe('Cổng A1');
    expect(mockAdminDevicesRepository.approveDevice).toHaveBeenCalledTimes(1);
    const approveArg = mockAdminDevicesRepository.approveDevice.mock.calls[0][1];
    expect(approveArg.pendingSecretPlain).toHaveLength(64);
    expect(approveArg.secretHash).toBe(sha256Hex(approveArg.pendingSecretPlain));
    expect(approveArg.pendingSecretExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects approving a device whose pairing session has expired', async () => {
    mockAdminDevicesRepository.findRawById.mockResolvedValue({
      id: 'dev-1',
      status: 'PENDING',
      claim_token_hash: 'abc',
      pairing_expires_at: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(
      adminDevicesService.approveDevice('dev-1', 'admin-1', { name: 'Gate 1', auto_confirm: false }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects disabling non-ACTIVE devices and enables DISABLED devices', async () => {
    mockAdminDevicesRepository.findRawById.mockResolvedValueOnce({ id: 'dev-1', status: 'PENDING' });
    await expect(adminDevicesService.disableDevice('dev-1')).rejects.toMatchObject({ statusCode: 400 });

    mockAdminDevicesRepository.findRawById.mockResolvedValueOnce({
      id: 'dev-1',
      status: 'DISABLED',
      secret_hash: 'hash',
    });
    mockAdminDevicesRepository.enableDevice.mockResolvedValue({ id: 'dev-1', status: 'ACTIVE' });
    const enabled = await adminDevicesService.enableDevice('dev-1');
    expect(enabled.status).toBe('ACTIVE');
  });
});

