import { http } from './http'

const promotionService = {
  getAllPromos: (params) => http.get('/promotions', { params }),
  getPromoDetail: (id) => http.get(`/promotions/${id}`),
  createPromo: (data) => http.post('/promotions', data),
  updatePromo: (id, data) => http.put(`/promotions/${id}`, data),
  deactivatePromo: (id) => http.delete(`/promotions/${id}`),
}

export default promotionService
