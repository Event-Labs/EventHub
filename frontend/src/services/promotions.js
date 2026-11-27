import { http } from './http'

const promotionService = {
  getAvailableEventPromos: (eventId) => http.get(`/promotions/public/events/${eventId}/available`),
  validateEventPromo: (eventId, data) => http.post(`/promotions/public/events/${eventId}/validate`, data),
  getAllPromos: (params) => http.get('/promotions', { params }),
  getPromoDetail: (id) => http.get(`/promotions/${id}`),
  createPromo: (data) => http.post('/promotions', data),
  updatePromo: (id, data) => http.put(`/promotions/${id}`, data),
  deactivatePromo: (id) => http.delete(`/promotions/${id}`),
}

export default promotionService
