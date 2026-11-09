const { buildUniversalTicketSvg, getBackendLogoDataUrl } = require('./ticketSvgGenerator');

describe('ticketSvgGenerator', () => {
  const mockTicket = {
    id: 'ticket-uuid-001',
    ticket_code: 'EH-17315C26F5',
    status: 'VALID',
    attendee_name: 'Nguyễn Thị Anh Thư',
    seat: { label: 'VIP-01' },
    event: {
      id: 'event-uuid-001',
      title: '[GARDEN ART] - ART WORKSHOP "TERRARIUM CAKE"',
      category: { name: 'WORKSHOP' },
      tagline: 'Khám phá nghệ thuật tạo hình Terrarium Cake tinh tế',
      require_attendee_info: true,
    },
    session: {
      id: 'session-uuid-001',
      start_time: '2026-11-25T14:00:00Z',
      end_time: '2026-11-25T17:00:00Z',
    },
    venue: {
      name: 'Garden Art Studio',
      address_line: 'Lầu 1, 386/17C Lê Văn Sỹ',
      ward: 'Phường 14',
      district: 'Quận 3',
      city: 'Thành Phố Hồ Chí Minh',
    },
    ticket_type: {
      name: 'VIP',
    },
    order: {
      order_code: 'ORD-1793893776749-D71C',
      buyer_name: 'Nguyễn Thị Anh Thư',
    },
  };

  it('generates a valid SVG with 1600x700 viewBox and required sections', () => {
    const svg = buildUniversalTicketSvg(mockTicket, 'data:image/png;base64,mockqr');

    expect(svg).toContain('viewBox="0 0 1600 700"');
    expect(svg).toContain('CONNECT &#183; EXPERIENCE &#183; GROW');
    expect(svg).not.toContain('HỘI THẢO (WORKSHOP)');
    expect(svg).toContain('TERRARIUM CAKE');
    expect(svg).toContain('Khám phá nghệ thuật tạo hình Terrarium Cake tinh tế');
    expect(svg).toContain('VIP-01');
    expect(svg).toContain('Nguyễn Thị Anh Thư');
    expect(svg).toContain('Garden Art Studio');
    expect(svg).toContain('EH-17315C26F5');
    expect(svg).toContain('CHECK-IN');
    expect(svg).toContain('SCAN THIS QR CODE');
    expect(svg).toContain('EVENTHUB');
    expect(svg).toContain('PLEASE PRESENT THIS TICKET AT THE ENTRANCE');
    // Dynamic badge elements
    expect(svg).toContain('id="badgeDynamicBg"');
    expect(svg).toContain('id="badgeRadialGlow"');
    expect(svg).toContain('id="badgeLightSheen"');
    expect(svg).toContain('V&#201; &#272;I&#7878;N T&#7916; (E-TICKET)');
    // Vietnamese priority labels
    expect(svg).toContain('TH&#7900;I GIAN (DATE &amp; TIME)');
    expect(svg).toContain('LO&#7840;I V&#201; (TICKET TYPE)');
    expect(svg).toContain('NG&#431;&#7900;I THAM D&#7920; (ATTENDEE)');
    expect(svg).toContain('GH&#7870; NG&#7891;I (SEAT)');
    expect(svg).toContain('&#272;&#7882;A &#272;I&#7874;M (VENUE)');
  });

  it('handles events without fixed seat by falling back to GENERAL ADMISSION', () => {
    const ticketNoSeat = {
      ...mockTicket,
      seat: null,
    };
    const svg = buildUniversalTicketSvg(ticketNoSeat, 'mockqr');
    expect(svg).toContain('VÉ TỰ DO (GENERAL ADMISSION)');
  });

  it('renders watermark when ticket is cancelled or refunded', () => {
    const cancelledTicket = {
      ...mockTicket,
      status: 'CANCELLED',
    };
    const svg = buildUniversalTicketSvg(cancelledTicket, 'mockqr');
    expect(svg).toContain('VÉ ĐÃ HỦY');
    expect(svg).toContain('CANCELLED');
  });

  it('retrieves backend logo data url when available', () => {
    const logoDataUrl = getBackendLogoDataUrl();
    expect(typeof logoDataUrl).toBe('string');
    expect(logoDataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});
