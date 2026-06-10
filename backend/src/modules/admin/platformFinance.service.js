const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const platformFinanceRepository = require('./platformFinance.repository');

function toNumber(value) {
  return Number(value || 0);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function assertEffectiveRange(payload) {
  if (!payload.effective_from || !payload.effective_to) return;

  if (new Date(payload.effective_from).getTime() > new Date(payload.effective_to).getTime()) {
    throw new AppError('Effective from must be before effective to', 400, ErrorCodes.INVALID_INPUT);
  }
}

function normalizeFeePayload(payload) {
  const normalized = { ...payload };

  if (normalized.fee_type === 'PERCENTAGE') {
    normalized.fixed_amount = 0;
  }

  if (normalized.fee_type === 'FIXED') {
    normalized.percentage_value = 0;
  }

  return normalized;
}

function serializeFee(row) {
  if (!row) return row;

  return {
    ...row,
    percentage_value: toNumber(row.percentage_value),
    fixed_amount: toNumber(row.fixed_amount),
  };
}

function serializeDocument(row) {
  if (!row) return row;

  return {
    ...row,
    file_size: row.file_size === null || row.file_size === undefined ? null : Number(row.file_size),
  };
}

function serializePolicy(row, documents = undefined) {
  if (!row) return row;

  return {
    ...row,
    config: row.config || {},
    document_count: Number(row.document_count || 0),
    ...(documents ? { documents: documents.map(serializeDocument) } : {}),
  };
}

function isSupportedPolicyDocument(mimeType = '') {
  return [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ].includes(mimeType);
}

class PlatformFinanceService {
  calculatePlatformFee(subtotal, feeConfig) {
    if (!feeConfig) {
      return {
        platform_fee_config_id: null,
        platform_fee: 0,
        total_amount: roundMoney(subtotal),
      };
    }

    const percentageFee = subtotal * (toNumber(feeConfig.percentage_value) / 100);
    const fixedFee = toNumber(feeConfig.fixed_amount);
    const platformFee = roundMoney(percentageFee + fixedFee);

    return {
      platform_fee_config_id: feeConfig.id,
      platform_fee: platformFee,
      total_amount: roundMoney(subtotal + platformFee),
    };
  }

  async findActiveFeeForCategory(categoryId) {
    return serializeFee(await platformFinanceRepository.findActiveFeeForCategory(categoryId || null));
  }

  async listFees() {
    const rows = await platformFinanceRepository.findFees();
    return rows.map(serializeFee);
  }

  async createFee(payload, userId) {
    assertEffectiveRange(payload);
    const fee = await platformFinanceRepository.createFee(normalizeFeePayload(payload), userId);
    return serializeFee(fee);
  }

  async updateFee(id, payload) {
    const existing = await platformFinanceRepository.findFeeById(id);
    if (!existing) {
      throw new AppError('Platform fee configuration not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const merged = { ...existing, ...payload };
    assertEffectiveRange(merged);
    const fee = await platformFinanceRepository.updateFee(id, normalizeFeePayload(payload));
    return serializeFee(fee);
  }

  async deleteFee(id) {
    const deleted = await platformFinanceRepository.deleteFee(id);
    if (!deleted) {
      throw new AppError('Platform fee configuration not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    return { id, deleted: true };
  }

  async listPolicies(policyType = null) {
    const rows = await platformFinanceRepository.findPolicies(policyType);
    return rows.map((row) => serializePolicy(row));
  }

  async listActivePolicies(policyType = null) {
    const policies = await platformFinanceRepository.findActivePolicies(policyType);
    const withDocuments = await Promise.all(
      policies.map(async (policy) => {
        const documents = await platformFinanceRepository.findPublicDocuments(policy.id);
        return serializePolicy(policy, documents);
      }),
    );
    return withDocuments;
  }

  async createPolicy(payload, userId) {
    assertEffectiveRange(payload);
    const policy = await platformFinanceRepository.createPolicy(payload, userId);
    return serializePolicy(policy);
  }

  async updatePolicy(id, payload, userId) {
    const existing = await platformFinanceRepository.findPolicyById(id);
    if (!existing) {
      throw new AppError('Platform policy configuration not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    assertEffectiveRange({ ...existing, ...payload });
    const policy = await platformFinanceRepository.updatePolicy(id, payload, userId);
    return serializePolicy(policy);
  }

  async deletePolicy(id) {
    const deleted = await platformFinanceRepository.deletePolicy(id);
    if (!deleted) {
      throw new AppError('Platform policy configuration not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    return { id, deleted: true };
  }

  async listDocuments(policyConfigId) {
    const policy = await platformFinanceRepository.findPolicyById(policyConfigId);
    if (!policy) {
      throw new AppError('Platform policy configuration not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const rows = await platformFinanceRepository.findDocuments(policyConfigId);
    return rows.map(serializeDocument);
  }

  async createDocument(policyConfigId, payload, userId) {
    const policy = await platformFinanceRepository.findPolicyById(policyConfigId);
    if (!policy) {
      throw new AppError('Platform policy configuration not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (!isSupportedPolicyDocument(payload.mime_type)) {
      throw new AppError('Policy document must be a PDF or DOCX file', 400, ErrorCodes.INVALID_INPUT);
    }

    return serializeDocument(await platformFinanceRepository.createDocument(policyConfigId, payload, userId));
  }

  async updateDocument(documentId, payload) {
    const existing = await platformFinanceRepository.findDocumentById(documentId);
    if (!existing) {
      throw new AppError('Policy document not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    return serializeDocument(await platformFinanceRepository.updateDocument(documentId, payload));
  }

  async deleteDocument(documentId) {
    const deleted = await platformFinanceRepository.deleteDocument(documentId);
    if (!deleted) {
      throw new AppError('Policy document not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    return { id: documentId, deleted: true };
  }
}

module.exports = new PlatformFinanceService();
