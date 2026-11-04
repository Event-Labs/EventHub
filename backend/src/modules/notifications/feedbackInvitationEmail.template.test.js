const {
  buildFeedbackInvitationHtml,
  buildFeedbackInvitationText,
} = require('./feedbackInvitationEmail.template');

describe('feedbackInvitationEmail.template', () => {
  it('generates html containing attendee name, event title and feedback link', () => {
    const html = buildFeedbackInvitationHtml({
      attendeeName: 'Nguyễn Văn A',
      eventTitle: 'Đêm Nhạc Acoustic Mùa Thu',
      startTime: '2026-11-04T12:00:00.000Z',
      endTime: '2026-11-04T15:00:00.000Z',
      venueName: 'Nhà hát Hòa Bình',
      addressLine: '240 đường 3/2, Quận 10',
      feedbackLink: 'https://eventhub.com/feedback?event_id=123',
    });

    expect(html).toContain('NGUYỄN VĂN A');
    expect(html).toContain('Đêm Nhạc Acoustic Mùa Thu');
    expect(html).toContain('https://eventhub.com/feedback?event_id=123');
    expect(html).toContain('2/3 thời gian');
    expect(html).toContain('Gửi đánh giá &amp; phản hồi ngay');
  });

  it('generates text version correctly', () => {
    const text = buildFeedbackInvitationText({
      attendeeName: 'Nguyễn Văn A',
      eventTitle: 'Đêm Nhạc Acoustic Mùa Thu',
      feedbackLink: 'https://eventhub.com/feedback?event_id=123',
    });

    expect(text).toContain('Xin chào Nguyễn Văn A');
    expect(text).toContain('Đêm Nhạc Acoustic Mùa Thu');
    expect(text).toContain('https://eventhub.com/feedback?event_id=123');
    expect(text).toContain('2/3 thời gian');
  });
});

