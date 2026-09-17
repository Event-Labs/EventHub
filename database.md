-- =========================================================
-- EVENTHUB DATABASE DESIGN
-- PostgreSQL Production-Level Schema
-- FULL STREAMLINED & CONSOLIDATED VERSION
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =========================================================
-- ENUMS
-- =========================================================

CREATE TYPE user_status_enum AS ENUM (
    'ACTIVE',
    'LOCKED',
    'PENDING'
);

CREATE TYPE request_status_enum AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);

CREATE TYPE event_status_enum AS ENUM (
    'DRAFT',
    'PENDING_REVIEW',
    'PUBLISHED',
    'HIDDEN',
    'CANCELLED',
    'COMPLETED'
);

CREATE TYPE visibility_enum AS ENUM (
    'PUBLIC',
    'PRIVATE'
);

CREATE TYPE approval_status_enum AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);

CREATE TYPE session_status_enum AS ENUM (
    'UPCOMING',
    'ONGOING',
    'COMPLETED',
    'CANCELLED'
);

CREATE TYPE seat_status_enum AS ENUM (
    'AVAILABLE',
    'HELD',
    'SOLD',
    'BLOCKED'
);

CREATE TYPE order_status_enum AS ENUM (
    'PENDING',
    'PAID',
    'EXPIRED',
    'CANCELLED',
    'FAILED',
    'REFUND_REQUESTED',
    'REFUNDED'
);

CREATE TYPE payment_method_enum AS ENUM (
    'VNPAY',
    'PAYOS',
    'MOMO',
    'CASH'
);

CREATE TYPE payment_provider_enum AS ENUM (
    'VNPAY',
    'PAYOS',
    'MOMO',
    'MANUAL'
);

CREATE TYPE ticket_status_enum AS ENUM (
    'VALID',
    'USED',
    'CANCELLED'
);

CREATE TYPE checkin_method_enum AS ENUM (
    'QR',
    'MANUAL'
);

CREATE TYPE discount_type_enum AS ENUM (
    'PERCENTAGE',
    'FIXED'
);

CREATE TYPE notification_type_enum AS ENUM (
    'SYSTEM',
    'EVENT',
    'PAYMENT',
    'PROMOTION'
);

CREATE TYPE subscription_status_enum AS ENUM (
    'ACTIVE',
    'EXPIRED',
    'CANCELLED'
);

CREATE TYPE ticket_hold_status_enum AS ENUM (
    'ACTIVE',
    'CONFIRMED',
    'EXPIRED',
    'CANCELLED'
);

CREATE TYPE platform_policy_type_enum AS ENUM (
    'REFUND',
    'PAYOUT',
    'EVENT_APPROVAL',
    'SERVICE_FEE',
    'ORGANIZER_REGULATION'
);

CREATE TYPE payment_owner_type_enum AS ENUM (
    'PLATFORM',
    'ORGANIZER'
);

CREATE TYPE payment_reference_type_enum AS ENUM (
    'TICKET_ORDER',
    'SUBSCRIPTION',
    'EVENT_FEE'
);

-- =========================================================
-- 1. USERS & AUTH
-- =========================================================

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT,
    google_id VARCHAR(255) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    avatar_url TEXT,
    bio TEXT,
    favorite_event_ids UUID[] DEFAULT '{}'::uuid[],
    status user_status_enum DEFAULT 'ACTIVE',
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id, role_id)
);

-- =========================================================
-- 2. ORGANIZERS & KYC
-- =========================================================

CREATE TABLE organizer_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    request_type VARCHAR(30) NOT NULL DEFAULT 'INDIVIDUAL',
    organization_name VARCHAR(255) NOT NULL,
    organization_description TEXT,
    business_email VARCHAR(255),
    business_email_verified BOOLEAN NOT NULL DEFAULT false,
    business_email_verified_at TIMESTAMPTZ,
    business_phone VARCHAR(20),
    organization_avatar_url TEXT,
    tax_code VARCHAR(30),
    legal_document_url TEXT,
    business_license_url TEXT,
    legal_representative_name VARCHAR(255),
    legal_representative_position VARCHAR(255),
    legal_representative_id_url TEXT,
    authorization_letter_url TEXT,
    individual_full_name VARCHAR(255),
    individual_identity_number VARCHAR(50),
    individual_id_front_url TEXT,
    individual_id_back_url TEXT,
    individual_selfie_url TEXT,
    individual_tax_code VARCHAR(30),
    terms_accepted BOOLEAN NOT NULL DEFAULT false,
    terms_accepted_at TIMESTAMPTZ,
    request_action VARCHAR(50) NOT NULL DEFAULT 'APPLICATION',
    change_summary TEXT,
    status request_status_enum DEFAULT 'PENDING',
    review_note TEXT,
    reviewed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE organizers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    request_type VARCHAR(30) NOT NULL DEFAULT 'INDIVIDUAL',
    organization_name VARCHAR(255) NOT NULL,
    description TEXT,
    business_email VARCHAR(255),
    business_phone VARCHAR(20),
    organization_avatar_url TEXT,
    tax_code VARCHAR(30),
    legal_document_url TEXT,
    business_license_url TEXT,
    legal_representative_name VARCHAR(255),
    legal_representative_position VARCHAR(255),
    legal_representative_id_url TEXT,
    authorization_letter_url TEXT,
    individual_full_name VARCHAR(255),
    individual_identity_number VARCHAR(50),
    individual_id_front_url TEXT,
    individual_id_back_url TEXT,
    individual_selfie_url TEXT,
    individual_tax_code VARCHAR(30),
    terms_accepted BOOLEAN NOT NULL DEFAULT false,
    terms_accepted_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 3. EVENT MANAGEMENT
