const bcrypt = require('bcryptjs');
const authRepository = require('../auth/auth.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

class UserService {
    async hashPassword(password) {
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS || '12'));
        return bcrypt.hash(password, salt);
    }

    async getProfile(userId) {
        const user = await authRepository.findUserById(userId);
        if (!user) {
            throw new AppError('User not found', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
        }

        // Return sensitive info removed
        const { password_hash, deleted_at, ...profile } = user;
        const roles = await authRepository.findUserRoles(userId);
        
        return { ...profile, roles };
    }

    async updateProfile(userId, updateData) {
        // Only allow certain fields to be updated
        const allowedFields = ['full_name', 'phone', 'address', 'dob', 'city', 'avatar_url', 'bio'];
        const updates = {};
        
        Object.keys(updateData).forEach(key => {
            if (allowedFields.includes(key)) {
                updates[key] = updateData[key];
            }
        });

        if (Object.keys(updates).length === 0) {
            throw new AppError('No valid fields to update', 400, ErrorCodes.BAD_REQUEST);
        }

        const updatedUser = await authRepository.updateUser(userId, updates);
        
        const { password_hash, deleted_at, ...profile } = updatedUser;
        const roles = await authRepository.findUserRoles(userId);
        
        return { ...profile, roles };
    }

    async changePassword(userId, currentPassword, newPassword) {
        const user = await authRepository.findUserById(userId);
        if (!user) {
            throw new AppError('User not found', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
        }

        // If user registered via Google and has no password
        if (user.password_hash === '*') {
            // Allow setting a password for the first time or maybe redirect to a different flow
            // For now, let's allow it if they want to add a password
        } else {
            const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isMatch) {
                throw new AppError('Mật khẩu hiện tại không chính xác', 400, ErrorCodes.AUTH_INVALID_CREDENTIALS);
            }
        }

        const password_hash = await this.hashPassword(newPassword);
        await authRepository.updateUser(userId, { password_hash });
        
        // Revoke all sessions after password change for security
        await authRepository.revokeAllUserSessions(userId);
    }
}

module.exports = new UserService();
