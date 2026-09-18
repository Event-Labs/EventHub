const mockOperationsRepository = {
  findActiveUserByEmail: jest.fn(),
  findEventStaffAssignment: jest.fn(),
  findPendingInvitation: jest.fn(),
  createStaffInvitation: jest.fn(),
  deleteStaffInvitation: jest.fn(),
  findInvitationForOrganizer: jest.fn(),
  updateStaffAssignment: jest.fn(),
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

describe('operationsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('staff invitation email consistency', () => {
    it('removes the pending invitation when its email cannot be delivered', async () => {
      const organizer = { id: 'organizer-1', user_id: 'owner-1' };
      const event = { id: 'event-1', title: 'Event', organizer_user_id: 'owner-1' };
      const invitedUser = {
        id: 'user-1',
        email: 'staff@example.com',
        full_name: 'Staff',
      };
      const invitation = { id: 'invitation-1', gate: 'Cổng A', zone: 'Khu VIP' };

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
        gate: 'Cổng A',
        zone: 'Khu VIP',
      })).rejects.toMatchObject({
        statusCode: 502,
        errorCode: 'EMAIL_DELIVERY_FAILED',
      });

      expect(mockOperationsRepository.deleteStaffInvitation).toHaveBeenCalledWith('invitation-1');
    });
  });

  describe('updateStaffAssignment', () => {
    it('updates staff role, gate, and zone', async () => {
      const organizer = { id: 'organizer-1', user_id: 'owner-1' };
      const event = { id: 'event-1', title: 'Event' };
      const existing = { id: 'assign-1', event_id: 'event-1', staff_id: 'staff-1', staff_role: 'Check-in', gate: 'Cổng A', zone: 'Khu VIP' };
      const updated = { ...existing, gate: 'Cổng B', zone: 'Khán đài A' };

      jest.spyOn(operationsService, 'getOrganizerContext').mockResolvedValue(organizer);
      jest.spyOn(operationsService, 'resolveOrganizerEvent').mockResolvedValue(event);
      jest.spyOn(operationsService, 'assertEventStaffManageable').mockImplementation();
      mockOperationsRepository.findEventStaffAssignment.mockResolvedValue(existing);
      mockOperationsRepository.updateStaffAssignment.mockResolvedValue(updated);

      const result = await operationsService.updateStaffAssignment('owner-1', {
        eventId: 'event-1',
        staffId: 'staff-1',
        gate: 'Cổng B',
        zone: 'Khán đài A',
      });

      expect(result).toEqual(updated);
      expect(mockOperationsRepository.updateStaffAssignment).toHaveBeenCalledWith('event-1', 'staff-1', {
        staffRole: 'Check-in',
        gate: 'Cổng B',
        zone: 'Khán đài A',
      });
    });
  });

  describe('deleteStaffInvitation', () => {
    it('deletes the staff invitation when valid', async () => {
      const organizer = { id: 'organizer-1', user_id: 'owner-1' };
      const event = { id: 'event-1', title: 'Event' };
      const invitation = { id: 'invitation-1', event_id: 'event-1' };

      jest.spyOn(operationsService, 'getOrganizerContext').mockResolvedValue(organizer);
      jest.spyOn(operationsService, 'resolveOrganizerEvent').mockResolvedValue(event);
      jest.spyOn(operationsService, 'assertEventStaffManageable').mockImplementation();
      mockOperationsRepository.findInvitationForOrganizer.mockResolvedValue(invitation);
      mockOperationsRepository.deleteStaffInvitation.mockResolvedValue(true);

      const result = await operationsService.deleteStaffInvitation('owner-1', 'invitation-1');
      expect(result).toEqual({ invitation_id: 'invitation-1', deleted: true });
      expect(mockOperationsRepository.deleteStaffInvitation).toHaveBeenCalledWith('invitation-1');
    });

    it('throws error when invitation is not found', async () => {
      const organizer = { id: 'organizer-1', user_id: 'owner-1' };

      jest.spyOn(operationsService, 'getOrganizerContext').mockResolvedValue(organizer);
      mockOperationsRepository.findInvitationForOrganizer.mockResolvedValue(null);

      await expect(operationsService.deleteStaffInvitation('owner-1', 'invalid-id')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