-- =========================================================

CREATE TABLE event_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(150) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id UUID NOT NULL REFERENCES organizers(id),
    category_id UUID REFERENCES event_categories(id),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    short_description TEXT,
    description TEXT,
    banner_url TEXT,
    thumbnail_url TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status event_status_enum DEFAULT 'DRAFT',
    visibility visibility_enum DEFAULT 'PUBLIC',
    approval_status approval_status_enum DEFAULT 'PENDING',
    approved_by UUID REFERENCES users(id),
    review_note TEXT,
    reviewed_at TIMESTAMPTZ,
    ai_recommendation VARCHAR(30),
    ai_warnings JSONB DEFAULT '[]'::jsonb,
    ai_reviewed_at TIMESTAMPTZ,
    start_publish_at TIMESTAMPTZ,
    end_publish_at TIMESTAMPTZ,
    format VARCHAR(20) CHECK (format IN ('ONLINE', 'OFFLINE', 'HYBRID')),
    tags TEXT[] DEFAULT '{}',
    refund_policy JSONB DEFAULT '{}'::jsonb,
    additional_terms TEXT,
    require_attendee_info BOOLEAN NOT NULL DEFAULT FALSE,
    seating_rules JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- =========================================================
-- 4. VENUES & SEATING
-- =========================================================

CREATE TABLE venues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id UUID REFERENCES organizers(id),
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    city VARCHAR(100),
    district VARCHAR(100),
    ward VARCHAR(100),
    address_line TEXT,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE seat_maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    layout_type VARCHAR(10) DEFAULT 'GRID' CHECK (layout_type IN ('GRID', 'FREEFORM', 'MIXED')),
    rows_count INT NOT NULL,
    cols_count INT NOT NULL,
    canvas_width INT DEFAULT 900,
    canvas_height INT DEFAULT 600,
    config JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE seat_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20)
);

CREATE TABLE seat_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seat_map_id UUID NOT NULL REFERENCES seat_maps(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#6B7280',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE seats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seat_map_id UUID NOT NULL REFERENCES seat_maps(id) ON DELETE CASCADE,
    seat_type_id UUID REFERENCES seat_types(id),
    zone_id UUID REFERENCES seat_zones(id) ON DELETE SET NULL,
    row_label VARCHAR(10) NOT NULL,
    seat_number VARCHAR(10) NOT NULL,
    x_position INT,
    y_position INT,
    is_disabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(seat_map_id, row_label, seat_number)
);

-- =========================================================
-- 5. EVENT SESSIONS & TICKETS
-- =========================================================

CREATE TABLE event_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES venues(id),
    seat_map_id UUID REFERENCES seat_maps(id),
    session_name VARCHAR(255),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    checkin_start_time TIMESTAMPTZ,
    status session_status_enum DEFAULT 'UPCOMING',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ticket_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_session_id UUID NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price NUMERIC(12,2) NOT NULL CHECK(price >= 0),
    quantity INT NOT NULL CHECK(quantity >= 0),
    max_per_order INT DEFAULT 10,
    sale_start TIMESTAMPTZ,
    sale_end TIMESTAMPTZ,
    is_seated BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ticket_type_seats (
    ticket_type_id UUID REFERENCES ticket_types(id) ON DELETE CASCADE,
    seat_id UUID REFERENCES seats(id) ON DELETE CASCADE,
    PRIMARY KEY(ticket_type_id, seat_id)
);

-- =========================================================
-- 6. PROMOTIONS
-- =========================================================

