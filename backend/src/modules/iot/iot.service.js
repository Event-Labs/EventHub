const iotRepository = require('./iot.repository');
const ticketsService = require('../tickets/tickets.service');
const {
  PAIRING_TTL_MINUTES,
  POLL_INTERVAL_SEC,
  normalizeMacAddress,
  sha256Hex,
  timingSafeEqualHex,
  generatePairingCode,
  generateRandomToken,
} = require('./iot.utils');

async function generateUniquePairingCode() {
  for (let i = 0; i < 8; i += 1) {
    const code = generatePairingCode();
    // eslint-disable-next-line no-await-in-loop
    const exists = await iotRepository.pairingCodeExists(code);
    if (!exists) return code;
  }
  return generatePairingCode();
}

function buildDeviceConfigPayload(device) {
  return {
    assigned_event_id: device?.assigned_event_id || null,
    event_code: device?.event_code || null,
    event_name: device?.event_name || null,
    auto_confirm: Boolean(device?.auto_confirm),
    config_version: Number(device?.config_version || 1),
  };
}

class IotService {
  async registerDevice(payload, clientIp) {
    const macAddress = normalizeMacAddress(payload.mac_address);
    if (!macAddress) {
      return {
        httpStatus: 400,
        body: {
          success: false,
          result: 'INVALID_MAC',
          message: 'Dia chi MAC khong hop le',
        },
      };
    }

    const existing = await iotRepository.findByMac(macAddress);
    if (existing && existing.status === 'ACTIVE') {
      return {
        httpStatus: 409,
        body: {
          success: false,
          status: 'ACTIVE',
          result: 'REPAIR_REQUIRED',
          device_id: existing.id,
          message: 'Thiet bi da duoc kich hoat. Vui long nho Admin reset/re-pair de ghep noi lai',
        },
      };
    }

    if (existing && existing.status === 'DISABLED') {
      return {
        httpStatus: 403,
        body: {
          success: false,
          status: 'DISABLED',
          result: 'DEVICE_DISABLED',
          device_id: existing.id,
          message: 'Thiet bi da bi khoa boi Admin',
        },
      };
    }

    const pairingCode = await generateUniquePairingCode();
    const claimToken = generateRandomToken(32);
    const claimTokenHash = sha256Hex(claimToken);
    const pairingExpiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60 * 1000);

    const device = await iotRepository.upsertPendingDevice({
      macAddress,
      hardware: payload.hardware || null,
      firmwareVersion: payload.firmware_version || null,
      pairingCode,
      claimTokenHash,
      pairingExpiresAt,
      lastIp: clientIp,
    });

