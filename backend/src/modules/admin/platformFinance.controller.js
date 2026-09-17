const ApiResponse = require('../../core/response/ApiResponse');
const platformFinanceService = require('./platformFinance.service');
const {
  policyDocumentSchema,
  policyTypeQuerySchema,
  policyConfigSchema,
  updatePolicyConfigSchema,
  updatePolicyDocumentSchema,
  uuidParamSchema,
} = require('./platformFinance.validation');

class PlatformFinanceController {
  listPolicies = async (req, res, next) => {
    try {
      const { policy_type: policyType } = policyTypeQuerySchema.parse(req.query);
      const data = await platformFinanceService.listPolicies(policyType);
      res.status(200).json(ApiResponse.success(data, 'Platform policies fetched'));
    } catch (err) {
      next(err);
    }
  };

  listActivePolicies = async (req, res, next) => {
    try {
      const { policy_type: policyType } = policyTypeQuerySchema.parse(req.query);
      const data = await platformFinanceService.listActivePolicies(policyType);
      res.status(200).json(ApiResponse.success(data, 'Active platform policies fetched'));
    } catch (err) {
      next(err);
    }
  };

  createPolicy = async (req, res, next) => {
    try {
      const payload = policyConfigSchema.parse(req.body);
      const data = await platformFinanceService.createPolicy(payload, req.user.sub);
      res.status(201).json(ApiResponse.success(data, 'Platform policy created'));
    } catch (err) {
      next(err);
    }
  };

  updatePolicy = async (req, res, next) => {
    try {
      const { id } = uuidParamSchema.parse(req.params);
      const payload = updatePolicyConfigSchema.parse(req.body);
      const data = await platformFinanceService.updatePolicy(id, payload, req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Platform policy updated'));
    } catch (err) {
      next(err);
    }
  };

  deletePolicy = async (req, res, next) => {
    try {
      const { id } = uuidParamSchema.parse(req.params);
      const data = await platformFinanceService.deletePolicy(id);
      res.status(200).json(ApiResponse.success(data, 'Platform policy deleted'));
    } catch (err) {
      next(err);
    }
  };

  listDocuments = async (req, res, next) => {
    try {
      const { id } = uuidParamSchema.parse(req.params);
      const data = await platformFinanceService.listDocuments(id);
      res.status(200).json(ApiResponse.success(data, 'Policy documents fetched'));
    } catch (err) {
      next(err);
    }
  };

  createDocument = async (req, res, next) => {
    try {
      const { id } = uuidParamSchema.parse(req.params);
      const payload = policyDocumentSchema.parse(req.body);
      const data = await platformFinanceService.createDocument(id, payload, req.user.sub);
      res.status(201).json(ApiResponse.success(data, 'Policy document created'));
    } catch (err) {
      next(err);
    }
  };

  updateDocument = async (req, res, next) => {
    try {
      const { id } = uuidParamSchema.parse(req.params);
      const payload = updatePolicyDocumentSchema.parse(req.body);
      const data = await platformFinanceService.updateDocument(id, payload);
      res.status(200).json(ApiResponse.success(data, 'Policy document updated'));
    } catch (err) {
      next(err);
    }
  };

  deleteDocument = async (req, res, next) => {
    try {
      const { id } = uuidParamSchema.parse(req.params);
      const data = await platformFinanceService.deleteDocument(id);
      res.status(200).json(ApiResponse.success(data, 'Policy document deleted'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new PlatformFinanceController();