CREATE TABLE promo_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id UUID REFERENCES organizers(id),
    event_id UUID REFERENCES events(id),
    event_ids UUID[] DEFAULT '{}',
    code VARCHAR(50) NOT NULL,
    discount_type discount_type_enum NOT NULL,
    discount_value NUMERIC(12,2) NOT NULL,
    min_order_value NUMERIC(12,2) DEFAULT 0,
    max_discount NUMERIC(12,2),
    usage_limit INT CHECK (usage_limit >= 0),
    used_count INT DEFAULT 0 CHECK (used_count >= 0),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE UNIQUE INDEX uq_promo_code_per_event
ON promo_codes(event_id, code);

-- =========================================================
-- 7. PLATFORM POLICIES
-- =========================================================

CREATE TABLE platform_policy_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_type platform_policy_type_enum NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE platform_policy_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_config_id UUID REFERENCES platform_policy_configs(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(100) DEFAULT 'application/pdf',
    version VARCHAR(50) DEFAULT '1.0',
    is_public BOOLEAN DEFAULT TRUE,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- =========================================================
-- 8. ORDERS & TICKETS
-- =========================================================

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    organizer_id UUID REFERENCES organizers(id),
    buyer_name VARCHAR(255),
    buyer_email VARCHAR(255),
    buyer_phone VARCHAR(30),
    created_by_staff_id UUID REFERENCES users(id),
    created_by_staff_name VARCHAR(255),
    created_by_role VARCHAR(40),
    order_channel VARCHAR(20) DEFAULT 'ONLINE',
    payment_method VARCHAR(40),
    internal_note TEXT,
    booking_source VARCHAR(40),
    promo_code_id UUID REFERENCES promo_codes(id),
    order_code VARCHAR(50) UNIQUE NOT NULL,
    status order_status_enum DEFAULT 'PENDING',
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    platform_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    expired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE session_seats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_session_id UUID NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
    seat_id UUID NOT NULL REFERENCES seats(id),
    status seat_status_enum DEFAULT 'AVAILABLE',
    held_by UUID REFERENCES users(id),
    held_until TIMESTAMPTZ,
    order_id UUID REFERENCES orders(id),
    UNIQUE(event_session_id, seat_id)
);

CREATE TABLE ticket_holds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
    session_seat_id UUID REFERENCES session_seats(id),
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    order_id UUID REFERENCES orders(id),
    expires_at TIMESTAMPTZ NOT NULL,
    status ticket_hold_status_enum NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_hold_seated_quantity CHECK (session_seat_id IS NULL OR quantity = 1)
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
    session_seat_id UUID REFERENCES session_seats(id),
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2) NOT NULL,
    final_price NUMERIC(12,2) NOT NULL,
    attendee_info JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_item_id UUID NOT NULL REFERENCES order_items(id),
    event_id UUID REFERENCES events(id),
    event_session_id UUID REFERENCES event_sessions(id),
    ticket_type_id UUID REFERENCES ticket_types(id),
    session_seat_id UUID REFERENCES session_seats(id),
    ticket_code VARCHAR(100) UNIQUE NOT NULL,
    qr_code TEXT,
    attendee_name VARCHAR(255),
    attendee_email VARCHAR(255),
    status ticket_status_enum DEFAULT 'VALID',
    checkin_method VARCHAR(20) DEFAULT 'QR',
    checked_in_at TIMESTAMPTZ,
    checked_in_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 9. PAYMENTS (PayOS & Manual)
-- =========================================================

CREATE TABLE organizer_payment_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    provider payment_provider_enum NOT NULL DEFAULT 'PAYOS',
    client_id TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    checksum_key_encrypted TEXT NOT NULL,
    bank_name TEXT,
    bank_account_number TEXT,
    bank_account_holder TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    is_default BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_default_payment_channel
ON organizer_payment_channels(organizer_id)
WHERE is_default = TRUE;

CREATE TABLE payment_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    organizer_id UUID REFERENCES organizers(id),
    payment_owner_type VARCHAR(30) NOT NULL,
    payment_channel_id UUID REFERENCES organizer_payment_channels(id),
    reference_type VARCHAR(50) NOT NULL,
    reference_id UUID NOT NULL,
    provider payment_provider_enum NOT NULL DEFAULT 'PAYOS',
    provider_order_code BIGINT UNIQUE NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) DEFAULT 'VND',
    description TEXT NOT NULL,
    checkout_url TEXT,
    qr_code TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    provider_transaction_id TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    expired_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 10. REFUNDS
-- =========================================================

CREATE TABLE refund_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    refund_method VARCHAR(50) DEFAULT 'MANUAL_BANK_TRANSFER',
    bank_name VARCHAR(100),
    bank_account_number VARCHAR(50),
    bank_account_name VARCHAR(255),
    organizer_note TEXT,
    organizer_proof_url TEXT,
    organizer_transaction_ref VARCHAR(100),
    processed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 11. ENGAGEMENT & OPERATIONS
-- =========================================================

