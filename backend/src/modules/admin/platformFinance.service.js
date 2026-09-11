const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const platformFinanceRepository = require('./platformFinance.repository');

function assertEffectiveRange(payload) {
  if (!payload.effective_from || !payload.effective_to) return;

  if (new Date(payload.effective_from).getTime() > new Date(payload.effective_to).getTime()) {
    throw new AppError('Effective from must be before effective to', 400, ErrorCodes.INVALID_INPUT);
  }
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
