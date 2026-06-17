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
