require('dotenv').config();
const db = require('../src/infrastructure/database/db.client');
const reviewCriteriaRepository = require('../src/modules/admin/reviewCriteria.repository');

async function syncCriteria() {
  console.log('🔄 Bắt đầu đồng bộ bộ điều khoản kiểm duyệt AI dựa trên dữ liệu training...');
  try {
    const criteria = await reviewCriteriaRepository.resetDefaults();
    console.log(`✅ Đã đồng bộ thành công ${criteria.length} điều khoản vào cơ sở dữ liệu:`);
    criteria.forEach((c, idx) => {
      console.log(`   ${idx + 1}. [${c.code}] (${c.category} - ${c.severity}): ${c.title}`);
    });
  } catch (err) {
    console.error('❌ Lỗi khi đồng bộ điều khoản:', err);
  } finally {
    await db.pool.end();
  }
}

syncCriteria();
