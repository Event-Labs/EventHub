import { http } from './http';

const adminUserService = {
  listUsers: (params) => http.get('/admin/users', { params }),
  getUserDetails: (id) => http.get(`/admin/users/${id}`),
  lockUser: (id, data) => http.post(`/admin/users/${id}/lock`, data),
  unlockUser: (id) => http.post(`/admin/users/${id}/unlock`),
};

export default adminUserService;
