const db = require('../../infrastructure/database/db.client');
const logger = require('../../core/logger');

const DEFAULT_REVIEW_CRITERIA = [
  {
    code: 'TERMS_ORGANIZER',
    title: 'Giấy phép tổ chức & Hồ sơ pháp lý bắt buộc (PDF)',
    category: 'LEGAL',
    severity: 'CRITICAL',
    order_index: 1,
    rule_content: `Mọi sự kiện bắt buộc phải có Giấy phép tổ chức sự kiện / Hồ sơ pháp lý hợp lệ đính kèm (Giấy phép biểu diễn từ Sở Văn hóa & Thể thao, UBND; Quyết định thành lập; Giấy chứng nhận ĐKKD; hoặc Hợp đồng thuê mặt bằng/địa điểm tổ chức).
Quy định định dạng tệp: Tất cả tệp tài liệu pháp lý bắt buộc phải là định dạng PDF (.pdf). Nếu tệp tải lên là Word (.doc, .docx), ảnh (.jpg, .png), tệp nén hoặc định dạng khác -> BẮT BUỘC xếp vào "critical_violations" (TERMS_ORGANIZER) và ra quyết định REJECT.
Thẩm định bản chất văn bản & Chống ngụy tạo: Tài liệu tải lên BẮT BUỘC phải là văn bản pháp lý chính thống. TUYỆT ĐỐI NGHIÊM CẤM tải lên tài liệu học tập, sách vở, cuốn từ vựng ngoại ngữ (như từ vựng tiếng Nhật N5, tài liệu ôn thi tiếng Anh...), giáo trình, đề thi, bài tập về nhà, tiểu thuyết, truyện tranh, nhật ký cá nhân hoặc văn bản linh tinh đối phó hệ thống. Nếu phát hiện tệp tài liệu là sách, từ vựng, tài liệu học tập hoặc nội dung phi pháp lý -> BẮT BUỘC xếp vào "critical_violations" (TERMS_ORGANIZER) và REJECT ngay lập tức vì hành vi ngụy tạo tài liệu pháp lý.
Trách nhiệm & đạo đức NTC (Điều 4 TERMS_ORGANIZER): Nghiêm cấm hứa hẹn lợi nhuận tài chính phi thực tế ("x100 vốn", "lãi 30%/tháng", "bao lỗ 100%"), cấm Ponzi, cờ bạc, đa cấp biến tướng. Nghiêm cấm tạo đơn ảo, thao túng vé hoặc vi phạm bản quyền. Nếu vi phạm -> BẮT BUỘC REJECT ngay lập tức.`,
  },
  {
    code: 'EVENT_COHERENCE',
    title: 'Tính nhất quán, liên quan & Xác thực chủ đề sự kiện (Coherence & Thematic Relevance)',
    category: 'CONTENT',
    severity: 'CRITICAL',
    order_index: 2,
    rule_content: `Quy trình suy luận chủ đề cốt lõi (Core Event Inference): Trước khi thẩm định, AI bắt buộc phải phân tích và suy ra chủ đề cốt lõi của sự kiện dựa trên Tiêu đề, Thể loại/Định dạng, Mô tả ngắn, Mô tả chi tiết và Poster/Banner (Ví dụ: Nhạc hội, Hội thảo công nghệ, Triển lãm nghệ thuật, Giải chạy Marathon, Khóa học ngoại ngữ, Workshop kỹ năng...).
Nguyên tắc liên quan đồng bộ (Cross-Relevance Integrity): Tất cả các thành phần cấu thành sự kiện (Tiêu đề, Mô tả, Hình ảnh, Hạng vé, Lịch trình phiên và Hồ sơ giấy phép) BẮT BUỘC PHẢI LIÊN QUAN CHẶT CHẼ ĐẾN NHAU và phục vụ cho đúng chủ đề sự kiện đó.
Hành vi nghiêm cấm (Treo đầu dê bán thịt chó & Lạc đề):
+ Nghiêm cấm sự kiện tiêu đề một đằng nhưng mô tả, hình ảnh hoặc vé lại về một chủ đề hoàn toàn khác.
+ Nghiêm cấm tài liệu đính kèm (giấy phép) không liên quan đến nội dung, tên sự kiện hoặc đơn vị tổ chức (ví dụ: Sự kiện biểu diễn âm nhạc nhưng tải lên tài liệu từ vựng tiếng Nhật N5, tài liệu giáo trình, hoặc giấy tờ của sự kiện khác).
+ Nếu phát hiện bất kỳ sự mâu thuẫn chủ đề hoặc tài liệu/hình ảnh lạc đề không liên quan -> BẮT BUỘC xếp vào "critical_violations" (EVENT_COHERENCE) và ra quyết định REJECT.`,
  },
  {
    code: 'LEGAL_PERMIT_AUTHENTICITY',
    title: 'Xác thực bản chất pháp lý & Thẩm quyền của tài liệu đính kèm',
    category: 'LEGAL',
    severity: 'CRITICAL',
    order_index: 3,
    rule_content: `Đặc điểm nhận diện văn bản pháp lý hợp lệ: Văn bản pháp lý sự kiện phải có các dấu hiệu thể thức văn bản hành chính hoặc thương mại (Quốc hiệu/Tiêu ngữ, Tên cơ quan ban hành hoặc Tên doanh nghiệp tổ chức, Số quyết định/Số hợp đồng, Ngày ban hành/Ký kết, Chữ ký và Con dấu pháp nhân, Điều khoản thỏa thuận tổ chức hoặc thuê địa điểm).
Kiểm tra tính chính danh: Đơn vị được cấp phép hoặc bên thuê địa điểm trong tài liệu phải trùng khớp với Nhà tổ chức hoặc có giấy ủy quyền hợp lệ. Tên sự kiện, thời gian hoặc địa điểm diễn ra trong tài liệu phải tương thích với bài đăng.
Tài liệu vô hiệu / Ngụy tạo: Tệp tải lên nếu chỉ là danh sách từ vựng, tài liệu học bài, văn bản sao chép vô nghĩa, hoặc hợp đồng giả mạo -> BẮT BUỘC coi là hành vi đối phó/gian lận hồ sơ -> BẮT BUỘC xếp vào "critical_violations" (LEGAL_PERMIT_AUTHENTICITY) và ra quyết định REJECT.`,
  },
  {
    code: 'EVENT_REALISM_FEASIBILITY',
    title: 'Tính khả thi thực tế & Chống nội dung rác / Thử nghiệm (Anti-Spam / Anti-Test)',
    category: 'GENERAL',
    severity: 'CRITICAL',
    order_index: 4,
    rule_content: `Xác thực tính thực tế của sự kiện: Sự kiện đăng bán vé trên EventHub phải là sự kiện có thật, có kế hoạch tổ chức khả thi, có thông tin rõ ràng về đơn vị tổ chức, mục đích và người tham gia.
Chống nội dung rác / Bài test thử nghiệm: Nghiêm cấm tạo sự kiện thử nghiệm ("test", "asdasd", "sự kiện nháp", nhập ký tự ngẫu nhiên vô nghĩa), mô tả đối phó hoặc tạo sự kiện ảo để chiếm dụng hệ thống.
Đánh giá rủi ro lừa đảo: Nếu sự kiện có dấu hiệu hứa hẹn không tưởng, nội dung mơ hồ, hoặc thiếu thông tin liên hệ xác thực -> BẮT BUỘC xếp vào "critical_violations" (EVENT_REALISM_FEASIBILITY) và REJECT.`,
  },
  {
    code: 'PAYMENT_POLICY',
    title: 'Kênh thanh toán chính thức & Chống giao dịch ngoài luồng',
    category: 'LEGAL',
    severity: 'CRITICAL',
    order_index: 5,
    rule_content: `Kênh thanh toán hợp lệ (Điều 2 & Điều 6 PAYMENT_POLICY): Mọi giao dịch mua vé bắt buộc phải thông qua cổng thanh toán chính thức của nền tảng EventHub để bảo vệ quyền lợi người mua.
Hành vi nghiêm cấm: Tuyệt đối không kêu gọi người mua chuyển khoản cọc hoặc thanh toán trực tiếp vào số tài khoản (STK) cá nhân ngoài web.
Chống trốn phí và né sàn: Nghiêm cấm hướng dẫn giao dịch qua Zalo, Telegram, Facebook cá nhân nhằm mục đích trốn tránh phí nền tảng hoặc lừa đảo chiếm đoạt tài sản.
Mức độ xử lý: Nếu phát hiện bất kỳ dấu hiệu yêu cầu chuyển tiền ngoài hệ thống EventHub -> BẮT BUỘC xếp vào "critical_violations" (PAYMENT_POLICY) và đưa ra quyết định REJECT (High Risk).`,
  },
  {
    code: 'REFUND_POLICY',
    title: 'Chính sách hoàn vé & Trách nhiệm khi hoãn/hủy sự kiện',
    category: 'REFUND',
    severity: 'WARNING',
    order_index: 6,
    rule_content: `Trách nhiệm khi có sự cố (Điều 3 & Điều 5 REFUND_POLICY): Khi sự kiện bị hoãn, hủy hoặc thay đổi nghiêm trọng về thời gian, địa điểm, nội dung hay nghệ sĩ biểu diễn chính, Nhà tổ chức bắt buộc phải có trách nhiệm giải quyết hoàn tiền thỏa đáng cho người mua vé.
Tuyên bố trái luật: Nghiêm cấm tuyên bố mang tính áp đặt trái pháp luật và quy chế EventHub như: "Nếu sự kiện bị hủy vẫn không hoàn tiền dưới mọi lý do" hoặc "Vé đã mua miễn đổi trả kể cả khi hủy show". Khi phát hiện -> BẮT BUỘC xếp vào "warnings" hoặc "critical_violations" và ra quyết định NEEDS_REVIEW hoặc REJECT.
Chống mâu thuẫn chính sách: Bắt lỗi nếu có sự mâu thuẫn giữa lời giới thiệu ("Cam kết hoàn tiền 100%") và điều khoản chi tiết ("Miễn đổi trả không hoàn tiền").
Minh bạch điều kiện hoàn vé: Nếu có chính sách hoàn vé riêng, phải nêu rõ thời hạn (hoàn trước bao nhiêu ngày) và tỷ lệ hoàn vé cụ thể (% hoàn tiền).`,
  },
  {
    code: 'TICKET_POLICY',
    title: 'Minh bạch cơ cấu vé, Quyền lợi vé & Địa chỉ tổ chức',
    category: 'TICKETS',
    severity: 'CRITICAL',
    order_index: 7,
    rule_content: `Cơ cấu loại vé (Điều 2 & Điều 5 TICKET_POLICY): Phải có ít nhất 01 hạng vé hợp lệ. Nêu rõ tên loại vé, giá tiền (không âm, >= 0 VNĐ; vé miễn phí = 0 VNĐ), số lượng vé (> 0), quyền lợi cụ thể của từng hạng vé (ví dụ: vé Tiêu chuẩn, vé VIP, vé Early Bird) và điều kiện tham dự/check-in.
Minh bạch địa điểm tổ chức: Địa chỉ sự kiện phải rõ ràng, cụ thể (bao gồm số nhà, tên tòa nhà/trung tâm/hội trường, quận/huyện, tỉnh/thành phố).
Cấm giấu địa chỉ: TUYỆT ĐỐI KHÔNG chấp nhận các hành vi giấu địa chỉ như: "Địa chỉ bí mật sẽ nhắn sau qua SMS", "Inbox Zalo để nhận địa chỉ". Khi phát hiện mập mờ địa chỉ -> BẮT BUỘC xếp vào "warnings" (TICKET_POLICY) và ra quyết định NEEDS_REVIEW.`,
  },
  {
    code: 'SESSION_SCHEDULE',
    title: 'Lịch trình các phiên (Sessions) & Logic thời gian tổ chức',
    category: 'SCHEDULE',
    severity: 'CRITICAL',
    order_index: 8,
    rule_content: `Logic thời gian từng phiên: Mỗi phiên (Session) phải có thời gian bắt đầu và kết thúc cụ thể. Giờ kết thúc phiên bắt buộc phải diễn ra sau giờ bắt đầu phiên.
Tính hợp lý của lịch trình: Các phiên không được chồng lấn thời gian một cách vô lý trừ khi là các hoạt động song song có ghi chú rõ ràng.
Thời gian tổng thể: Thời gian bắt đầu sự kiện không được nằm trong quá khứ so với thời điểm gửi duyệt sự kiện. Thời gian kết thúc tổng thể phải diễn ra sau thời gian bắt đầu tổng thể của sự kiện.
Khớp nối thông tin: Ngày giờ diễn ra trên lịch trình phải khớp với ngày giờ được thông báo trên tiêu đề và hình ảnh poster/banner của sự kiện.`,
  },
  {
    code: 'IMAGE_POLICY',
    title: 'Kiểm duyệt hình ảnh, OCR đối chiếu & An toàn đúng ngữ cảnh',
    category: 'MEDIA',
    severity: 'CRITICAL',
    order_index: 9,
    rule_content: `Quy chuẩn bắt buộc: Ảnh đại diện chính (Main Poster) và Ảnh bìa (Cover Banner) là bắt buộc phải có để đảm bảo tính chuyên nghiệp. Các ảnh trong bài viết mô tả là tùy chọn bổ trợ.
Nguyên tắc kiểm duyệt an toàn đúng ngữ cảnh (Sensible Safety Moderation): Đánh giá khách quan, KHÔNG QUÁ NHẠY CẢM hay vội vàng gắn mác khiêu dâm/18+ chỉ vì hình ảnh nghệ thuật, biểu diễn thời trang, đồ bơi bãi biển resort, ca múa nhạc, yoga, khiêu vũ thể thao, sức khỏe hay y khoa lành mạnh.
Chỉ xếp vào vi phạm (VIOLATION) khi: Có hình ảnh đồi trụy lộ liễu, khỏa thân hoàn toàn/bộ phận nhạy cảm, hành vi quan hệ tình dục, nội dung khiêu dâm kích dục, bạo lực máu me cực đoan, vũ khí nguy hiểm, cờ bạc cá cược hoặc chất cấm.
Kiểm tra OCR chữ trên ảnh: Đối chiếu tiêu đề, nghệ sĩ, ngày giờ, địa điểm in trên Poster/Banner với thông tin khai báo trong bài đăng để phát hiện mâu thuẫn ngày giờ hoặc lỗi chính tả.
Quy tắc diễn đạt mô tả ảnh: Mô tả trung thực nội dung trực quan (nghệ sĩ, chủ đề, màu sắc, phong cách) và các chữ OCR bằng tiếng Việt chuẩn. Tuyệt đối không sinh ký tự tiếng nước ngoài lạ hoặc chuỗi ký tự lặp vô nghĩa.`,
  },
  {
    code: 'CONTENT_SPELLING',
    title: 'Soát lỗi chính tả tiếng Việt & Chuẩn mực nội dung sự kiện',
    category: 'CONTENT',
    severity: 'WARNING',
    order_index: 10,
    rule_content: `Soát lỗi chính tả tiếng Việt: Kiểm tra kỹ lưỡng Tiêu đề, Mô tả ngắn và Mô tả chi tiết để phát hiện các lỗi gõ sai telex, sai dấu câu, sai từ ngữ (ví dụ: "Hôi Thảo", "Doang Nghiệp", "chia sẽ", "tồ chức", "nấm bắt").
Trích xuất chi tiết: Tất cả lỗi chính tả phát hiện được phải được liệt kê chi tiết vào mục "content_review.spelling_grammar_issues" kèm theo từ đúng đề xuất chỉnh sửa.
Tiêu chuẩn độ dài & bố cục: Tiêu đề tối thiểu 5 ký tự, không giật tít vô căn cứ, không dùng từ ngữ kích động/lừa đảo. Mô tả chi tiết tối thiểu 30 ký tự, có đề mục phân đoạn rõ ràng để người đọc dễ theo dõi.`,
  },
  {
    code: 'ORGANIZER_LEGAL_COMPLIANCE',
    title: 'Tuân thủ pháp luật chuyên ngành, PCCC & An toàn sự kiện',
    category: 'LEGAL',
    severity: 'CRITICAL',
    order_index: 11,
    rule_content: `An toàn trật tự & Phòng cháy chữa cháy (PCCC): Các sự kiện tập trung đông người (nhạc hội ngoài trời, hội chợ, festival) phải đảm bảo địa điểm có phương án PCCC, lối thoát hiểm và phương án cấp cứu y tế.
Bản quyền tác phẩm: Nghiêm cấm các sự kiện biểu diễn, trình chiếu vi phạm bản quyền tác giả âm nhạc, phim ảnh hoặc sở hữu trí tuệ mà chưa có sự đồng ý của tác giả/chủ sở hữu quyền tác giả.
Bảo vệ trẻ em và thuần phong mỹ tục: Các sự kiện có đối tượng tham gia là trẻ em phải có biện pháp giám sát an toàn. Nghiêm cấm các hoạt động trái với đạo đức xã hội và thuần phong mỹ tục Việt Nam.`,
  },
  {
    code: 'VALUABLE_SUGGESTIONS',
    title: 'Tư vấn hoàn thiện chất lượng & Quy tắc đề xuất có giá trị thực tế',
    category: 'GENERAL',
    severity: 'INFO',
    order_index: 12,
    rule_content: `Nguyên tắc chống spam gợi ý thừa thãi: Hệ thống nền tảng EventHub đã tích hợp CDN tự động tối ưu hóa và chuẩn hóa kích thước/tỷ lệ hiển thị của ảnh, do đó TUYỆT ĐỐI KHÔNG đưa ra các lời khuyên hiển nhiên, sáo rỗng như: "chỉnh sửa kích thước ảnh", "tăng độ phân giải ảnh", "tối ưu dung lượng hình ảnh".
Chỉ gợi ý khi thực sự hữu ích và có giá trị thực tế:
+ Khi sự kiện thiếu thông tin chăm sóc khách hàng: Đề xuất bổ sung Hotline, Email hỗ trợ, Fanpage chính thức hoặc quy định check-in vé tại cổng.
+ Khi lịch trình sơ sài: Đề xuất bổ sung mốc giờ chi tiết cho từng tiết mục, danh sách Diễn giả, Nghệ sĩ khách mời hoặc sơ đồ khu vực chỗ ngồi.
+ Khi văn bản có lỗi chính tả hoặc mâu thuẫn chữ trên ảnh: Nhắc nhở Nhà tổ chức chỉnh sửa lại cho đồng nhất và chuyên nghiệp.`,
  },
];

