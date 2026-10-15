/**
 * Base abstract class for Egress Providers.
 * Production implementations (e.g. HttpProxyAgentProvider, WireguardProvider)
 * will inherit from this base class.
 */
class BaseEgressProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Provision an egress gateway for an organizer.
   * @param {string} organizerId - UUID of the organizer
   * @param {Set<string>} existingAllocatedIps - Currently used IPs to prevent collision
   * @returns {Promise<{ egress_ip: string, gateway_type: string, proxy_url?: string, is_mock: boolean, metadata?: object }>}
   */
  async provision(organizerId, existingAllocatedIps) {
    throw new Error('provision() must be implemented by subclass');
  }

  /**
   * Check if the gateway is operational and ready to route live traffic.
   * @param {object} gatewayRecord - Row from organizer_egress_gateways
   * @returns {Promise<{ ready: boolean, reason?: string, details?: object }>}
   */
  async verifyReady(gatewayRecord) {
    throw new Error('verifyReady() must be implemented by subclass');
  }

  /**
   * Get an outbound dispatcher/agent for Node fetch or http clients.
   * @param {object} gatewayRecord
   * @returns {object|null}
   */
  getDispatcher(gatewayRecord) {
    return null;
  }
}

module.exports = BaseEgressProvider;
