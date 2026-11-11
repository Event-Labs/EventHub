const db = require('../../infrastructure/database/db.client');

class ComplaintsRepository {
  async createComplaint({
    customerId,
    eventId = null,
    organizerId = null,
    ticketId = null,
    orderId = null,
    category,
    title,
    description,
    evidenceUrls = [],
    contactEmail = null,
    contactPhone = null,
  }) {
    // If eventId is given but organizerId is not, lookup organizer_id from event
    let targetOrganizerId = organizerId;
    if (eventId && !targetOrganizerId) {
      const evRes = await db.query('SELECT organizer_id FROM events WHERE id = $1', [eventId]);
      if (evRes.rows.length > 0) {
        targetOrganizerId = evRes.rows[0].organizer_id;
      }
    }

    const sql = `
      INSERT INTO customer_complaints (
        customer_id,
        event_id,
        organizer_id,
        ticket_id,
        order_id,
        category,
        title,
        description,
        evidence_urls,
        contact_email,
        contact_phone,
        status,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING', NOW(), NOW())
      RETURNING *;
    `;

    const values = [
      customerId,
      eventId,
      targetOrganizerId,
      ticketId,
      orderId,
      category,
      title,
      description,
      evidenceUrls,
      contactEmail,
      contactPhone,
    ];

    const result = await db.query(sql, values);
    return result.rows[0];
  }

