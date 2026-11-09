const mockSendEmail = jest.fn();

jest.mock('../../infrastructure/email/email.service', () => ({
  sendEmail: mockSendEmail,
}));
jest.mock('../../core/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock('../../config/env', () => ({ CLIENT_URL: 'https://eventhub.test' }));

const ticketConfirmationEmail = require('./ticketConfirmationEmail.service');

function createOrder() {
  return {
    id: 'order-1',
    order_code: 'ORD-001',
    buyer_name: 'Buyer',
    buyer_email: 'buyer@example.com',
    event_title: 'Large event',
    total_amount: 1300000,
  };
}

function createTickets(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `ticket-${index + 1}`,
    ticket_code: `TICKET-${index + 1}`,
    qr_code: `QR-${index + 1}`,
    event_id: 'event-1',
    event_session_id: 'session-1',
    ticket_type_name: 'Standard',
  }));
}

describe('ticketConfirmationEmail', () => {
  beforeEach(() => {
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ accepted: ['buyer@example.com'] });
  });

  it('keeps a small order in one email', async () => {
    await expect(ticketConfirmationEmail.sendOrderConfirmation(createOrder(), createTickets(2))).resolves.toBe(true);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0].subject).not.toContain('Phần');
  });

  it('splits a large order into emails of at most six tickets', async () => {
    await expect(ticketConfirmationEmail.sendOrderConfirmation(createOrder(), createTickets(13))).resolves.toBe(true);

    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockSendEmail.mock.calls.map(([mail]) => mail.subject)).toEqual([
      expect.stringContaining('Phần 1/3'),
      expect.stringContaining('Phần 2/3'),
      expect.stringContaining('Phần 3/3'),
    ]);
    expect(mockSendEmail.mock.calls.map(([mail]) => (mail.html.match(/Qu&#233;t &#273;&#7875; check-in/g) || []).length)).toEqual([6, 6, 1]);
  });

  it('reports an incomplete delivery when any email part fails', async () => {
    mockSendEmail.mockResolvedValueOnce({ accepted: ['buyer@example.com'] });
    mockSendEmail.mockRejectedValueOnce(new Error('SMTP timeout'));

    await expect(ticketConfirmationEmail.sendOrderConfirmation(createOrder(), createTickets(7))).resolves.toBe(false);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it('sends separate e-ticket emails to attendees without order info', async () => {
    const order = createOrder();
    const tickets = [
      {
        id: 't-1',
        ticket_code: 'TC-1',
        qr_code: 'QR-1',
        attendee_name: 'Nguyen Van B',
        attendee_email: 'attendee_b@example.com',
        ticket_type_name: 'VIP',
      },
      {
        id: 't-2',
        ticket_code: 'TC-2',
        qr_code: 'QR-2',
        attendee_name: 'Tran Thi C',
        attendee_email: 'buyer@example.com', // same as buyer
        ticket_type_name: 'Standard',
      },
    ];

    await expect(ticketConfirmationEmail.sendOrderConfirmation(order, tickets)).resolves.toBe(true);

    // Call 1: to buyer with order info
    // Call 2: to attendee_b without order info
    expect(mockSendEmail).toHaveBeenCalledTimes(2);

    const buyerCall = mockSendEmail.mock.calls.find(([call]) => call.email === 'buyer@example.com');
    const attendeeCall = mockSendEmail.mock.calls.find(([call]) => call.email === 'attendee_b@example.com');

    expect(buyerCall).toBeDefined();
    expect(buyerCall[0].html).toContain(order.order_code);
    expect(buyerCall[0].html).toContain('Tổng thanh toán');

    expect(attendeeCall).toBeDefined();
    expect(attendeeCall[0].subject).toContain('Vé tham dự sự kiện');
    expect(attendeeCall[0].html).toContain('TC-1');
    expect(attendeeCall[0].html).toContain('Nguyen Van B');
    expect(attendeeCall[0].html).not.toContain(order.order_code);
    expect(attendeeCall[0].html).not.toContain('Tổng thanh toán');
    expect(attendeeCall[0].html).not.toContain('Thanh to&#225;n th&#224;nh c&#244;ng');
  });

  it('generates 100% clean English emails when order locale is en', async () => {
    const order = {
      ...createOrder(),
      locale: 'en',
    };
    const tickets = [
      {
        id: 'ticket-en-1',
        ticket_code: 'TC-EN-1',
        qr_code: 'QR-EN-1',
        attendee_name: 'John Doe',
        attendee_email: 'john@example.com',
        ticket_type_name: 'VIP Experience',
        seat_label: 'A1-01',
      },
    ];

    await expect(ticketConfirmationEmail.sendOrderConfirmation(order, tickets)).resolves.toBe(true);

    const buyerCall = mockSendEmail.mock.calls.find(([call]) => call.email === 'buyer@example.com');
    const attendeeCall = mockSendEmail.mock.calls.find(([call]) => call.email === 'john@example.com');

    expect(buyerCall).toBeDefined();
    expect(buyerCall[0].subject).toContain('EventHub Ticket - Large event (ORD-001)');
    expect(buyerCall[0].html).toContain('lang="en"');
    expect(buyerCall[0].html).toContain('Payment Successful!');
    expect(buyerCall[0].html).toContain('ORDER DETAILS');
    expect(buyerCall[0].html).toContain('Order code');
    expect(buyerCall[0].html).toContain('Total payment');
    expect(buyerCall[0].html).toContain('YOUR TICKETS');
    expect(buyerCall[0].html).toContain('CHECK-IN INSTRUCTIONS');
    expect(buyerCall[0].html).toContain('VIEW MY TICKETS');
    expect(buyerCall[0].html).toContain('ATTENDEE');
    expect(buyerCall[0].html).toContain('TICKET TYPE');
    expect(buyerCall[0].html).toContain('SEAT');

    // Strict assertions: no Vietnamese in English email
    expect(buyerCall[0].html).not.toContain('Thanh toán thành công');
    expect(buyerCall[0].html).not.toContain('CHI TIẾT ĐƠN HÀNG');
    expect(buyerCall[0].html).not.toContain('Mã đơn hàng');
    expect(buyerCall[0].html).not.toContain('Tổng thanh toán');
    expect(buyerCall[0].html).not.toContain('VÉ CỦA BẠN');
    expect(buyerCall[0].html).not.toContain('HƯỚNG DẪN CHECK-IN');
    expect(buyerCall[0].html).not.toContain('XEM VÉ CỦA TÔI');
    expect(buyerCall[0].html).not.toContain('NGƯỜI THAM DỰ');
    expect(buyerCall[0].html).not.toContain('LOẠI VÉ');

    expect(attendeeCall).toBeDefined();
    expect(attendeeCall[0].subject).toContain('Event Admission Ticket - Large event');
    expect(attendeeCall[0].html).toContain('lang="en"');
    expect(attendeeCall[0].html).toContain('Event Admission Ticket');
    expect(attendeeCall[0].html).toContain('YOUR TICKETS');
    expect(attendeeCall[0].html).not.toContain('Vé tham dự sự kiện');
    expect(attendeeCall[0].html).not.toContain('VÉ CỦA BẠN');
  });
});