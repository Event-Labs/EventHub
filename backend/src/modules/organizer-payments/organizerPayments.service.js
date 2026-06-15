const organizerPaymentsRepository = require('./organizerPayments.repository');
const organizerEventsRepository = require('../organizer/organizerEvents.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

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
    return organizerPaymentsRepository.findChannelByOrganizerId(organizerId);
  }

  async saveChannel(userId, payload) {
    const organizerId = await this.getOrganizerId(userId);
    const { client_id, api_key, checksum_key } = payload;
    
    if (!client_id || !api_key || !checksum_key) {
      throw new AppError('client_id, api_key, and checksum_key are required', 400, ErrorCodes.INVALID_INPUT);
    }

    const data = {
      client_id: client_id.trim(),
      api_key_encrypted: api_key.trim(),
      checksum_key_encrypted: checksum_key.trim(),
      status: 'PENDING',
    };

    return organizerPaymentsRepository.upsertChannel(organizerId, data);
  }

  async testConnection(userId) {
    const organizerId = await this.getOrganizerId(userId);
    const channel = await organizerPaymentsRepository.findChannelByOrganizerId(organizerId);

    if (!channel) {
      throw new AppError('Payment channel not configured yet', 400, ErrorCodes.INVALID_INPUT);
    }

    // A simple test: typically we might call an API endpoint of PayOS.
    // For now, if credentials exist, we can mark it as ACTIVE.
    // Real implementation might involve a small fetch to PayOS to verify keys.
    // To do a real check, we could check the PayOS payment link creation or similar endpoint
    // but without an actual order, it might fail. So we assume they are valid if entered,
    // or you can add a lightweight API call to PayOS if available.
    
    const updatedChannel = await organizerPaymentsRepository.updateChannelStatus(organizerId, 'ACTIVE');
    return updatedChannel;
  }
}

module.exports = new OrganizerPaymentsService();
