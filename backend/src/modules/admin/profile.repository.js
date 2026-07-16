const authRepository = require('../auth/auth.repository');

class AdminProfileRepository {
  async findAdminById(userId) {
    const user = await authRepository.findUserById(userId);
    if (!user) return null;

    const roles = await authRepository.findUserRoles(userId);
    return { ...user, roles };
  }

  async hasUserColumn(columnName) {
    return authRepository.userColumnExists(columnName);
  }

  async updateSecurityCheckSnapshot(userId, checkedAt, result) {
    return authRepository.updateUserIfColumnsExist(userId, {
      last_security_check_at: checkedAt,
      security_check_result: result,
    });
  }

  async updatePasswordChangedAt(userId, passwordChangedAt) {
    return authRepository.updateUserIfColumnsExist(userId, {
      password_changed_at: passwordChangedAt,
    });
  }

  async listUserSessions(userId) {
    return authRepository.listUserSessions(userId);
  }

  async updateTwoFactorEnabled(userId, enabled) {
    return authRepository.updateUserIfColumnsExist(userId, {
      two_factor_enabled: enabled,
    });
  }
}

module.exports = new AdminProfileRepository();
