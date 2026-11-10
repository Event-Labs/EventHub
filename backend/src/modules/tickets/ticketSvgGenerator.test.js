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

  it('generates a valid SVG with 1600x700 viewBox and required sections in Vietnamese by default', () => {
    const svg = buildUniversalTicketSvg(mockTicket, 'data:image/png;base64,mockqr');

    expect(svg).toContain('viewBox="0 0 1600 700"');
    expect(svg).toContain('CONNECT &#183; EXPERIENCE &#183; GROW');
    expect(svg).toContain('TERRARIUM CAKE');
    expect(svg).toContain('Khám phá nghệ thuật tạo hình Terrarium Cake tinh tế');
    expect(svg).toContain('VIP-01');
    expect(svg).toContain('Nguyễn Thị Anh Thư');
    expect(svg).toContain('Garden Art Studio');
    expect(svg).toContain('EH-17315C26F5');
    expect(svg).toContain('CHECK-IN');
    expect(svg).toContain('QUÉT MÃ QR');
    expect(svg).toContain('EVENTHUB');
    expect(svg).toContain('VUI LÒNG XUẤT TRÌNH VÉ TẠI CỔNG VÀO');
    // Dynamic badge elements
    expect(svg).toContain('id="badgeDynamicBg"');
    expect(svg).toContain('id="badgeRadialGlow"');
    expect(svg).toContain('id="badgeLightSheen"');
    expect(svg).toContain('VÉ ĐIỆN TỬ');
    // Vietnamese priority labels
    expect(svg).toContain('THỜI GIAN');
    expect(svg).toContain('LOẠI VÉ');
    expect(svg).toContain('NGƯỜI THAM DỰ');
    expect(svg).toContain('GHẾ NGỒI');
    expect(svg).toContain('ĐỊA ĐIỂM');
  });

  it('generates a 100% clean English SVG when locale is en', () => {
    const svg = buildUniversalTicketSvg(mockTicket, 'data:image/png;base64,mockqr', '', { locale: 'en' });

    expect(svg).toContain('E-TICKET');
    expect(svg).toContain('ATTENDEE');
    expect(svg).toContain('TICKET TYPE');
    expect(svg).toContain('SEAT');
    expect(svg).toContain('DATE &amp; TIME');
    expect(svg).toContain('VENUE');
    expect(svg).toContain('PLEASE PRESENT THIS TICKET AT THE ENTRANCE');
    expect(svg).toContain('SCAN THIS QR CODE');
    expect(svg).not.toContain('VÉ ĐIỆN TỬ');
    expect(svg).not.toContain('NGƯỜI THAM DỰ');
  });

  it('handles events without fixed seat by falling back to General Admission / Vé tự do based on locale', () => {
    const ticketNoSeat = {
      ...mockTicket,
      seat: null,
    };
    const svgVi = buildUniversalTicketSvg(ticketNoSeat, 'mockqr');
    expect(svgVi).toContain('VÉ TỰ DO');

    const svgEn = buildUniversalTicketSvg(ticketNoSeat, 'mockqr', '', { locale: 'en' });
    expect(svgEn).toContain('GENERAL ADMISSION');
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
