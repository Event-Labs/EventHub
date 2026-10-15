const BaseEgressProvider = require('./baseEgress.provider');

/**
 * MockEgressProvider
 * Generates isolated, unique, deterministic mock IPs from the RFC 5737 TEST-NET-2 block (198.51.100.0/24).
 * Used exclusively for local development and integration testing.
 */
class MockEgressProvider extends BaseEgressProvider {
  constructor() {
    super('MockEgressProvider');
    this.subnetPrefix = '198.51.100';
    this.minHost = 1;
    this.maxHost = 254;
  }

  /**
   * Generates next available unique mock IP from the reserved test subnet.
   */
  async provision(organizerId, existingAllocatedIps = new Set()) {
    // Find first host index in 1..254 not yet allocated in database
    let selectedHost = null;
    for (let host = this.minHost; host <= this.maxHost; host++) {
      const candidateIp = `${this.subnetPrefix}.${host}`;
      if (!existingAllocatedIps.has(candidateIp)) {
        selectedHost = host;
        break;
      }
    }

    if (!selectedHost) {
      throw new Error('MOCK_IP_POOL_EXHAUSTED: All 254 mock test IPs in 198.51.100.0/24 have been allocated.');
    }

    const egress_ip = `${this.subnetPrefix}.${selectedHost}`;
    return {
      egress_ip,
      gateway_type: 'MOCK',
      proxy_url: null,
      is_mock: true,
      metadata: {
        provider: this.name,
        subnet: '198.51.100.0/24 (RFC 5737 Test-Net-2)',
        host_index: selectedHost,
        note: 'Mock Egress IP for local testing only. Not routeable on the public Internet.',
      },
    };
  }

  /**
   * Verifies if this mock gateway can be used.
   * Hard-blocks mock gateways if accidentally invoked in production.
   */
  async verifyReady(gatewayRecord) {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      return {
        ready: false,
        reason: 'MOCK_GATEWAY_FORBIDDEN_IN_PRODUCTION',
        message: 'Mock Egress Gateway cannot be used in production environment. A real dedicated proxy or static gateway is required.',
      };
    }

    if (!gatewayRecord || !gatewayRecord.egress_ip) {
      return {
        ready: false,
        reason: 'GATEWAY_RECORD_INVALID',
        message: 'Egress gateway record is missing or corrupted.',
      };
    }

    return {
      ready: true,
      is_mock: true,
      message: 'Mock Egress Gateway is ready for local development/simulation.',
    };
  }

  getDispatcher(gatewayRecord) {
    // In mock mode on local machine, returns null (or mock dispatcher if needed)
    return null;
  }
}

module.exports = MockEgressProvider;
