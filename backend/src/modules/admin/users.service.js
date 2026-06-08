const userRepository = require('./users.repository');
const AppError = require('../../core/errors/AppError');
const authRepository = require('../auth/auth.repository');

class UserService {
  async listUsers(filters) {
    return await userRepository.findAll(filters);
  }

  async getUserDetails(id) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  }

  async lockUser(id, { reason, duration, customDuration, adminId }) {
    const user = await userRepository.findById(id);
    if (!user) throw new AppError('User not found', 404);

    let lockedUntil = null;
    if (duration !== 'PERMANENT') {
      const now = new Date();
      if (duration === 'CUSTOM' && customDuration) {
        lockedUntil = new Date(customDuration);
      } else {
        const days = parseInt(duration);
        lockedUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      }
    }

    const updatedUser = await userRepository.updateStatus(id, {
      status: 'LOCKED',
      lock_reason: reason,
      locked_at: new Date(),
      locked_until: lockedUntil,
      locked_by: adminId,
    });

    // Invalidate all user sessions
    await authRepository.revokeAllUserSessions(id);

    return updatedUser;
  }

  async unlockUser(id) {
    const user = await userRepository.findById(id);
    if (!user) throw new AppError('User not found', 404);

    return await userRepository.unlock(id);
  }
}

module.exports = new UserService();
