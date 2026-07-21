import { http } from './http'

export const authService = {
    login: async (credentials) => {
        const response = await http.post('/auth/login', credentials)
        return response.data
    },

    verifyLoginOtp: async ({ challengeId, otp }) => {
        const response = await http.post('/auth/verify-login-otp', { challengeId, otp })
        return response.data
    },

    verifyAdminOtp: async ({ challengeId, otp }) => {
        const response = await http.post('/auth/verify-admin-otp', { challengeId, otp })
        return response.data
    },

    register: async (userData) => {
        const response = await http.post('/auth/register', userData)
        return response.data
    },

    googleLogin: async (credential) => {
        const response = await http.post('/auth/google', { credential })
        return response.data
    },

    forgotPassword: async (email) => {
        const response = await http.post('/auth/forgot-password', { email })
        return response.data
    },

    resetPassword: async (token, newPassword) => {
        const response = await http.post('/auth/reset-password', { token, newPassword })
        return response.data
    },

    verifyEmail: async (token) => {
        const response = await http.get(`/auth/verify-email?token=${token}`)
        return response.data
    },

    logout: async () => {
        const response = await http.post('/auth/logout')
        return response.data
    },

    refresh: async () => {
        const response = await http.post('/auth/refresh')
        return response.data
    },
}