CREATE TABLE favorite_events (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY(user_id, event_id)
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    event_id UUID REFERENCES events(id),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    type notification_type_enum DEFAULT 'SYSTEM',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_feedbacks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id),
    user_id REFERENCES users(id),
    rating INT CHECK(rating BETWEEN 1 AND 5),
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);

CREATE TABLE ai_chat_histories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    conversation JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_staffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id),
    staff_id UUID REFERENCES users(id),
    staff_role VARCHAR(50),
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, staff_id)
);

CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id),
    organizer_id UUID NOT NULL REFERENCES organizers(id),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 12. SUBSCRIPTIONS (SaaS Plans)
-- =========================================================

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    price NUMERIC(12,2) NOT NULL,
    event_limit INT DEFAULT 0,
    staff_limit INT DEFAULT 0,
    analytics_enabled BOOLEAN DEFAULT FALSE,
    priority_support BOOLEAN DEFAULT FALSE,
    max_active_events INT DEFAULT 0,
    max_tickets_per_event INT DEFAULT 0,
    max_staff_per_event INT DEFAULT 0,
    max_ticket_types_per_event INT DEFAULT 0,
    max_promo_codes_per_event INT DEFAULT 0,
    platform_fee_rate NUMERIC(5,2) DEFAULT 0,
    promo_code_enabled BOOLEAN DEFAULT FALSE,
    seat_map_enabled BOOLEAN DEFAULT FALSE,
    manual_checkin_enabled BOOLEAN DEFAULT FALSE,
    attendee_export_enabled BOOLEAN DEFAULT FALSE,
    advanced_analytics_enabled BOOLEAN DEFAULT FALSE,
    ai_report_enabled BOOLEAN DEFAULT FALSE,
    custom_branding_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE organizer_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id UUID REFERENCES organizers(id),
    subscription_id UUID REFERENCES subscriptions(id),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    status subscription_status_enum DEFAULT 'ACTIVE',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 13. INDEXES
-- =========================================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_events_title ON events USING gin(to_tsvector('simple', title));
CREATE INDEX idx_events_title_trgm ON events USING gin(title gin_trgm_ops);
CREATE INDEX idx_events_organizer ON events(organizer_id);
CREATE INDEX idx_events_not_deleted ON events(id) WHERE deleted_at IS NULL;
CREATE INDEX idx_event_sessions_event ON event_sessions(event_id);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_tickets_code ON tickets(ticket_code);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_session_seats_status ON session_seats(event_session_id, status);
CREATE INDEX idx_venues_location ON venues(latitude, longitude);
CREATE UNIQUE INDEX uq_active_subscription ON organizer_subscriptions(organizer_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_payment_orders_order ON payment_orders(order_id);
CREATE INDEX idx_payment_orders_reference ON payment_orders(reference_type, reference_id);
CREATE INDEX idx_payment_orders_provider_order_code ON payment_orders(provider_order_code);
CREATE INDEX idx_payment_orders_status ON payment_orders(status);

-- =========================================================
-- 14. DEFAULT DATA & SEED
-- =========================================================

INSERT INTO roles(name) VALUES
('CUSTOMER'),
('ORGANIZER'),
('STAFF'),
('ADMIN')
ON CONFLICT (name) DO NOTHING;

INSERT INTO seat_types(name, color) VALUES
('VIP', '#FFD700'),
('STANDARD', '#3B82F6'),
('COUPLE', '#EC4899')
ON CONFLICT DO NOTHING;

INSERT INTO subscriptions(
    name, price, event_limit, staff_limit, analytics_enabled, priority_support,
    max_active_events, max_tickets_per_event, max_staff_per_event, max_ticket_types_per_event, max_promo_codes_per_event
) VALUES
('FREE', 0, 2, 5, FALSE, FALSE, 2, 100, 5, 3, 2),
('PRO', 499000, 20, 50, TRUE, FALSE, 20, 1000, 50, 10, 20),
('ENTERPRISE', 1999000, 9999, 9999, TRUE, TRUE, 9999, 99999, 9999, 99, 99)
ON CONFLICT DO NOTHING;

-- =========================================================
-- 15. TRIGGER FUNCTION & TRIGGERS
-- =========================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_venues_updated_at BEFORE UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_event_sessions_updated_at BEFORE UPDATE ON event_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_ticket_holds_updated_at BEFORE UPDATE ON ticket_holds FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_organizer_requests_updated_at BEFORE UPDATE ON organizer_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_organizers_updated_at BEFORE UPDATE ON organizers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_organizer_subscriptions_updated_at BEFORE UPDATE ON organizer_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_organizer_payment_channels_updated_at BEFORE UPDATE ON organizer_payment_channels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_payment_orders_updated_at BEFORE UPDATE ON payment_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
