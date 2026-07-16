const bcrypt = require('bcryptjs');
const authRepository = require('../auth/auth.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

class UserService {
    async hashPassword(password) {
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS || '12'));
        return bcrypt.hash(password, salt);
    }

    validateVietnamesePhone(phone) {
        if (!phone) return true; // Phone is optional in some cases, but if provided it must be valid
        const regex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
        return regex.test(phone);
    }

    normalizePhone(phone) {
        if (!phone) return phone;
        if (phone.startsWith('+84')) {
            return '0' + phone.slice(3);
        }
        return phone;
    }

    async getProfile(userId) {
        const user = await authRepository.findUserById(userId);
        if (!user) {
            throw new AppError('User not found', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
        }

        const { password_hash, deleted_at, ...profile } = user;
        const roles = await authRepository.findUserRoles(userId);
        
        // hasPassword is true if the user has a real password hash (not null, empty, or '*')
        const hasPassword = !!(password_hash && password_hash !== '*');
        
        return { ...profile, roles, hasPassword };
    }

    async updateProfile(userId, updateData) {
        // Only allow certain fields to be updated
        const allowedFields = ['full_name', 'phone', 'address', 'dob', 'city', 'avatar_url', 'bio'];
        const updates = {};

        if ('full_name' in updateData) {
            const fullName = String(updateData.full_name || '').trim();
            if (!fullName) {
                throw new AppError('Vui lòng nhập họ và tên.', 400, ErrorCodes.BAD_REQUEST);
            }
            updateData.full_name = fullName;
        }
        
        if ('phone' in updateData) {
            const phone = String(updateData.phone || '').trim();
            if (!phone) {
                updateData.phone = null;
            } else if (!this.validateVietnamesePhone(phone)) {
                throw new AppError('Số điện thoại không đúng định dạng Việt Nam. Vui lòng nhập theo dạng 09xxxxxxxx hoặc +849xxxxxxxx.', 400, ErrorCodes.BAD_REQUEST);
            } else {
                updateData.phone = this.normalizePhone(phone);
            }
        }

        ['address', 'dob', 'city', 'avatar_url', 'bio'].forEach((field) => {
            if (field in updateData && typeof updateData[field] === 'string' && !updateData[field].trim()) {
                updateData[field] = null;
            }
        });

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
        const hasPassword = !!(password_hash && password_hash !== '*');
        
        return { ...profile, roles, hasPassword };
    }

    async changePassword(userId, currentPassword, newPassword) {
        const user = await authRepository.findUserById(userId);
        if (!user) {
            throw new AppError('User not found', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
        }

        const hasPassword = !!(user.password_hash && user.password_hash !== '*');

        if (hasPassword) {
            if (!currentPassword) {
                throw new AppError('Bắt buộc nhập mật khẩu hiện tại', 400, ErrorCodes.BAD_REQUEST);
            }
            const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isMatch) {
                throw new AppError('Mật khẩu hiện tại không chính xác', 400, ErrorCodes.AUTH_INVALID_CREDENTIALS);
            }

            // Check if new password is same as old
            const isSame = await bcrypt.compare(newPassword, user.password_hash);
            if (isSame) {
                throw new AppError('Mật khẩu mới không được trùng với mật khẩu cũ', 400, ErrorCodes.BAD_REQUEST);
            }
        }

        // Validate password strength
        if (newPassword.length < 6) {
            throw new AppError('Mật khẩu mới phải có ít nhất 6 ký tự', 400, ErrorCodes.BAD_REQUEST);
        }

        const password_hash = await this.hashPassword(newPassword);
        await authRepository.updateUserIfColumnsExist(userId, {
            password_hash,
            password_changed_at: new Date(),
        });
        
        // Revoke all sessions after password change for security
        await authRepository.revokeAllUserSessions(userId);
    }
}

module.exports = new UserService();