  async findComplaints(filters = {}) {
    const {
      status,
      category,
      search,
      page = 1,
      limit = 50,
    } = filters;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (status && status !== 'ALL') {
      conditions.push(`cc.status = $${idx++}`);
      values.push(status.toUpperCase());
    }

    if (category && category !== 'ALL') {
      conditions.push(`cc.category = $${idx++}`);
      values.push(category);
    }

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(`(
        LOWER(cc.title) LIKE $${idx} OR
        LOWER(cc.description) LIKE $${idx} OR
        LOWER(u.full_name) LIKE $${idx} OR
        LOWER(u.email) LIKE $${idx} OR
        LOWER(COALESCE(cc.contact_email, '')) LIKE $${idx} OR
        LOWER(COALESCE(cc.contact_phone, '')) LIKE $${idx} OR
        LOWER(COALESCE(e.title, '')) LIKE $${idx} OR
        LOWER(COALESCE(o.organization_name, '')) LIKE $${idx} OR
        LOWER(COALESCE(t.ticket_code, '')) LIKE $${idx} OR
        LOWER(COALESCE(ord.order_code, '')) LIKE $${idx}
      )`);
      values.push(q);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    const countSql = `
      SELECT COUNT(*) as total
      FROM customer_complaints cc
      LEFT JOIN users u ON u.id = cc.customer_id
      LEFT JOIN events e ON e.id = cc.event_id
      LEFT JOIN organizers o ON o.id = COALESCE(cc.organizer_id, e.organizer_id)
      LEFT JOIN tickets t ON t.id = cc.ticket_id
      LEFT JOIN orders ord ON ord.id = cc.order_id
      ${whereClause};
    `;

    const countResult = await db.query(countSql, values);
    const total = parseInt(countResult.rows[0]?.total || 0, 10);

    const querySql = `
      SELECT 
        cc.id,
        cc.customer_id,
        cc.event_id,
        cc.organizer_id,
        cc.ticket_id,
        cc.order_id,
        cc.category,
        cc.title,
        cc.description,
        cc.evidence_urls,
        cc.contact_email,
        cc.contact_phone,
        cc.status,
        cc.admin_note,
        cc.resolved_by_id,
        cc.resolved_at,
        cc.created_at,
        cc.updated_at,
        -- Customer details
        u.full_name AS customer_name,
        u.email AS customer_email,
        u.phone AS customer_phone,
        u.avatar_url AS customer_avatar_url,
        -- Event details
        e.title AS event_title,
        e.slug AS event_slug,
        e.thumbnail_url AS event_thumbnail_url,
        e.start_time AS event_start_time,
        e.status AS event_status,
        -- Organizer details
        o.organization_name AS organizer_name,
        o.business_email AS organizer_email,
        o.business_phone AS organizer_phone,
        -- Ticket & Order details
        t.ticket_code,
        ord.order_code,
        -- Admin resolver
        adm.full_name AS resolved_by_name
      FROM customer_complaints cc
      LEFT JOIN users u ON u.id = cc.customer_id
      LEFT JOIN events e ON e.id = cc.event_id
      LEFT JOIN organizers o ON o.id = COALESCE(cc.organizer_id, e.organizer_id)
      LEFT JOIN tickets t ON t.id = cc.ticket_id
      LEFT JOIN orders ord ON ord.id = cc.order_id
      LEFT JOIN users adm ON adm.id = cc.resolved_by_id
      ${whereClause}
      ORDER BY cc.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;

    values.push(parseInt(limit, 10));
    values.push(offset);

    const result = await db.query(querySql, values);
    return {
      items: result.rows,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };
  }

  async findComplaintById(id) {
    const sql = `
      SELECT 
        cc.id,
        cc.customer_id,
        cc.event_id,
        cc.organizer_id,
        cc.ticket_id,
        cc.order_id,
        cc.category,
        cc.title,
        cc.description,
        cc.evidence_urls,
        cc.contact_email,
        cc.contact_phone,
        cc.status,
        cc.admin_note,
        cc.resolved_by_id,
        cc.resolved_at,
        cc.created_at,
        cc.updated_at,
        u.full_name AS customer_name,
        u.email AS customer_email,
        u.phone AS customer_phone,
        u.avatar_url AS customer_avatar_url,
        e.title AS event_title,
        e.slug AS event_slug,
        e.thumbnail_url AS event_thumbnail_url,
        e.start_time AS event_start_time,
        e.status AS event_status,
        o.organization_name AS organizer_name,
        o.business_email AS organizer_email,
        o.business_phone AS organizer_phone,
        t.ticket_code,
        ord.order_code,
        adm.full_name AS resolved_by_name
      FROM customer_complaints cc
      LEFT JOIN users u ON u.id = cc.customer_id
      LEFT JOIN events e ON e.id = cc.event_id
      LEFT JOIN organizers o ON o.id = COALESCE(cc.organizer_id, e.organizer_id)
      LEFT JOIN tickets t ON t.id = cc.ticket_id
      LEFT JOIN orders ord ON ord.id = cc.order_id
      LEFT JOIN users adm ON adm.id = cc.resolved_by_id
      WHERE cc.id = $1;
    `;
    const res = await db.query(sql, [id]);
    return res.rows[0] || null;
  }

  async findCustomerComplaints(customerId) {
    const sql = `
      SELECT 
        cc.*,
        e.title AS event_title,
        e.slug AS event_slug,
        e.thumbnail_url AS event_thumbnail_url,
        o.organization_name AS organizer_name,
        t.ticket_code,
        ord.order_code
      FROM customer_complaints cc
      LEFT JOIN events e ON e.id = cc.event_id
      LEFT JOIN organizers o ON o.id = COALESCE(cc.organizer_id, e.organizer_id)
      LEFT JOIN tickets t ON t.id = cc.ticket_id
      LEFT JOIN orders ord ON ord.id = cc.order_id
      WHERE cc.customer_id = $1
      ORDER BY cc.created_at DESC;
    `;
    const res = await db.query(sql, [customerId]);
    return res.rows;
  }

  async updateComplaintStatus(id, { status, adminNote, resolvedById }) {
    const isResolvedOrRejected = ['RESOLVED', 'REJECTED'].includes(status);
    const sql = `
      UPDATE customer_complaints
      SET 
        status = $1,
        admin_note = COALESCE($2, admin_note),
        resolved_by_id = COALESCE($3, resolved_by_id),
        resolved_at = ${isResolvedOrRejected ? 'NOW()' : 'resolved_at'},
        updated_at = NOW()
      WHERE id = $4
      RETURNING *;
    `;
    const res = await db.query(sql, [status, adminNote, resolvedById, id]);
    return res.rows[0] || null;
  }

  async getComplaintStats() {
    const sql = `
      SELECT
        COUNT(*) AS total_complaints,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) AS pending_complaints,
        COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) AS in_progress_complaints,
        COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END) AS resolved_complaints,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) AS rejected_complaints,
        COUNT(DISTINCT COALESCE(organizer_id, NULL)) AS unique_organizers_complained
      FROM customer_complaints;
    `;
    const res = await db.query(sql);
    return res.rows[0];
  }
}

module.exports = new ComplaintsRepository();

