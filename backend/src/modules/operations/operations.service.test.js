const mockOperationsRepository = {
  findActiveUserByEmail: jest.fn(),
  findEventStaffAssignment: jest.fn(),
  findPendingInvitation: jest.fn(),
  createStaffInvitation: jest.fn(),
  deleteStaffInvitation: jest.fn(),
  findInvitationForOrganizer: jest.fn(),
  updateStaffAssignment: jest.fn(),
  findEventSessions: jest.fn(),
  findStaffScheduleConflict: jest.fn(),
  listEventGates: jest.fn(),
  findEventGateById: jest.fn(),
  findEventGateByName: jest.fn(),
  createEventGate: jest.fn(),
  updateEventGate: jest.fn(),
  deleteEventGate: jest.fn(),
  findEventDevice: jest.fn(),
  updateEventDeviceGate: jest.fn(),
  getStaffGateCheckInHistory: jest.fn(),
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
    it('updates staff role, gate, zone, and session', async () => {
      const organizer = { id: 'organizer-1', user_id: 'owner-1' };
      const event = { id: 'event-1', title: 'Event' };
      const existing = { id: 'assign-1', event_id: 'event-1', staff_id: 'staff-1', staff_role: 'Check-in', gate: 'Cổng A', zone: 'Khu VIP', session_ids: null };
      const updated = { ...existing, gate: 'Cổng B', zone: 'Khán đài A', session_ids: ['sess-1'] };

      jest.spyOn(operationsService, 'getOrganizerContext').mockResolvedValue(organizer);
      jest.spyOn(operationsService, 'resolveOrganizerEvent').mockResolvedValue(event);
      jest.spyOn(operationsService, 'assertEventStaffManageable').mockImplementation();
      mockOperationsRepository.findEventStaffAssignment.mockResolvedValue(existing);
      mockOperationsRepository.findEventSessions.mockResolvedValue([{ id: 'sess-1', session_name: 'Phiên 1' }]);
      mockOperationsRepository.updateStaffAssignment.mockResolvedValue(updated);

      const result = await operationsService.updateStaffAssignment('owner-1', {
        eventId: 'event-1',
        staffId: 'staff-1',
        gate: 'Cổng B',
        zone: 'Khán đài A',
        sessionId: 'sess-1',
      });

      expect(result).toEqual(updated);
      expect(mockOperationsRepository.updateStaffAssignment).toHaveBeenCalledWith('event-1', 'staff-1', {
        staffRole: 'Check-in',
        gate: 'Cổng B',
        zone: 'Khán đài A',
        sessionIds: ['sess-1'],
      });
    });

    it('throws error when updating with invalid session', async () => {
      const organizer = { id: 'organizer-1', user_id: 'owner-1' };
      const event = { id: 'event-1', title: 'Event' };
      const existing = { id: 'assign-1', event_id: 'event-1', staff_id: 'staff-1' };

      jest.spyOn(operationsService, 'getOrganizerContext').mockResolvedValue(organizer);
      jest.spyOn(operationsService, 'resolveOrganizerEvent').mockResolvedValue(event);
      jest.spyOn(operationsService, 'assertEventStaffManageable').mockImplementation();
      mockOperationsRepository.findEventStaffAssignment.mockResolvedValue(existing);
      mockOperationsRepository.findEventSessions.mockResolvedValue([]);

      await expect(operationsService.updateStaffAssignment('owner-1', {
        eventId: 'event-1',
        staffId: 'staff-1',
        sessionId: 'invalid-sess',
      })).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('staff invitation with session', () => {
    it('successfully invites staff to a specific session', async () => {
      const organizer = { id: 'organizer-1', user_id: 'owner-1' };
      const event = { id: 'event-1', title: 'Event', organizer_user_id: 'owner-1' };
      const invitedUser = {
        id: 'user-1',
        email: 'staff@example.com',
        full_name: 'Staff Member',
      };
      const invitation = { id: 'invitation-1', session_ids: ['sess-1'], session_name: 'Phiên Buổi Tối' };

      jest.spyOn(operationsService, 'getOrganizerContext').mockResolvedValue(organizer);
      jest.spyOn(operationsService, 'resolveOrganizerEvent').mockResolvedValue(event);
      jest.spyOn(operationsService, 'assertEventStaffManageable').mockImplementation();
      jest.spyOn(operationsService, 'assertInvitableUser').mockResolvedValue();
      jest.spyOn(operationsService, 'assertStaffScheduleAvailable').mockResolvedValue();
      jest.spyOn(operationsService, 'assertStaffQuotaAvailable').mockResolvedValue({ remaining_slots: 1 });
      jest.spyOn(operationsService, 'sendStaffInvitationEmail').mockResolvedValue(true);
      mockOperationsRepository.findActiveUserByEmail.mockResolvedValue(invitedUser);
      mockOperationsRepository.findEventStaffAssignment.mockResolvedValue(null);
      mockOperationsRepository.findPendingInvitation.mockResolvedValue(null);
      mockOperationsRepository.findEventSessions.mockResolvedValue([{ id: 'sess-1', session_name: 'Phiên Buổi Tối' }]);
      mockOperationsRepository.createStaffInvitation.mockResolvedValue(invitation);

      const result = await operationsService.inviteStaff('owner-1', {
        event_id: 'event-1',
        email: invitedUser.email,
        staff_role: 'Check-in',
        session_id: 'sess-1',
      });

      expect(result).toMatchObject({
        id: 'invitation-1',
        email_sent: true,
      });
      expect(mockOperationsRepository.createStaffInvitation).toHaveBeenCalledWith(expect.objectContaining({
        eventId: 'event-1',
        sessionIds: ['sess-1'],
        sessionName: 'Phiên Buổi Tối',
      }));
    });

    it('invites staff to entire event when session_id is omitted or null', async () => {
      const organizer = { id: 'organizer-1', user_id: 'owner-1' };
      const event = { id: 'event-1', title: 'Event', organizer_user_id: 'owner-1' };
      const invitedUser = {
        id: 'user-1',
        email: 'staff2@example.com',
        full_name: 'Staff 2',
      };
      const invitation = { id: 'invitation-2', session_ids: null, session_name: null };

      jest.spyOn(operationsService, 'getOrganizerContext').mockResolvedValue(organizer);
      jest.spyOn(operationsService, 'resolveOrganizerEvent').mockResolvedValue(event);
      jest.spyOn(operationsService, 'assertEventStaffManageable').mockImplementation();
      jest.spyOn(operationsService, 'assertInvitableUser').mockResolvedValue();
      jest.spyOn(operationsService, 'assertStaffScheduleAvailable').mockResolvedValue();
      jest.spyOn(operationsService, 'assertStaffQuotaAvailable').mockResolvedValue({ remaining_slots: 1 });
      jest.spyOn(operationsService, 'sendStaffInvitationEmail').mockResolvedValue(true);
      mockOperationsRepository.findActiveUserByEmail.mockResolvedValue(invitedUser);
      mockOperationsRepository.findEventStaffAssignment.mockResolvedValue(null);
      mockOperationsRepository.findPendingInvitation.mockResolvedValue(null);
      mockOperationsRepository.createStaffInvitation.mockResolvedValue(invitation);

      const result = await operationsService.inviteStaff('owner-1', {
        event_id: 'event-1',
        email: invitedUser.email,
        staff_role: 'Check-in',
        session_id: null,
      });

      expect(result).toMatchObject({ id: 'invitation-2' });
      expect(mockOperationsRepository.createStaffInvitation).toHaveBeenCalledWith(expect.objectContaining({
        eventId: 'event-1',
        sessionIds: null,
        sessionName: null,
      }));
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

  describe('event gates & shared IoT/staff gate assignment', () => {
    it('creates a new gate for an organizer event and rejects duplicate names', async () => {
      const organizer = { id: 'organizer-1', user_id: 'owner-1' };
      const event = { id: 'event-1', title: 'Event' };
      jest.spyOn(operationsService, 'getOrganizerContext').mockResolvedValue(organizer);
      jest.spyOn(operationsService, 'resolveOrganizerEvent').mockResolvedValue(event);
      jest.spyOn(operationsService, 'assertEventStaffManageable').mockImplementation();

      mockOperationsRepository.findEventGateByName.mockResolvedValueOnce(null);
      mockOperationsRepository.createEventGate.mockResolvedValueOnce({
        id: 'gate-1',
        event_id: 'event-1',
        name: 'Cổng A',
        staff_count: 0,
        device_count: 0,
      });

      const created = await operationsService.createEventGate('owner-1', 'event-1', { name: 'Cổng A' });
      expect(created).toMatchObject({ id: 'gate-1', name: 'Cổng A' });

      mockOperationsRepository.findEventGateByName.mockResolvedValueOnce({ id: 'gate-1', name: 'Cổng A' });
      await expect(
        operationsService.createEventGate('owner-1', 'event-1', { name: 'cổng a' }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('resolves gate_id from DB when updating staff assignment and rejects invalid gate_id', async () => {
      const organizer = { id: 'organizer-1', user_id: 'owner-1' };
      const event = { id: 'event-1', title: 'Event' };
      const existing = { id: 'assign-1', event_id: 'event-1', staff_id: 'staff-1', staff_role: 'Check-in', gate: null, gate_id: null, zone: null };

      jest.spyOn(operationsService, 'getOrganizerContext').mockResolvedValue(organizer);
      jest.spyOn(operationsService, 'resolveOrganizerEvent').mockResolvedValue(event);
      jest.spyOn(operationsService, 'assertEventStaffManageable').mockImplementation();
      mockOperationsRepository.findEventStaffAssignment.mockResolvedValue(existing);
      mockOperationsRepository.findEventGateById.mockResolvedValueOnce({ id: 'gate-1', event_id: 'event-1', name: 'Cổng VIP' });
      mockOperationsRepository.updateStaffAssignment.mockResolvedValueOnce({
        ...existing,
        gate_id: 'gate-1',
        gate: 'Cổng VIP',
      });

      const updated = await operationsService.updateStaffAssignment('owner-1', {
        eventId: 'event-1',
        staffId: 'staff-1',
        gateId: 'gate-1',
      });

      expect(updated.gate_id).toBe('gate-1');
      expect(mockOperationsRepository.updateStaffAssignment).toHaveBeenCalledWith('event-1', 'staff-1', expect.objectContaining({
        gateId: 'gate-1',
        gate: 'Cổng VIP',
      }));

      mockOperationsRepository.findEventGateById.mockResolvedValueOnce(null);
      await expect(
        operationsService.updateStaffAssignment('owner-1', {
          eventId: 'event-1',
          staffId: 'staff-1',
          gateId: 'wrong-gate',
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('assigns an event DB gate to an IoT device via updateOrganizerEventDeviceGate', async () => {
      const organizer = { id: 'organizer-1', user_id: 'owner-1' };
      const event = { id: 'event-1', title: 'Event' };
      jest.spyOn(operationsService, 'getOrganizerContext').mockResolvedValue(organizer);
      jest.spyOn(operationsService, 'resolveOrganizerEvent').mockResolvedValue(event);
      jest.spyOn(operationsService, 'assertEventStaffManageable').mockImplementation();

      mockOperationsRepository.findEventDevice.mockResolvedValue({
        id: 'dev-1',
        assigned_event_id: 'event-1',
        status: 'ACTIVE',
      });
      mockOperationsRepository.findEventGateById.mockResolvedValue({
        id: 'gate-1',
        event_id: 'event-1',
        name: 'Cổng A',
      });
      mockOperationsRepository.updateEventDeviceGate.mockResolvedValue({
        id: 'dev-1',
        assigned_gate_id: 'gate-1',
        assigned_gate: 'Cổng A',
      });

      const res = await operationsService.updateOrganizerEventDeviceGate('owner-1', 'event-1', 'dev-1', 'gate-1');
      expect(res).toMatchObject({ assigned_gate_id: 'gate-1', assigned_gate: 'Cổng A' });
      expect(mockOperationsRepository.updateEventDeviceGate).toHaveBeenCalledWith('event-1', 'dev-1', {
        gateId: 'gate-1',
        gateName: 'Cổng A',
      });
    });

    it('returns shared staff + IoT gate check-in history', async () => {
      const mockHistory = {
        assignments: [{ event_id: 'event-1', gate_id: 'gate-1', gate: 'Cổng A', shared_devices: [{ id: 'dev-1', name: 'ESP32 Cổng A' }] }],
        items: [
          { id: 't-1', source: 'IOT', actor_name: 'ESP32 Cổng A', gate_name: 'Cổng A' },
          { id: 't-2', source: 'STAFF', actor_name: 'Staff A', gate_name: 'Cổng A' },
        ],
      };
      mockOperationsRepository.getStaffGateCheckInHistory.mockResolvedValue(mockHistory);

      const res = await operationsService.getStaffGateCheckInHistory('staff-1', { limit: 25 });
      expect(res).toEqual(mockHistory);
      expect(mockOperationsRepository.getStaffGateCheckInHistory).toHaveBeenCalledWith('staff-1', {
        eventId: null,
        limit: 25,
      });

      await operationsService.getStaffGateCheckInHistory('staff-1', { limit: 50, result: 'ALL' });
      expect(mockOperationsRepository.getStaffGateCheckInHistory).toHaveBeenCalledWith('staff-1', {
        eventId: null,
        limit: 50,
        result: 'ALL',
      });
    });
  });
});