class ReviewCriteriaRepository {
  async ensureTable() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS event_review_criteria (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          code VARCHAR(50) NOT NULL UNIQUE,
          title VARCHAR(255) NOT NULL,
          category VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
          severity VARCHAR(20) NOT NULL DEFAULT 'CRITICAL',
          rule_content TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          order_index INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_by UUID,
          updated_by UUID
        );
        CREATE INDEX IF NOT EXISTS idx_event_review_criteria_active_order 
          ON event_review_criteria(is_active, order_index);
      `);

      // Seed defaults if empty
      const { rows } = await db.query('SELECT COUNT(*)::int AS count FROM event_review_criteria');
      if (rows[0]?.count === 0) {
        logger.info('[ReviewCriteriaRepository] Table is empty, seeding default criteria...');
        for (const item of DEFAULT_REVIEW_CRITERIA) {
          await db.query(
            `
            INSERT INTO event_review_criteria (code, title, category, severity, rule_content, is_active, order_index)
            VALUES ($1, $2, $3, $4, $5, true, $6)
            ON CONFLICT (code) DO NOTHING
            `,
            [item.code, item.title, item.category, item.severity, item.rule_content, item.order_index]
          );
        }
        logger.info(`[ReviewCriteriaRepository] Successfully seeded ${DEFAULT_REVIEW_CRITERIA.length} default criteria.`);
      }
    } catch (err) {
      logger.warn(`[ReviewCriteriaRepository] ensureTable warning: ${err.message}`);
    }
  }

  async findAll(filter = {}) {
    await this.ensureTable();
    const params = [];
    const where = [];

    if (filter.is_active !== undefined && filter.is_active !== null && filter.is_active !== '') {
      params.push(filter.is_active === true || filter.is_active === 'true');
      where.push(`is_active = $${params.length}`);
    }

    if (filter.category) {
      params.push(filter.category);
      where.push(`category = $${params.length}`);
    }

    if (filter.search) {
      params.push(`%${filter.search.trim().toLowerCase()}%`);
      where.push(`(LOWER(title) LIKE $${params.length} OR LOWER(code) LIKE $${params.length} OR LOWER(rule_content) LIKE $${params.length})`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const query = `
      SELECT id, code, title, category, severity, rule_content, is_active, order_index, created_at, updated_at, created_by, updated_by
      FROM event_review_criteria
      ${whereClause}
      ORDER BY order_index ASC, created_at ASC
    `;

    const { rows } = await db.query(query, params);
    return rows;
  }

  async findActive() {
    await this.ensureTable();
    const { rows } = await db.query(`
      SELECT id, code, title, category, severity, rule_content, is_active, order_index
      FROM event_review_criteria
      WHERE is_active = true
      ORDER BY order_index ASC, created_at ASC
    `);
    return rows;
  }

  async findById(id) {
    await this.ensureTable();
    const { rows } = await db.query(
      `SELECT * FROM event_review_criteria WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  async findByCode(code) {
    await this.ensureTable();
    const { rows } = await db.query(
      `SELECT * FROM event_review_criteria WHERE code = $1 LIMIT 1`,
      [code]
    );
    return rows[0] || null;
  }

