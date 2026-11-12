import { http } from './http'

/**
 * Service for Virtual Waiting Room API calls
 */
export const waitingRoomService = {
  /**
   * Join the Virtual Waiting Room or recover an existing queue session
   */
  async joinQueue(eventId, sessionId = null) {
    const res = await http.post(`/events/${eventId}/queue/join`, {
      session_id: sessionId,
    })
    return res.data?.data || res.data
  },

  /**
   * Get queue status and position (polled periodically)
   */
  async getQueueStatus(eventId, sessionId) {
    const res = await http.get(`/events/${eventId}/queue/status`, {
      params: { sessionId },
    })
    return res.data?.data || res.data
  },

  /**
   * Leave the queue voluntarily
   */
  async leaveQueue(eventId, sessionId) {
    const res = await http.post(`/events/${eventId}/queue/leave`, {
      session_id: sessionId,
    })
    return res.data?.data || res.data
  },

  /**
   * Admin: Get Live Queue Statistics
   */
  async getAdminStats(eventId) {
    const res = await http.get(`/events/${eventId}/queue/admin/stats`)
    return res.data?.data || res.data
  },

  /**
   * Admin: Update Queue Configuration
   */
  async updateConfig(eventId, payload) {
    const res = await http.put(`/events/${eventId}/queue/admin/config`, payload)
    return res.data?.data || res.data
  },

  /**
   * Admin: Pause Queue
   */
  async pauseQueue(eventId) {
    const res = await http.post(`/events/${eventId}/queue/admin/pause`)
    return res.data?.data || res.data
  },

  /**
   * Admin: Resume Queue
   */
  async resumeQueue(eventId) {
    const res = await http.post(`/events/${eventId}/queue/admin/resume`)
    return res.data?.data || res.data
  },
}

