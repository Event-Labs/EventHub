// backend/tests/unit/smartBooking.quantityAdjustment.test.js
const seatAllocationService = require('../../src/modules/events/seatAllocation.service');
const aiAssistantService = require('../../src/modules/ai/aiAssistant.service');
const eventsService = require('../../src/modules/events/events.service');

describe('Smart Booking Quantity Adjustment & Tier Fallback', () => {
  const mockAcousticDetail = {
    id: 'b2b03f0d-9f36-4100-a31e-4fc3cd836355',
    slug: 'vietnam-acoustic-nights-2029-mwm6rtxs',
    title: 'Vietnam Acoustic Nights 2029',
    sessions: [
      {
        id: 'sess-acoustic-1',
        session_name: 'Session 1 — Acoustic Opening Night',
        seat_map_id: 'seat-map-acoustic-1'
      }
    ],
    ticket_types: [
      { id: 'tt-std-pass', name: 'Standard Pass', price: 50000, is_seated: false, available_quantity: 100 },
      { id: 'tt-vip-zone', name: 'Khu vực VIP', price: 50000, is_seated: true, available_quantity: 100 },
      { id: 'tt-gold-zone', name: 'Khu vực Hạng A (Gold)', price: 100000, is_seated: true, available_quantity: 100 }
    ],
    seating_rules: {
      max_tickets_per_order: 10,
      require_adjacent_seats: true,
      require_same_row: true,
      disallow_single_seat_left: true
    }
  };

  // Generate 20 seats on row A for Khu vực VIP
  const mockSeats = Array.from({ length: 20 }, (_, i) => ({
    id: `seat-a-${i + 1}`,
    session_seat_id: `ss-a-${i + 1}`,
    label: `A${i + 1}`,
    row_label: 'A',
    seat_number: i + 1,
    status: 'AVAILABLE',
    ticket_type_ids: ['tt-vip-zone'],
    ticket_type_id: 'tt-vip-zone',
    price: 50000
  }));

  beforeAll(() => {
    jest.spyOn(eventsService, 'getPublicEventDetail').mockResolvedValue(mockAcousticDetail);
    jest.spyOn(eventsService, 'getSessionSeats').mockResolvedValue({ seats: mockSeats });
    jest.spyOn(eventsService, 'holdSeats').mockResolvedValue({
      success: true,
      hold_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
    jest.spyOn(eventsService, 'releaseSeatHolds').mockResolvedValue({ success: true });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('proposeSmartBooking: preserves previous ticket_type_id when user adds tickets ("thêm 1 vé nữa")', async () => {
    // Initial proposal: user booked 3 seats in Khu vuc VIP (row A)
    const initialProposal = {
      eventId: mockAcousticDetail.id,
      eventSlug: mockAcousticDetail.slug,
      eventTitle: mockAcousticDetail.title,
      ticket_type_id: 'tt-vip-zone',
      ticketTypeName: 'Khu vực VIP',
      quantity: 3,
      seats: [
        { id: 'seat-a-13', label: 'A13', row_label: 'A', seat_number: 13, price: 50000 },
        { id: 'seat-a-14', label: 'A14', row_label: 'A', seat_number: 14, price: 50000 },
        { id: 'seat-a-15', label: 'A15', row_label: 'A', seat_number: 15, price: 50000 }
      ],
      session: { id: 'sess-acoustic-1' }
    };

    const history = [
      { role: 'user', content: 'đặt giúp tôi 3 vé acoustic khu vip hàng A' },
      {
        role: 'assistant',
        content: `Đề xuất của bạn:\n[ACTION:BOOKING_PROPOSAL:${encodeURIComponent(JSON.stringify(initialProposal))}]`
      }
    ];

    const context = {
      message: 'thêm 1 vé nữa',
      history,
      activeEvent: mockAcousticDetail,
      lastGeneratedActionTag: null
    };

    // LLM calls proposeSmartBooking with eventId and quantity: 1 (or 4)
    const result = await aiAssistantService.executeTool(
      'user-1',
      'proposeSmartBooking',
      {
        eventId: mockAcousticDetail.slug,
        quantity: 1 // LLM might send 1 from "1 vé nữa", tool should calculate 3 + 1 = 4
      },
      context
    );

    expect(result.status).toBe('SUCCESS');
    expect(result.proposal).toBeDefined();
    expect(result.proposal.seats).toBe('A9, A10, A11, A12');
    expect(result.proposal.totalAmount).toBe(200000);

    expect(context.lastGeneratedActionTag).toContain('[ACTION:BOOKING_PROPOSAL:');
    const tagMatch = context.lastGeneratedActionTag.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/i);
    expect(tagMatch).not.toBeNull();
    const proposalData = JSON.parse(decodeURIComponent(tagMatch[1]));
    expect(proposalData.quantity).toBe(4);
    expect(proposalData.ticket_type_id).toBe('tt-vip-zone');
    expect(proposalData.ticketTypeName).toBe('Khu vực VIP');
    expect(proposalData.seats).toHaveLength(4);
    expect(proposalData.seats.map(s => s.label)).toEqual(['A9', 'A10', 'A11', 'A12']);
  });

  test('allocateSeats: does not fail with 0 available seats when unseated ticketTypeId is passed to seated event', () => {
    // If somehow unseated ticket id was passed, allocateSeats falls back to the seated tier instead of returning 0 seats
    const allocResult = seatAllocationService.allocateSeats(
      mockSeats,
      mockAcousticDetail.seating_rules,
      mockAcousticDetail.ticket_types,
      {
        quantity: 4,
        preferredRow: 'A',
        ticketTypeId: 'tt-std-pass' // unseated tier!
      }
    );

    expect(allocResult.success).toBe(true);
    expect(allocResult.seats).toHaveLength(4);
    expect(allocResult.seats.map(s => s.label)).toEqual(['A9', 'A10', 'A11', 'A12']);
  });
});