  async create(payload, userId = null) {
    await this.ensureTable();
    const { rows } = await db.query(
      `
      INSERT INTO event_review_criteria (
        code, title, category, severity, rule_content, is_active, order_index, created_by, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, true), COALESCE($7, 0), $8, $8)
      RETURNING *
      `,
      [
        payload.code.trim().toUpperCase(),
        payload.title.trim(),
        payload.category || 'GENERAL',
        payload.severity || 'CRITICAL',
        payload.rule_content.trim(),
        payload.is_active !== undefined ? payload.is_active : true,
        payload.order_index ?? 0,
        userId,
      ]
    );
    return rows[0];
  }

  async update(id, updates, userId = null) {
    await this.ensureTable();
    const sets = [];
    const values = [];

    const addSet = (column, value) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (updates.code !== undefined) addSet('code', updates.code.trim().toUpperCase());
    if (updates.title !== undefined) addSet('title', updates.title.trim());
    if (updates.category !== undefined) addSet('category', updates.category);
    if (updates.severity !== undefined) addSet('severity', updates.severity);
    if (updates.rule_content !== undefined) addSet('rule_content', updates.rule_content.trim());
    if (updates.is_active !== undefined) addSet('is_active', Boolean(updates.is_active));
    if (updates.order_index !== undefined) addSet('order_index', Number(updates.order_index));

    if (sets.length === 0) return this.findById(id);

    addSet('updated_by', userId);

    values.push(id);
    const { rows } = await db.query(
      `
      UPDATE event_review_criteria
      SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING *
      `,
      values
    );
    return rows[0] || null;
  }

  async delete(id) {
    await this.ensureTable();
    const { rowCount } = await db.query(
      `DELETE FROM event_review_criteria WHERE id = $1`,
      [id]
    );
    return rowCount > 0;
  }

  async resetDefaults(userId = null) {
    await this.ensureTable();
    // Re-seed default criteria
    for (const item of DEFAULT_REVIEW_CRITERIA) {
      await db.query(
        `
        INSERT INTO event_review_criteria (
          code, title, category, severity, rule_content, is_active, order_index, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, true, $6, $7)
        ON CONFLICT (code) DO UPDATE
        SET title = $2, category = $3, severity = $4, rule_content = $5, is_active = true, order_index = $6, updated_at = NOW(), updated_by = $7
        `,
        [item.code, item.title, item.category, item.severity, item.rule_content, item.order_index, userId]
      );
    }
    return this.findAll();
  }
}

module.exports = new ReviewCriteriaRepository();
