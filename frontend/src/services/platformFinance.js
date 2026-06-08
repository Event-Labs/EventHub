import { http } from '@/services/http.js'

export async function fetchPlatformFees() {
  const response = await http.get('/admin/platform-finance/fees')
  return response.data.data
}

export async function createPlatformFee(payload) {
  const response = await http.post('/admin/platform-finance/fees', payload)
  return response.data.data
}

export async function updatePlatformFee(id, payload) {
  const response = await http.patch(`/admin/platform-finance/fees/${id}`, payload)
  return response.data.data
}

export async function deletePlatformFee(id) {
  const response = await http.delete(`/admin/platform-finance/fees/${id}`)
  return response.data.data
}

export async function fetchPlatformPolicies(params = {}) {
  const response = await http.get('/admin/platform-finance/policies', { params })
  return response.data.data
}

export async function fetchActivePlatformPolicies(params = {}) {
  const response = await http.get('/platform-policies', { params })
  return response.data.data
}

export async function fetchOrganizerPlatformPolicies(params = {}) {
  const response = await http.get('/platform-policies/organizer', { params })
  return response.data.data
}

export async function createPlatformPolicy(payload) {
  const response = await http.post('/admin/platform-finance/policies', payload)
  return response.data.data
}

export async function updatePlatformPolicy(id, payload) {
  const response = await http.patch(`/admin/platform-finance/policies/${id}`, payload)
  return response.data.data
}

export async function deletePlatformPolicy(id) {
  const response = await http.delete(`/admin/platform-finance/policies/${id}`)
  return response.data.data
}

export async function fetchPolicyDocuments(policyId) {
  const response = await http.get(`/admin/platform-finance/policies/${policyId}/documents`)
  return response.data.data
}

export async function createPolicyDocument(policyId, payload) {
  const response = await http.post(`/admin/platform-finance/policies/${policyId}/documents`, payload)
  return response.data.data
}

export async function updatePolicyDocument(id, payload) {
  const response = await http.patch(`/admin/platform-finance/policy-documents/${id}`, payload)
  return response.data.data
}

export async function deletePolicyDocument(id) {
  const response = await http.delete(`/admin/platform-finance/policy-documents/${id}`)
  return response.data.data
}
