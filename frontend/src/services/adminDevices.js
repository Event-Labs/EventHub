import { http } from './http.js'

export async function fetchAdminDevices(params = {}) {
  const response = await http.get('/admin/devices', { params })
  return response.data.data
}

export async function fetchAssignableEvents() {
  const response = await http.get('/admin/devices/events')
  return response.data.data
}

export async function fetchAdminDeviceDetail(deviceId) {
  const response = await http.get(`/admin/devices/${deviceId}`)
  return response.data.data
}

export async function approveAdminDevice(deviceId, payload) {
  const response = await http.post(`/admin/devices/${deviceId}/approve`, payload)
  return response.data.data
}

export async function updateAdminDevice(deviceId, payload) {
  const response = await http.patch(`/admin/devices/${deviceId}`, payload)
  return response.data.data
}

export async function disableAdminDevice(deviceId) {
  const response = await http.post(`/admin/devices/${deviceId}/disable`)
  return response.data.data
}

export async function enableAdminDevice(deviceId) {
  const response = await http.post(`/admin/devices/${deviceId}/enable`)
  return response.data.data
}

export async function revokeAdminDevice(deviceId) {
  const response = await http.post(`/admin/devices/${deviceId}/revoke`)
  return response.data.data
}

export async function resetAdminDevicePairing(deviceId) {
  const response = await http.post(`/admin/devices/${deviceId}/reset-pairing`)
  return response.data.data
}

export async function deleteAdminDevice(deviceId) {
  const response = await http.delete(`/admin/devices/${deviceId}`)
  return response.data.data
}

