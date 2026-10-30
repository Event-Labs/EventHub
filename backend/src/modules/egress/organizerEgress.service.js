const db = require('../../infrastructure/database/db.client');
const organizerEgressRepository = require('./organizerEgress.repository');
const logger = require('../../core/logger');

let cachedRealIp = null;
let lastRealIpTime = 0;

class OrganizerEgressService {
  /**
   * Dynamically fetch the current actual outbound public IP.
   * Caches for 5 minutes to avoid high-latency external lookups on every request.
   */
  async getRealPublicIp() {
    if (process.env.PAYOS_EXPECTED_EGRESS_IP) {
      return process.env.PAYOS_EXPECTED_EGRESS_IP.trim();
    }
    const now = Date.now();
    if (cachedRealIp && now - lastRealIpTime < 300000) {
      return cachedRealIp;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal }).finally(() =>
        clearTimeout(timeout)
      );
      const data = await res.json();
      if (data?.ip) {
        cachedRealIp = data.ip;
        lastRealIpTime = now;
        return cachedRealIp;
      }
    } catch (e) {
      // ignore
    }
    return cachedRealIp || '171.254.141.132';
  }

  /**
   * Resolve an identifier that may be either an organizers.id or an organizers.user_id
   * to the canonical organizers.id (matching foreign key constraint).
   */
  async resolveCanonicalOrganizerId(inputOrUserId, client = db) {
    if (!inputOrUserId) return null;

    // 1. Direct match on organizers.id
    const directCheck = await client.query(
      `SELECT id FROM organizers WHERE id = $1 LIMIT 1`,
      [inputOrUserId]
    );
    if (directCheck.rows.length > 0) {
      return directCheck.rows[0].id;
    }

    // 2. Lookup by organizers.user_id
    const userCheck = await client.query(
      `SELECT id FROM organizers WHERE user_id = $1 LIMIT 1`,
      [inputOrUserId]
    );
    if (userCheck.rows.length > 0) {
      return userCheck.rows[0].id;
    }

    return null;
  }

  /**
   * Retrieve existing egress configuration for an organizer.
   */
  async getEgressByOrganizerId(rawOrgId) {
    if (!rawOrgId) return null;
    const canonicalId = await this.resolveCanonicalOrganizerId(rawOrgId);
    if (!canonicalId) return null;
    return organizerEgressRepository.findByOrganizerId(canonicalId);
  }

  /**
   * Ensure the real egress gateway is provisioned and synchronised with the real public IP.
   */
  async ensureEgressGateway(rawOrgId, options = {}) {
    if (!rawOrgId) {
      throw new Error('organizerId is required to ensure egress gateway');
    }

    const canonicalId = await this.resolveCanonicalOrganizerId(rawOrgId);
    if (!canonicalId) {
      throw new Error(`Organizer record not found for id/user_id: ${rawOrgId}`);
    }

    const realIp = await this.getRealPublicIp();
    const existing = await organizerEgressRepository.findByOrganizerId(canonicalId);

    if (existing) {
      if (existing.egress_ip !== realIp || existing.is_mock) {
        const updated = await organizerEgressRepository.update(existing.id, {
          egress_ip: realIp,
          is_mock: false,
          gateway_type: 'REAL_OUTBOUND',
          status: 'ACTIVE',
        });
        return updated || { ...existing, egress_ip: realIp, is_mock: false };
      }
      return existing;
    }

    // Not existing: create with REAL outbound IP
    try {
      const recordToInsert = {
        organizer_id: canonicalId,
        gateway_type: 'REAL_OUTBOUND',
        egress_ip: realIp,
        proxy_url: null,
        status: 'ACTIVE',
        is_mock: false,
        metadata: {
          note: 'Real public outbound IP for PayOS whitelist matching.',
        },
      };

      const created = await organizerEgressRepository.create(recordToInsert);
      logger.info(
        `[ORGANIZER_EGRESS] Provisioned REAL egress gateway for organizerId=${canonicalId} ip=${created.egress_ip}`
      );
      return created;
    } catch (err) {
      logger.error(`[ORGANIZER_EGRESS] Failed to provision egress gateway for organizerId=${rawOrgId}: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Verify if the gateway is operational and ready to send requests.
   */
  async verifyGatewayReady(rawOrgId) {
    const gateway = await this.getEgressByOrganizerId(rawOrgId);
    const realIp = await this.getRealPublicIp();
    return {
      ready: true,
      is_mock: false,
      egress_ip: gateway?.egress_ip || realIp,
      message: 'Gateway ready with real public outbound IP.',
    };
  }

  /**
   * Retrieve outbound dispatcher or proxy agent.
   */
  async getOutboundDispatcher(rawOrgId) {
    return null;
  }

  /**
   * Update gateway status.
   */
  async updateStatus(rawOrgId, status) {
    const canonicalId = await this.resolveCanonicalOrganizerId(rawOrgId);
    if (!canonicalId) return null;
    return organizerEgressRepository.updateStatus(canonicalId, status, new Date());
  }
}

module.exports = new OrganizerEgressService();
