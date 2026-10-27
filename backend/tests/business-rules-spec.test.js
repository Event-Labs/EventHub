const {
  classifyEventChanges,
  calculateMinQuota,
  addSalesBlock,
  releaseSalesBlock,
  computeSalesStatus,
  appendAuditTrail,
} = require('../src/modules/events/eventLifecycleHelper');
const ErrorCodes = require('../src/core/errors/errorCodes');

describe('EventHub Business Rules Specification (v3.2) - Core Domain Rules', () => {
  describe('Rule 1: Classification of Event Changes (Section 4.3)', () => {
    const baseEvent = {
      id: 'ev-100',
      status: 'PUBLISHED',
      format: 'OFFLINE',
      title: 'Original Title',
      description: 'Original Description',
      short_description: 'Original Short',
      sessions: [
        {
          id: 'sess-1',
          start_time: '2026-12-01T10:00:00Z',
          end_time: '2026-12-01T12:00:00Z',
          venue_id: 'venue-1',
        },
      ],
    };

    it('should classify informational fields as MINOR updates', () => {
      const payload = {
        description: 'New detailed description',
        short_description: 'New summary',
        tags: ['music', 'live'],
        thumbnail_url: 'https://example.com/new-thumb.jpg',
      };

      const result = classifyEventChanges(baseEvent, payload, { hasFinancialOrders: true });
      expect(result.changeClass).toBe('MINOR');
    });

    it('should classify title and terms changes as MAJOR updates', () => {
      const payload = {
        title: 'Brand New Title',
      };

      const result = classifyEventChanges(baseEvent, payload, { hasFinancialOrders: false });
      expect(result.changeClass).toBe('MAJOR');
      expect(result.changes.some((c) => c.field === 'title')).toBe(true);
    });

    it('should classify session time changes as CRITICAL when event has financial orders', () => {
      const payload = {
        sessions: [
          {
            id: 'sess-1',
            start_time: '2026-12-02T10:00:00Z', // changed date
            end_time: '2026-12-02T12:00:00Z',
            venue_id: 'venue-1',
          },
        ],
      };

      const result = classifyEventChanges(baseEvent, payload, { hasFinancialOrders: true });
      expect(result.changeClass).toBe('CRITICAL');
      expect(result.changes.some((c) => c.field === 'session_sess-1')).toBe(true);
    });

    it('should classify format changes as CRITICAL when financial orders exist', () => {
      const payload = {
        format: 'ONLINE',
      };

      const result = classifyEventChanges(baseEvent, payload, { hasFinancialOrders: true });
      expect(result.changeClass).toBe('CRITICAL');
      expect(result.changes.some((c) => c.field === 'format')).toBe(true);
    });
  });

  describe('Rule 2: Multi-block Sales Status Control (Section 5.3 & 5.5)', () => {
    it('should transition sales_status to PAUSED when a block is added', () => {
      const { updatedBlocks, isChanged, block } = addSalesBlock([], {
        reason: 'ORGANIZER_PAUSE',
        source: 'ORGANIZER',
        createdBy: 'usr-org-1',
      });

      expect(isChanged).toBe(true);
      expect(updatedBlocks).toHaveLength(1);
      expect(block.reason).toBe('ORGANIZER_PAUSE');

      const status = computeSalesStatus({
        status: 'PUBLISHED',
        salesBlocks: updatedBlocks,
      });
      expect(status).toBe('PAUSED');
    });

    it('should remain PAUSED if multiple blocks exist and only one is released', () => {
      let blocks = [];
      const add1 = addSalesBlock(blocks, {
        reason: 'ORGANIZER_PAUSE',
        source: 'ORGANIZER',
      });
      blocks = add1.updatedBlocks;

      const add2 = addSalesBlock(blocks, {
        reason: 'SUSPENDED',
        source: 'ADMIN',
      });
      blocks = add2.updatedBlocks;

      expect(blocks).toHaveLength(2);
      expect(computeSalesStatus({ status: 'PUBLISHED', salesBlocks: blocks })).toBe('PAUSED');

      // Organizer releases ORGANIZER_PAUSE
      const releaseResult = releaseSalesBlock(blocks, {
        reason: 'ORGANIZER_PAUSE',
        releasedBy: 'usr-org-1',
        userRole: 'ORGANIZER',
      });

      expect(releaseResult.isChanged).toBe(true);
      expect(releaseResult.remainingActive).toHaveLength(1);
      expect(releaseResult.remainingActive[0].reason).toBe('SUSPENDED');

      // Must still be PAUSED because SUSPENDED block remains
      expect(computeSalesStatus({ status: 'PUBLISHED', salesBlocks: releaseResult.updatedBlocks })).toBe('PAUSED');
    });

    it('should prevent Organizer from releasing Admin SUSPENDED block', () => {
      const blocks = [
        {
          id: 'b-1',
          reason: 'SUSPENDED',
          source: 'ADMIN',
          created_at: new Date().toISOString(),
          released_at: null,
        },
      ];

      expect(() => {
        releaseSalesBlock(blocks, {
          reason: 'SUSPENDED',
          releasedBy: 'usr-org-1',
          userRole: 'ORGANIZER',
        });
      }).toThrow();
    });

    it('should return to ON_SALE only when all sales blocks are released', () => {
      const blocks = [
        {
          id: 'b-1',
          reason: 'ORGANIZER_PAUSE',
          source: 'ORGANIZER',
          created_at: new Date().toISOString(),
          released_at: null,
        },
      ];

      const releaseResult = releaseSalesBlock(blocks, {
        reason: 'ORGANIZER_PAUSE',
        releasedBy: 'usr-org-1',
        userRole: 'ORGANIZER',
      });

      expect(releaseResult.remainingActive).toHaveLength(0);
      const finalStatus = computeSalesStatus({
        status: 'PUBLISHED',
        salesBlocks: releaseResult.updatedBlocks,
      });
      expect(finalStatus).toBe('ON_SALE');
    });
  });

  describe('Rule 3: Append-Only Immutable Audit Trail (Section 15.10 & G5)', () => {
    it('should append structured audit entries without mutating prior entries', () => {
      const initialTrail = [
        {
          id: 'a-1',
          timestamp: '2026-10-27T10:00:00Z',
          action: 'EVENT_PUBLISHED',
          user_id: 'usr-admin-1',
          role: 'ADMIN',
        },
      ];

      const newTrail = appendAuditTrail(initialTrail, {
        action: 'FORCE_CANCEL_COOLING_OFF_INITIATED',
        userId: 'usr-admin-1',
        role: 'ADMIN',
        reason: 'SLA breach investigation',
        diff: { cooling_off_hours: 24 },
      });

      expect(newTrail).toHaveLength(2);
      expect(newTrail[0].action).toBe('EVENT_PUBLISHED');
      expect(newTrail[1].action).toBe('FORCE_CANCEL_COOLING_OFF_INITIATED');
      expect(newTrail[1].diff.cooling_off_hours).toBe(24);
      expect(newTrail[1].timestamp).toBeDefined();
    });
  });

  describe('Rule 4: Section 4.6 Min Quota Calculation', () => {
    it('should calculate minimum quota summing committed tickets and active holds', () => {
      const minQuota = calculateMinQuota({
        validCount: 30,
        usedCount: 15,
        refundRequestedCount: 5,
        activeHoldCount: 4,
      });

      expect(minQuota).toBe(54);
    });
  });

  describe('Rule 5: Section 8.2 Staff Check-In Error Code Matrix', () => {
    it('should verify check-in error code mapping matches specification', () => {
      expect(ErrorCodes.SESSION_CANCELLED).toBe('SESSION_CANCELLED');
      expect(ErrorCodes.TICKET_REFUND_IN_PROGRESS).toBe('TICKET_REFUND_IN_PROGRESS');
      expect(ErrorCodes.ALREADY_CHECKED_IN).toBe('ALREADY_CHECKED_IN');
      expect(ErrorCodes.TICKET_NOT_VALID).toBe('TICKET_NOT_VALID');
      expect(ErrorCodes.FORBIDDEN_ACTION).toBe('FORBIDDEN_ACTION');
    });
  });
});