    return {
      httpStatus: 200,
      body: {
        success: true,
        status: 'PENDING',
        device_id: device.id,
        pairing_code: pairingCode,
        claim_token: claimToken,
        poll_interval_sec: POLL_INTERVAL_SEC,
      },
    };
  }

  async getPairingStatus({ macAddress: rawMac, claimToken, clientIp }) {
    const macAddress = normalizeMacAddress(rawMac);
    if (!macAddress) {
      return {
        httpStatus: 400,
        body: {
          success: false,
          result: 'INVALID_MAC',
          message: 'Dia chi MAC khong hop le',
        },
      };
    }

    if (!claimToken) {
      return {
        httpStatus: 401,
        body: {
          success: false,
          result: 'UNAUTHORIZED',
          message: 'Thieu X-Claim-Token',
        },
      };
    }

    const device = await iotRepository.findByMac(macAddress);
    if (!device || !device.claim_token_hash) {
      return {
        httpStatus: 401,
        body: {
          success: false,
          result: 'UNAUTHORIZED',
          message: 'Phien ghep noi khong hop le hoac da hoan tat',
        },
      };
    }

    if (!timingSafeEqualHex(sha256Hex(claimToken), device.claim_token_hash)) {
      return {
        httpStatus: 401,
        body: {
          success: false,
          result: 'UNAUTHORIZED',
          message: 'X-Claim-Token khong khop',
        },
      };
    }

    if (device.pairing_expires_at && new Date(device.pairing_expires_at).getTime() <= Date.now()) {
      return {
        httpStatus: 410,
        body: {
          success: false,
          result: 'PAIRING_EXPIRED',
          message: 'Ma ghep noi da het han, vui long dang ky lai',
        },
      };
    }

    if (device.status === 'DISABLED' || device.status === 'REVOKED') {
      return {
        httpStatus: 403,
        body: {
          success: false,
          status: device.status,
          result: 'DEVICE_DISABLED',
          message: 'Thiet bi da bi khoa boi Admin',
        },
      };
    }

    if (device.status === 'PENDING') {
      return {
        httpStatus: 200,
        body: {
          success: true,
          status: 'PENDING',
        },
      };
    }

    if (device.status === 'ACTIVE') {
      const claimResult = await iotRepository.claimPendingSecretAtomic(device.id, clientIp);
      if (claimResult.state !== 'CLAIMED') {
        return {
          httpStatus: 410,
          body: {
            success: false,
            result: 'CLAIM_EXPIRED',
            message: 'Secret da duoc nhan hoac het han, vui long nho Admin re-pair',
          },
        };
      }

      const claimedDevice = claimResult.device;
      return {
        httpStatus: 200,
        body: {
          success: true,
          status: 'ACTIVE',
          device_id: claimedDevice.id,
          device_secret: claimResult.deviceSecret,
          assigned_event_id: claimedDevice.assigned_event_id || null,
          event_code: claimedDevice.event_code || null,
          event_name: claimedDevice.event_name || null,
          auto_confirm: Boolean(claimedDevice.auto_confirm),
          config_version: Number(claimedDevice.config_version || 1),
        },
      };
    }

    return {
      httpStatus: 400,
      body: {
        success: false,
        result: 'INVALID_STATE',
        message: 'Trang thai thiet bi khong hop le',
      },
    };
  }

  async recordHeartbeat(device, payload, clientIp) {
    const telemetry = {
      rssi: payload.rssi,
      ip: payload.ip || clientIp,
      freeHeap: payload.free_heap,
      uptimeSec: payload.uptime_sec,
      firmwareVersion: payload.firmware_version,
    };

    const hasOverride = typeof payload.auto_confirm_override === 'boolean';
    if (!hasOverride) {
      const updated = await iotRepository.updateHeartbeat(device.id, telemetry);
      const current = updated || device;

      return {
        httpStatus: 200,
        body: {
          success: true,
          status: current.status,
          device_name: current.name || null,
          ...buildDeviceConfigPayload(current),
        },
      };
    }

    const baseVersion = payload.base_config_version;
    const currentVersion = Number(device.config_version || 1);
    const currentAutoConfirm = Boolean(device.auto_confirm);
    const requestedAutoConfirm = payload.auto_confirm_override;

    const versionMatches = typeof baseVersion === 'number' && baseVersion === currentVersion;
    const valueAlreadyMatches = requestedAutoConfirm === currentAutoConfirm;

    if (device.status === 'ACTIVE' && (versionMatches || valueAlreadyMatches)) {
      const result = await iotRepository.updateHeartbeatWithAutoConfirm(device.id, {
        ...telemetry,
        autoConfirm: requestedAutoConfirm,
        expectedConfigVersion: currentVersion,
      });

      const current = result?.device || device;
      const applied = Boolean(result?.applied);

      return {
        httpStatus: 200,
        body: {
          success: true,
          status: current.status,
          device_name: current.name || null,
          config_applied: applied,
          ...buildDeviceConfigPayload(current),
        },
      };
    }

    const updated = await iotRepository.updateHeartbeat(device.id, telemetry);
    const current = updated || device;
    const resolvedMatchesAfterRefresh =
      current.status === 'ACTIVE' && Boolean(current.auto_confirm) === requestedAutoConfirm;

    return {
      httpStatus: 200,
      body: {
        success: true,
        status: current.status,
        device_name: current.name || null,
        config_applied: resolvedMatchesAfterRefresh,
        ...buildDeviceConfigPayload(current),
      },
    };
  }

  async scanTicket(device, payload) {
    const result = await ticketsService.scanTicketForDevice(device, {
      qrCode: payload.qr_code,
      action: payload.action,
    });

    const { httpStatus, ...body } = result;
    return {
      httpStatus,
      body: {
        ...body,
        device_config: buildDeviceConfigPayload(device),
      },
    };
  }
}

module.exports = new IotService();

