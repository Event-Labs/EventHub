import { http } from './http'

export async function fetchAdminOrganizers(params = {}) {
  const response = await http.get('/admin/organizers', { params })
  return response.data.data
}

export async function fetchAdminOrganizerDetails(id) {
  const response = await http.get(`/admin/organizers/${id}`)
  return response.data.data
}

export async function updateAdminOrganizerStatus(id, status) {
  const response = await http.patch(`/admin/organizers/${id}/status`, { status })
  return response.data.data
}
