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
        'Không đặt vé này nữa',
        'thui k đặt nữa đâu nhen',
        'thôi khỏi đặt nữa nè',
        'thôi dẹp đi',
        'bỏ đi bạn',
        'thôi khỏi mua nữa',
        'thoi khong dat nua',
        'huy dat ve nay',
        'cancel giúp em nhé sóp',
        'thôi hủy kèo nha',
        'bùng kèo rồi fen',
        'thôi khỏi mua nữa nha shop',
        'k đặt nữa đâu ạ'
      ];

      cancelPhrases.forEach((phrase) => {
        const result = detectEventChangeIntent(phrase);
        expect(result.isChange).toBe(true);
        expect(result.isCancelOnly).toBe(true);
        expect(result.targetQuery).toBe('');
      });
    });

    test('detects change event across informal, colloquial, and teen-code phrasing', () => {
      const informalChangePhrases = [
        'đổi qua show khác ik',
        'chuyển qua sự kiện khác nha',
        'xem show khác đi',
        'đổi qua sự kiện khác đi em',
        'doi sang su kien khac',
        'Đổi qua tuồng khác giùm tui nghen',
        'Đổi qua vở khác đi bạn',
        'Cho xem ca nhạc khác ik'
      ];

      informalChangePhrases.forEach((phrase) => {
        const result = detectEventChangeIntent(phrase);
        expect(result.isChange).toBe(true);
        expect(result.isCancelOnly).toBe(false);
      });
    });

    test('does NOT confuse row/seat adjustments as event change across colloquial phrasing', () => {
      const seatPhrases = [
        'Đổi sang hàng C',
        'Đổi sang hàng D giúp tôi',
        'Chuyển sang dãy E',
        'Đổi ghế khác',
        'Tôi muốn đổi hàng khác',
        'Đổi sang ghế ở giữa',
        'Đổi sang vị trí khác',
        'chọn ghế khác',
        'cho mình đổi chỗ khác',
        'hàng này hơi xa, đổi lên hàng B nha',
        'đổi sang hàng ghế giữa giùm tui nha sóp',
        'hơi đắt, đổi sang vé rẻ hơn đi',
        'đổi sang vé rẻ hơn',
        'đổi sang 2 vé thường',
        'Hủy ghế A1 chọn lại ghế A3',
        'Hủy bớt 1 vé giúp mình',
        'Bớt 1 vé đi shop',
        'Giảm xuống 2 vé thôi'
      ];

      seatPhrases.forEach((phrase) => {
        const result = detectEventChangeIntent(phrase);
        expect(result.isChange).toBe(false);
      });
    });

    test('does NOT confuse in-event session/time adjustments as event change', () => {
      const sessionPhrases = [
        'Đổi sang suất 2',
        'Đổi sang suất tối mai',
        'Chuyển sang ca chiều',
        'Đổi sang ngày 22/11',
        'chuyển sang suất chiếu khác',
        'cho mình đổi qua khung giờ khác'
      ];

      sessionPhrases.forEach((phrase) => {
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

    test('extracts Gen Z / Teen code phrasing ("cho 2 slot", "nhóm 3 đứa")', () => {
      expect(parseQuantityFromText('cho 2 slot nha sóp')).toBe(2);
      expect(parseQuantityFromText('book t 2 slot')).toBe(2);
      expect(parseQuantityFromText('nhóm 3 đứa')).toBe(3);
      expect(parseQuantityFromText('2 đứa tui đi chung')).toBe(2);
      expect(parseQuantityFromText('mình đi 2 bạn')).toBe(2);
      expect(parseQuantityFromText('cho 3 bạn mình')).toBe(3);
      expect(parseQuantityFromText('bồ ơi đặt tui 2 vé vip vs')).toBe(2);
      expect(parseQuantityFromText('đổi thành 3 vé dùm nha fen')).toBe(3);
      expect(parseQuantityFromText('chấm cho mik 2 slot')).toBe(2);
      expect(parseQuantityFromText('chấm cho em 3')).toBe(3);
      expect(parseQuantityFromText('nhóm mình đi 4 mạng')).toBe(4);
      expect(parseQuantityFromText('cho 2 phần vé nha')).toBe(2);
      expect(parseQuantityFromText('book hộ tui 2')).toBe(2);
      expect(parseQuantityFromText('đặt giùm em 3')).toBe(3);
    });

    test('extracts Southern and regional dialect expressions', () => {
      expect(parseQuantityFromText('đặt giùm tui 2 vé nghen')).toBe(2);
      expect(parseQuantityFromText('lấy cho tui 1 cặp vé coi')).toBe(2);
      expect(parseQuantityFromText('lấy cho 2 đôi vé')).toBe(4);
      expect(parseQuantityFromText('nhóm tui đi 3 đứa lận')).toBe(3);
      expect(parseQuantityFromText('tui với con bạn đi 2 đứa')).toBe(2);
      expect(parseQuantityFromText('thêm cho tui một vé nữa', 2)).toBe(3);
      expect(parseQuantityFromText('choa đi 3 người')).toBe(3);
    });

    test('extracts polite and formal phrasing', () => {
      expect(parseQuantityFromText('Dạ chào bạn, nhờ bạn đặt giúp mình 2 vé tham dự sự kiện này với nhé')).toBe(2);
      expect(parseQuantityFromText('Xin bạn hỗ trợ đặt 3 vé giúp tôi')).toBe(3);
    });

    test('extracts unaccented (không dấu) phrasing', () => {
      expect(parseQuantityFromText('dat ho 2 ve')).toBe(2);
      expect(parseQuantityFromText('cho 3 nguoi')).toBe(3);
      expect(parseQuantityFromText('nhom 4 dua')).toBe(4);
      expect(parseQuantityFromText('cho 2 slot nha')).toBe(2);
      expect(parseQuantityFromText('them 1 ve nua', 2)).toBe(3);
      expect(parseQuantityFromText('bot 1 ve di', 3)).toBe(2);
      expect(parseQuantityFromText('tong cong 4 ve')).toBe(4);
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
      expect(parseQuantityFromText('thêm 1 slot nữa cho con bạn tui', 2)).toBe(3);
    });

    test('handles relative subtraction ("bớt 1 vé", "giảm đi 1 vé")', () => {
      expect(parseQuantityFromText('bớt 1 vé', 3)).toBe(2);
      expect(parseQuantityFromText('bớt một vé', 3)).toBe(2);
      expect(parseQuantityFromText('giảm đi 1 vé', 2)).toBe(1);
      expect(parseQuantityFromText('bỏ bớt 1 vé', 2)).toBe(1);
      expect(parseQuantityFromText('bớt 1 slot đi', 3)).toBe(2);
      expect(parseQuantityFromText('giảm bớt 1 mạng', 4)).toBe(3);
    });

    test('handles total override expressions ("tổng cộng 4 vé", "đổi thành 5 vé")', () => {
      expect(parseQuantityFromText('tổng cộng là 4 vé')).toBe(4);
      expect(parseQuantityFromText('đổi thành 5 vé nhé', 2)).toBe(5);
      expect(parseQuantityFromText('chuyển thành 3 vé', 1)).toBe(3);
      expect(parseQuantityFromText('tổng cộng 4 slot nha sóp')).toBe(4);
      expect(parseQuantityFromText('chuyển thành 2 phần vé')).toBe(2);
      expect(parseQuantityFromText('đổi thành 3 mạng')).toBe(3);
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

    test('extracts pairs with multiplier ("2 cặp vé VIP", "3 cặp vé khu 1")', () => {
      const resVip = parseTicketsFromText('cho mình 2 cặp vé VIP', ticketTypes);
      expect(resVip).toHaveLength(1);
      expect(resVip[0].ticket.id).toBe('t1');
      expect(resVip[0].quantity).toBe(4);

      const resStd = parseTicketsFromText('lấy 1 đôi vé Standard', ticketTypes);
      expect(resStd).toHaveLength(1);
      expect(resStd[0].ticket.id).toBe('t2');
      expect(resStd[0].quantity).toBe(2);

      const resZone = parseTicketsFromText('đặt 3 cặp vé khu 1', ticketTypes);
      expect(resZone).toHaveLength(1);
      expect(resZone[0].ticket.id).toBe('t3');
      expect(resZone[0].quantity).toBe(6);
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
      expect(extractPhoneNumber('SĐT: (+84) 912 345 678')).toBe('0912345678');
      expect(extractPhoneNumber('tel: (+84)0912345678')).toBe('0912345678');
      expect(extractPhoneNumber('(84) 987.654.321')).toBe('0987654321');
    });

    test('handles dots, dashes, and spaces inside phone number', () => {
      expect(extractPhoneNumber('SĐT là 0912.345.678 nhé')).toBe('0912345678');
      expect(extractPhoneNumber('0912 345 678')).toBe('0912345678');
      expect(extractPhoneNumber('091-234-5678')).toBe('0912345678');
      expect(extractPhoneNumber('(0912) 345 678')).toBe('0912345678');
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
        start_time: '2026-11-21T19:00:00Z' // Saturday evening
      },
      {
        id: 'sess-2',
        session_name: 'Suất Tối Chủ Nhật - Bế Mạc',
        start_time: '2026-11-22T19:00:00Z' // Sunday evening
      },
      {
        id: 'sess-3',
        session_name: 'Đêm Gala Đặc Biệt',
        start_time: '2026-11-28T20:00:00Z'
      },
      {
        id: 'sess-4',
        session_name: 'Suất Chiều Thứ Sáu',
        start_time: '2026-11-20T14:00:00Z' // Friday afternoon
      }
    ];

    test('matches session by ordinal ("suất 1", "suất 2", "suất cuối")', () => {
      expect(findMatchingSession('Đặt 2 vé suất 1', mockSessions)?.id).toBe('sess-1');
      expect(findMatchingSession('Tôi muốn đi suất 2', mockSessions)?.id).toBe('sess-2');
      expect(findMatchingSession('Cho mình suất cuối', mockSessions)?.id).toBe('sess-4');
    });

    test('matches session by date ("ngày 22/11", "21-11")', () => {
      expect(findMatchingSession('Đặt vé ngày 21/11', mockSessions)?.id).toBe('sess-1');
      expect(findMatchingSession('suất 22-11', mockSessions)?.id).toBe('sess-2');
      expect(findMatchingSession('ngày 28 tháng 11', mockSessions)?.id).toBe('sess-3');
    });

    test('matches session by day of week ("thứ bảy", "chủ nhật")', () => {
      expect(findMatchingSession('Tôi muốn xem suất tối thứ 7', mockSessions)?.id).toBe('sess-1');
      expect(findMatchingSession('Đặt vé tối chủ nhật', mockSessions)?.id).toBe('sess-2');
      expect(findMatchingSession('Xem chiều thứ 6 nha', mockSessions)?.id).toBe('sess-4');
    });

    test('matches session by weekend or time-of-day keywords', () => {
      expect(findMatchingSession('Cho mình xem vào cuối tuần', mockSessions)?.id).toBe('sess-1');
      expect(findMatchingSession('Đặt suất chiều', mockSessions)?.id).toBe('sess-4');
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

    test('extracts attendee with informal and teen-code prefix ("info nè sóp: ...")', () => {
      const text = 'info nè sóp: Nguyễn Gia Huy - giahuy@gmail.com - 0938112233';
      const attendees = extractAttendeesFromText(text, mockUserProfile);

      expect(attendees).toHaveLength(1);
      expect(attendees[0].name).toBe('Nguyễn Gia Huy');
      expect(attendees[0].email).toBe('giahuy@gmail.com');
      expect(attendees[0].phone).toBe('0938112233');
    });

    test('extracts attendee from multi-line block with Zalo phone label', () => {
      const text = `tt người đi nha:
Nguyễn Văn An
an.nv@gmail.com
Zalo: 0912345678`;

      const attendees = extractAttendeesFromText(text, mockUserProfile);
      expect(attendees).toHaveLength(1);
      expect(attendees[0].name).toBe('Nguyễn Văn An');
      expect(attendees[0].email).toBe('an.nv@gmail.com');
      expect(attendees[0].phone).toBe('0912345678');
    });

    test('ignores colloquial group headers ("2 đứa tui nè:") as names', () => {
      const text = `2 đứa tui nè:
- Tran Thi B
- Le Van C
Mail chung: b_and_c@gmail.com`;

      const attendees = extractAttendeesFromText(text, mockUserProfile);
      expect(attendees).toHaveLength(2);
      expect(attendees[0].name).toBe('Tran Thi B');
      expect(attendees[0].email).toBe('b_and_c@gmail.com');
      expect(attendees[1].name).toBe('Le Van C');
      expect(attendees[1].email).toBe('b_and_c@gmail.com');
    });

    test('extracts unaccented attendee details', () => {
      const text = `1. Nguyen Hoang Nam - nam.nh@gmail.com - 0901234567
2. Le Thi Mai - mai.lt@gmail.com - 0987654321`;

      const attendees = extractAttendeesFromText(text, mockUserProfile);
      expect(attendees).toHaveLength(2);
      expect(attendees[0].name).toBe('Nguyen Hoang Nam');
      expect(attendees[0].email).toBe('nam.nh@gmail.com');
      expect(attendees[0].phone).toBe('0901234567');

      expect(attendees[1].name).toBe('Le Thi Mai');
      expect(attendees[1].email).toBe('mai.lt@gmail.com');
      expect(attendees[1].phone).toBe('0987654321');
    });

    test('handles colloquial self-booking phrasing ("mình tự đi một mình à nha", "cho chính tui thôi")', () => {
      const text1 = 'mình tự đi một mình à nha';
      expect(extractAttendeesFromText(text1, mockUserProfile)[0]?.name).toBe(mockUserProfile.full_name);

      const text2 = 'cho chính tui thôi';
      expect(extractAttendeesFromText(text2, mockUserProfile)[0]?.name).toBe(mockUserProfile.full_name);

      const text3 = 'tui đi một mình ên à';
      expect(extractAttendeesFromText(text3, mockUserProfile)[0]?.name).toBe(mockUserProfile.full_name);

      const text4 = 'lấy info của tui luôn đi';
      expect(extractAttendeesFromText(text4, mockUserProfile)[0]?.name).toBe(mockUserProfile.full_name);

      const text5 = 'thông tin như cũ nha sóp';
      expect(extractAttendeesFromText(text5, mockUserProfile)[0]?.name).toBe(mockUserProfile.full_name);

      const text6 = 'cho chính em thôi';
      expect(extractAttendeesFromText(text6, mockUserProfile)[0]?.name).toBe(mockUserProfile.full_name);

      const text7 = 'tự đi 1 mình nhé';
      expect(extractAttendeesFromText(text7, mockUserProfile)[0]?.name).toBe(mockUserProfile.full_name);
    });

    test('strips courtesy titles (Anh, Chị, Em, Bạn) without truncating names', () => {
      const text = `1. Anh Nguyễn Tiến Đạt - dat.nt@gmail.com - 0912345678
2. Chị Trần Thanh Nhã - nha.tt@gmail.com - 0987654321
3. Em Lê Đức Thắng - thang.ld@outlook.com - 0909090909`;

      const attendees = extractAttendeesFromText(text, mockUserProfile);
      expect(attendees).toHaveLength(3);
      expect(attendees[0].name).toBe('Nguyễn Tiến Đạt');
      expect(attendees[0].email).toBe('dat.nt@gmail.com');
      expect(attendees[0].phone).toBe('0912345678');

      expect(attendees[1].name).toBe('Trần Thanh Nhã');
      expect(attendees[1].email).toBe('nha.tt@gmail.com');

      expect(attendees[2].name).toBe('Lê Đức Thắng');
      expect(attendees[2].email).toBe('thang.ld@outlook.com');
    });

    test('correctly parses attendee names with common Vietnamese words (Đạt, Tiến, Gia, Thắng, Đông, Mai, Nhã)', () => {
      const text = `Hoàng Phương Đông - dong.hp@gmail.com - 0918273645
Phạm Ban Mai - banmai@gmail.com - 0933445566`;

      const attendees = extractAttendeesFromText(text, mockUserProfile);
      expect(attendees).toHaveLength(2);
      expect(attendees[0].name).toBe('Hoàng Phương Đông');
      expect(attendees[0].email).toBe('dong.hp@gmail.com');
      expect(attendees[0].phone).toBe('0918273645');

      expect(attendees[1].name).toBe('Phạm Ban Mai');
      expect(attendees[1].email).toBe('banmai@gmail.com');
      expect(attendees[1].phone).toBe('0933445566');
    });

    test('extracts attendee from format without punctuation (just spaces)', () => {
      const text = 'Đỗ Minh Quân minhquan@gmail.com 0918112233';
      const attendees = extractAttendeesFromText(text, mockUserProfile);

      expect(attendees).toHaveLength(1);
      expect(attendees[0].name).toBe('Đỗ Minh Quân');
      expect(attendees[0].email).toBe('minhquan@gmail.com');
      expect(attendees[0].phone).toBe('0918112233');
    });

    test('extracts attendee with parenthesized details', () => {
      const text = 'Vũ Hoàng Long (long.vh@gmail.com - 0903332211)';
      const attendees = extractAttendeesFromText(text, mockUserProfile);

      expect(attendees).toHaveLength(1);
      expect(attendees[0].name).toBe('Vũ Hoàng Long');
      expect(attendees[0].email).toBe('long.vh@gmail.com');
      expect(attendees[0].phone).toBe('0903332211');
    });

    test('extracts standalone names paired with declared shared email via "gửi hết về mail"', () => {
      const text = `Tôi đi 2 người:
- Nguyễn Văn A
- Trần Văn B
Gửi hết về mail: team@eventhub.vn`;

      const attendees = extractAttendeesFromText(text, mockUserProfile);
      expect(attendees).toHaveLength(2);
      expect(attendees[0].name).toBe('Nguyễn Văn A');
      expect(attendees[0].email).toBe('team@eventhub.vn');
      expect(attendees[1].name).toBe('Trần Văn B');
      expect(attendees[1].email).toBe('team@eventhub.vn');
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
