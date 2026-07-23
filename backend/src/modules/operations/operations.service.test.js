const mockOperationsRepository = {
  findActiveUserByEmail: jest.fn(),
  findEventStaffAssignment: jest.fn(),
  findPendingInvitation: jest.fn(),
  createStaffInvitation: jest.fn(),
  deleteStaffInvitation: jest.fn(),
};

jest.mock('./operations.repository', () => mockOperationsRepository);
jest.mock('../auth/auth.repository', () => ({}));
jest.mock('../notifications/notifications.service', () => ({}));
jest.mock('../../infrastructure/email/email.service', () => ({ sendEmail: jest.fn() }));
jest.mock('../../core/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const operationsService = require('./operations.service');

describe('staff invitation email consistency', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('removes the pending invitation when its email cannot be delivered', async () => {
    const organizer = { id: 'organizer-1', user_id: 'owner-1' };
    const event = { id: 'event-1', title: 'Event', organizer_user_id: 'owner-1' };
    const invitedUser = {
      id: 'user-1',
      email: 'staff@example.com',
      full_name: 'Staff',
    };
    const invitation = { id: 'invitation-1' };

    jest.spyOn(operationsService, 'getOrganizerContext').mockResolvedValue(organizer);
    jest.spyOn(operationsService, 'resolveOrganizerEvent').mockResolvedValue(event);
    jest.spyOn(operationsService, 'assertEventStaffManageable').mockImplementation();
    jest.spyOn(operationsService, 'assertInvitableUser').mockResolvedValue();
    jest.spyOn(operationsService, 'assertStaffScheduleAvailable').mockResolvedValue();
    jest.spyOn(operationsService, 'assertStaffQuotaAvailable').mockResolvedValue({ remaining_slots: 1 });
    jest.spyOn(operationsService, 'sendStaffInvitationEmail').mockResolvedValue(false);
    mockOperationsRepository.findActiveUserByEmail.mockResolvedValue(invitedUser);
    mockOperationsRepository.findEventStaffAssignment.mockResolvedValue(null);
    mockOperationsRepository.findPendingInvitation.mockResolvedValue(null);
    mockOperationsRepository.createStaffInvitation.mockResolvedValue(invitation);
    mockOperationsRepository.deleteStaffInvitation.mockResolvedValue(true);

    await expect(operationsService.inviteStaff('owner-1', {
      event_id: 'event-1',
      email: invitedUser.email,
      staff_role: 'CHECK_IN',
    })).rejects.toMatchObject({
      statusCode: 502,
      errorCode: 'EMAIL_DELIVERY_FAILED',
    });

    expect(mockOperationsRepository.deleteStaffInvitation).toHaveBeenCalledWith('invitation-1');
  });
});
