'use strict';

const aiService = require('./aiAssistant.service');

describe('AI Booking Agent - Edge Cases & Comprehensive Verification', () => {
  const {
    detectEventChangeIntent,
    findMatchingPublishedEvent,
    findMatchingSession,
    extractAttendeesFromText,
    parseQuantityFromText,
    parseTicketsFromText,
    extractPhoneNumber
  } = aiService;

  describe('detectEventChangeIntent', () => {
    test('detects explicit request to change/abandon event without target', () => {
      const phrases = [
        'Tôi muốn đổi sự kiện muốn đặt',
        'Tôi muốn đổi sự kiện',
        'Đổi sang sự kiện khác',
        'chọn sự kiện khác',
        'xem sự kiện khác',
        'tìm sự kiện khác',
        'quay lại chọn sự kiện khác',
        'Quay lại danh sách sự kiện',
        'Không đặt sự kiện này nữa',
        'Tôi không muốn đặt sự kiện này nữa',
        'Hủy đặt sự kiện này',
        'Hủy sự kiện này, cho tôi xem cái khác',
        'Tôi đổi ý rồi',
        'Có sự kiện nào khác không?'
      ];

      phrases.forEach((phrase) => {
        const result = detectEventChangeIntent(phrase);
        expect(result.isChange).toBe(true);
        expect(result.isCancelOnly).toBe(false);
        expect(result.targetQuery).toBe('');
      });
    });

    test('detects request to change to a specific new event', () => {
      const cases = [
        {
          input: 'Đổi sang sự kiện Những Thành Phố Mơ Màng',
          expectedQuery: 'Những Thành Phố Mơ Màng'
        },
        {
          input: 'Tôi muốn đổi sang sự kiện Hoàng Dũng',
          expectedQuery: 'Hoàng Dũng'
        },
        {
          input: 'chuyển sang show Đám Cưới Bến Cồn',
          expectedQuery: 'Đám Cưới Bến Cồn'
        },
        {
          input: 'Đổi sang xem concert Hà Nhi',
          expectedQuery: 'concert Hà Nhi'
        },
        {
          input: 'Đổi sang xem Những Thành Phố Mơ Màng',
          expectedQuery: 'Những Thành Phố Mơ Màng'
        }
      ];

      cases.forEach(({ input, expectedQuery }) => {
        const result = detectEventChangeIntent(input);
        expect(result.isChange).toBe(true);
        expect(result.isCancelOnly).toBe(false);
        expect(result.targetQuery.toLowerCase()).toContain(expectedQuery.toLowerCase());
      });
    });

    test('detects pure cancellation without target', () => {
      const cancelPhrases = [
        'Thôi tôi không đặt vé nữa',
        'Hủy đặt vé',
        'Dừng đặt vé',
        'Thôi không đặt nữa',
        'Tôi không mua nữa đâu',
        'Bỏ qua đặt vé giúp tôi',
        'Không đặt vé này nữa'
      ];

      cancelPhrases.forEach((phrase) => {
        const result = detectEventChangeIntent(phrase);
        expect(result.isChange).toBe(true);
        expect(result.isCancelOnly).toBe(true);
        expect(result.targetQuery).toBe('');
      });
    });

    test('does NOT confuse row/seat adjustments as event change', () => {
      const seatPhrases = [
        'Đổi sang hàng C',
        'Đổi sang hàng D giúp tôi',
        'Chuyển sang dãy E',
        'Đổi ghế khác',
        'Tôi muốn đổi hàng khác',
        'Đổi sang ghế ở giữa',
        'Đổi sang vị trí khác',
        'chọn ghế khác',
        'cho mình đổi chỗ khác'
      ];

      seatPhrases.forEach((phrase) => {
        const result = detectEventChangeIntent(phrase);
        expect(result.isChange).toBe(false);
      });
    });

    test('does NOT confuse ticket tier adjustments as event change', () => {
      const tierPhrases = [
        'Đổi sang vé VIP',
        'Đổi sang 2 vé VIP',
        'Đổi sang 1 vé thường',
        'Chuyển sang 3 vé standard',
        'Đổi sang Standard',
        'Đổi sang vé GA',
        'Chuyển sang vé Early Bird',
        'Đổi sang hạng vé phổ thông',
        'Chuyển sang loại vé thường',
        'Đổi sang hạng vé tiêu chuẩn',
        'Đổi loại vé khác',
        'Đổi sang 3 vé',
        'Đổi thành 2 vé'
      ];

      tierPhrases.forEach((phrase) => {
        const result = detectEventChangeIntent(phrase);
        expect(result.isChange).toBe(false);
      });
    });
  });

  describe('parseQuantityFromText with natural language expressions', () => {
    test('extracts person-based ticket counts ("cho 3 người", "đi 4 người")', () => {
      expect(parseQuantityFromText('mình đặt cho 3 người')).toBe(3);
      expect(parseQuantityFromText('nhóm mình đi 4 người')).toBe(4);
      expect(parseQuantityFromText('đặt vé cho 2 người')).toBe(2);
      expect(parseQuantityFromText('cho hai người')).toBe(2);
      expect(parseQuantityFromText('mình đi 1 người')).toBe(1);
    });

    test('extracts direct quantities and pair words ("1 cặp vé", "2 đôi")', () => {
      expect(parseQuantityFromText('cho mình 1 cặp vé')).toBe(2);
      expect(parseQuantityFromText('2 cặp vé VIP')).toBe(4);
      expect(parseQuantityFromText('đặt 1 đôi vé')).toBe(2);
      expect(parseQuantityFromText('lấy 3 vé')).toBe(3);
      expect(parseQuantityFromText('đặt hai vé')).toBe(2);
    });

    test('handles relative addition ("thêm 1 vé nữa", "mua thêm 2 vé")', () => {
      expect(parseQuantityFromText('thêm 1 vé nữa', 2)).toBe(3);
      expect(parseQuantityFromText('cho mình lấy thêm 2 vé', 1)).toBe(3);
      expect(parseQuantityFromText('thêm một vé nữa', 3)).toBe(4);
    });

    test('handles relative subtraction ("bớt 1 vé", "giảm đi 1 vé")', () => {
      expect(parseQuantityFromText('bớt 1 vé', 3)).toBe(2);
      expect(parseQuantityFromText('bớt một vé', 3)).toBe(2);
      expect(parseQuantityFromText('giảm đi 1 vé', 2)).toBe(1);
      expect(parseQuantityFromText('bỏ bớt 1 vé', 2)).toBe(1);
    });

    test('handles total override expressions ("tổng cộng 4 vé", "đổi thành 5 vé")', () => {
      expect(parseQuantityFromText('tổng cộng là 4 vé')).toBe(4);
      expect(parseQuantityFromText('đổi thành 5 vé nhé', 2)).toBe(5);
      expect(parseQuantityFromText('chuyển thành 3 vé', 1)).toBe(3);
    });
  });

  describe('parseTicketsFromText for compound ticket requests', () => {
    const ticketTypes = [
      { id: 't1', name: 'Vé VIP', price: 500000 },
      { id: 't2', name: 'Vé Standard', price: 250000 },
      { id: 't3', name: 'Khu Vực 1', price: 100000 }
    ];

    test('extracts multi-tier combinations ("2 vé VIP và 1 vé Standard")', () => {
      const result = parseTicketsFromText('cho mình đặt 2 vé VIP và 1 vé Standard', ticketTypes);
      expect(result).toHaveLength(2);

      const vip = result.find(r => r.ticket.id === 't1');
      const standard = result.find(r => r.ticket.id === 't2');

      expect(vip?.quantity).toBe(2);
      expect(standard?.quantity).toBe(1);
    });

    test('extracts ticket by price abbreviation ("2 vé 250k")', () => {
      const result = parseTicketsFromText('lấy 2 vé 250k', ticketTypes);
      expect(result).toHaveLength(1);
      expect(result[0].ticket.id).toBe('t2');
      expect(result[0].quantity).toBe(2);
    });

    test('extracts numbered zone ticket ("1 vé khu 1")', () => {
      const result = parseTicketsFromText('cho mình 1 vé khu 1', ticketTypes);
      expect(result).toHaveLength(1);
      expect(result[0].ticket.id).toBe('t3');
      expect(result[0].quantity).toBe(1);
    });
  });

  describe('extractPhoneNumber with various input formats', () => {
    test('normalizes standard 10-digit mobile numbers', () => {
      expect(extractPhoneNumber('SĐT: 0912345678')).toBe('0912345678');
      expect(extractPhoneNumber('Số điện thoại: 0868123456')).toBe('0868123456');
    });

    test('normalizes international format with +84 and 84', () => {
      expect(extractPhoneNumber('Liên hệ: +84912345678')).toBe('0912345678');
      expect(extractPhoneNumber('SĐT: 84912345678')).toBe('0912345678');
    });

    test('handles dots, dashes, and spaces inside phone number', () => {
      expect(extractPhoneNumber('SĐT là 0912.345.678 nhé')).toBe('0912345678');
      expect(extractPhoneNumber('0912 345 678')).toBe('0912345678');
      expect(extractPhoneNumber('091-234-5678')).toBe('0912345678');
    });
  });

  describe('findMatchingPublishedEvent with diverse queries', () => {
    const mockEvents = [
      { id: '1', title: 'Những Thành Phố Mơ Màng Hà Nội 2026', slug: 'nhung-thanh-pho-mo-mang-ha-noi-2026' },
      { id: '2', title: 'Xoay Tròn Concert Hoàng Dũng', slug: 'xoay-tron-concert-hoang-dung-mrwida3r' },
      { id: '3', title: 'SKQT - Đám Cưới Bến Cồn', slug: 'skqt-am-cuoi-ben-con-mrujlcl1' },
      { id: '4', title: 'Không Gian Trải Nghiệm Porsche Tại Đà Nẵng', slug: 'khong-gian-trai-nghiem-porsche-tai-a-nang-mrucqut0' },
      { id: '5', title: 'Hà Nhi - Người Yêu Cũ Là Tri Kỷ', slug: 'ha-nhi-nguoi-yeu-cu-la-tri-ky-mrxwj3rq' }
    ];

    test('matches artist name and subtitle', () => {
      expect(findMatchingPublishedEvent('Hoàng Dũng', mockEvents)?.id).toBe('2');
      expect(findMatchingPublishedEvent('sự kiện Hoàng Dũng', mockEvents)?.id).toBe('2');
      expect(findMatchingPublishedEvent('Hà Nhi', mockEvents)?.id).toBe('5');
      expect(findMatchingPublishedEvent('Porsche', mockEvents)?.id).toBe('4');
      expect(findMatchingPublishedEvent('Đám Cưới Bến Cồn', mockEvents)?.id).toBe('3');
      expect(findMatchingPublishedEvent('Những Thành Phố Mơ Màng', mockEvents)?.id).toBe('1');
    });

    test('does NOT match generic category terms as specific event', () => {
      expect(findMatchingPublishedEvent('ca nhạc', mockEvents)).toBeNull();
      expect(findMatchingPublishedEvent('kịch nói', mockEvents)).toBeNull();
      expect(findMatchingPublishedEvent('workshop', mockEvents)).toBeNull();
      expect(findMatchingPublishedEvent('hội thảo', mockEvents)).toBeNull();
      expect(findMatchingPublishedEvent('sân khấu', mockEvents)).toBeNull();
      expect(findMatchingPublishedEvent('các sự kiện âm nhạc', mockEvents)).toBeNull();
      expect(findMatchingPublishedEvent('tìm show ca nhạc', mockEvents)).toBeNull();
      expect(findMatchingPublishedEvent('gợi ý sự kiện kịch nói', mockEvents)).toBeNull();
      expect(findMatchingPublishedEvent('sự kiện ca nhạc sắp tới', mockEvents)).toBeNull();
    });
  });

  describe('findMatchingSession in multi-session events', () => {
    const mockSessions = [
      {
        id: 'sess-1',
        session_name: 'Suất Tối Thứ Bảy - Khai Mạc',
        start_time: '2026-11-21T19:00:00Z' // Saturday
      },
      {
        id: 'sess-2',
        session_name: 'Suất Tối Chủ Nhật - Bế Mạc',
        start_time: '2026-11-22T19:00:00Z' // Sunday
      },
      {
        id: 'sess-3',
        session_name: 'Đêm Gala Đặc Biệt',
        start_time: '2026-11-28T20:00:00Z'
      }
    ];

    test('matches session by ordinal ("suất 1", "suất 2", "suất cuối")', () => {
      expect(findMatchingSession('Đặt 2 vé suất 1', mockSessions)?.id).toBe('sess-1');
      expect(findMatchingSession('Tôi muốn đi suất 2', mockSessions)?.id).toBe('sess-2');
      expect(findMatchingSession('Cho mình suất cuối', mockSessions)?.id).toBe('sess-3');
    });

    test('matches session by date ("ngày 22/11", "21-11")', () => {
      expect(findMatchingSession('Đặt vé ngày 21/11', mockSessions)?.id).toBe('sess-1');
      expect(findMatchingSession('suất 22-11', mockSessions)?.id).toBe('sess-2');
      expect(findMatchingSession('ngày 28 tháng 11', mockSessions)?.id).toBe('sess-3');
    });

    test('matches session by day of week ("thứ bảy", "chủ nhật")', () => {
      expect(findMatchingSession('Tôi muốn xem suất tối thứ 7', mockSessions)?.id).toBe('sess-1');
      expect(findMatchingSession('Đặt vé tối chủ nhật', mockSessions)?.id).toBe('sess-2');
    });

    test('matches session by keyword in session name ("Gala")', () => {
      expect(findMatchingSession('Tôi muốn xem đêm gala', mockSessions)?.id).toBe('sess-3');
    });

    test('defaults to first session if unspecified', () => {
      expect(findMatchingSession('Đặt 2 vé VIP', mockSessions)?.id).toBe('sess-1');
    });
  });

  describe('extractAttendeesFromText with edge case formats', () => {
    const mockUserProfile = {
      full_name: 'Nguyễn Hoàng Nam',
      email: 'nam.nh@gmail.com',
      phone: '0901234567'
    };

    test('extracts attendee with phone number in line without discarding name', () => {
      const text = '1. Trần Văn Bình - 0912345678 - binh.tv@gmail.com\n2. Lê Thị Mai - mai.lt@gmail.com - 0987654321';
      const attendees = extractAttendeesFromText(text, mockUserProfile);

      expect(attendees).toHaveLength(2);
      expect(attendees[0].name).toBe('Trần Văn Bình');
      expect(attendees[0].email).toBe('binh.tv@gmail.com');
      expect(attendees[0].phone).toBe('0912345678');

      expect(attendees[1].name).toBe('Lê Thị Mai');
      expect(attendees[1].email).toBe('mai.lt@gmail.com');
      expect(attendees[1].phone).toBe('0987654321');
    });

    test('extracts multi-line attendee blocks with SĐT on adjacent line', () => {
      const text = `Họ tên: Trần Hải Đăng
Email: dang.th@gmail.com
SĐT: 0912345678`;

      const attendees = extractAttendeesFromText(text, mockUserProfile);
      expect(attendees).toHaveLength(1);
      expect(attendees[0].name).toBe('Trần Hải Đăng');
      expect(attendees[0].email).toBe('dang.th@gmail.com');
      expect(attendees[0].phone).toBe('0912345678');
    });

    test('extracts user profile info when user requests "dùng thông tin của tôi"', () => {
      const text = 'Lấy thông tin của tôi nhé';
      const attendees = extractAttendeesFromText(text, mockUserProfile);

      expect(attendees).toHaveLength(1);
      expect(attendees[0].name).toBe(mockUserProfile.full_name);
      expect(attendees[0].email).toBe(mockUserProfile.email);
    });

    test('extracts standalone names paired with declared shared email', () => {
      const text = `Tôi đi 2 người:
- Vũ Hoàng Long
- Đặng Thu Hà
Email chung cho cả 2: long.vh@gmail.com`;

      const attendees = extractAttendeesFromText(text, mockUserProfile);
      expect(attendees).toHaveLength(2);
      expect(attendees[0].name).toBe('Vũ Hoàng Long');
      expect(attendees[0].email).toBe('long.vh@gmail.com');
      expect(attendees[1].name).toBe('Đặng Thu Hà');
      expect(attendees[1].email).toBe('long.vh@gmail.com');
    });
  });
});
