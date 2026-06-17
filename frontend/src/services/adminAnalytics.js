import { http } from '@/services/http.js'

/**
 * @param {{ dateFrom?: string, dateTo?: string }} params
 */
export async function fetchAdminAnalyticsOverview(params = {}) {
  const response = await http.get('/admin/analytics/overview', { params })
  return response.data.data
}

/**
 * @param {{ dateFrom?: string, dateTo?: string, groupBy?: 'day'|'week'|'month' }} params
 */
export async function fetchAdminRevenueTrend(params = {}) {
  const response = await http.get('/admin/analytics/revenue-trend', { params })
  return response.data.data
}

/**
 * @param {{ dateFrom?: string, dateTo?: string }} params
 */
export async function fetchAdminUserRegistrationTrend(params = {}) {
  const response = await http.get('/admin/analytics/user-registration-trend', { params })
  return response.data.data
}

/**
 * @param {{ limit?: number }} params
 */
export async function fetchAdminTopOrganizers(params = {}) {
  const response = await http.get('/admin/analytics/top-organizers', { params })
  return response.data.data
}

export async function fetchAdminEventsByCategory() {
  const response = await http.get('/admin/analytics/events-by-category')
  return response.data.data
}

export async function fetchAdminSubscriptionRevenue() {
  const response = await http.get('/admin/analytics/subscription-revenue')
  return response.data.data
}
