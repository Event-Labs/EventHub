-- =========================================================
-- EVENTHUB DATABASE DESIGN
-- PostgreSQL Production-Level Schema
-- FULL FIXED & IMPROVED VERSION
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
    'CANCELLED'
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

CREATE TYPE payment_status_enum AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED'
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

CREATE TYPE task_status_enum AS ENUM (
    'TODO',
    'IN_PROGRESS',
    'DONE'
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

-- =========================================================
-- USERS & AUTH
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

CREATE TABLE organizer_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    user_id UUID NOT NULL REFERENCES users(id),

    organization_name VARCHAR(255) NOT NULL,
    organization_description TEXT,

    business_email VARCHAR(255),
    business_phone VARCHAR(20),

    status request_status_enum DEFAULT 'PENDING',

    review_note TEXT,

    reviewed_by UUID REFERENCES users(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- EVENT MANAGEMENT
-- =========================================================

CREATE TABLE event_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    name VARCHAR(100) NOT NULL,
    slug VARCHAR(150) UNIQUE NOT NULL,

    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    organizer_id UUID NOT NULL REFERENCES users(id),

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

    start_publish_at TIMESTAMPTZ,
    end_publish_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE event_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    reviewed_by UUID NOT NULL REFERENCES users(id),

    status approval_status_enum NOT NULL,

    review_note TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(event_id, reviewed_by)
);

-- =========================================================
-- VENUES
-- =========================================================

CREATE TABLE venues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    organizer_id UUID REFERENCES users(id),

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

    rows_count INT NOT NULL,
    cols_count INT NOT NULL,

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE seat_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    name VARCHAR(50) NOT NULL,
    color VARCHAR(20)
);

CREATE TABLE seats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    seat_map_id UUID NOT NULL REFERENCES seat_maps(id) ON DELETE CASCADE,

    seat_type_id UUID REFERENCES seat_types(id),

    row_label VARCHAR(10) NOT NULL,
    seat_number VARCHAR(10) NOT NULL,

    x_position INT,
    y_position INT,

    is_disabled BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(seat_map_id, row_label, seat_number)
);

-- =========================================================
-- EVENT SESSIONS
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

-- =========================================================
-- TICKET MANAGEMENT
-- =========================================================

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

-- seat belongs to ticket type
CREATE TABLE ticket_type_seats (
    ticket_type_id UUID REFERENCES ticket_types(id) ON DELETE CASCADE,

    seat_id UUID REFERENCES seats(id) ON DELETE CASCADE,

    PRIMARY KEY(ticket_type_id, seat_id)
);

-- =========================================================
-- PROMOTIONS
-- =========================================================

CREATE TABLE promo_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    organizer_id UUID REFERENCES users(id),

    event_id UUID REFERENCES events(id),

    code VARCHAR(50) UNIQUE NOT NULL,

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

-- =========================================================
-- PLATFORM FEES
-- =========================================================

CREATE TABLE platform_fee_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    name VARCHAR(100) NOT NULL,

    fee_type VARCHAR(20) NOT NULL,

    percentage_value NUMERIC(5,2) DEFAULT 0,

    fixed_amount NUMERIC(12,2) DEFAULT 0,

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- ORDERS
-- =========================================================

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    user_id UUID REFERENCES users(id),

    buyer_name VARCHAR(255),
    buyer_email VARCHAR(255),
    buyer_phone VARCHAR(30),

    created_by_staff_id UUID REFERENCES users(id),

    order_channel VARCHAR(20) DEFAULT 'ONLINE',

    promo_code_id UUID REFERENCES promo_codes(id),

    platform_fee_config_id UUID
    REFERENCES platform_fee_configs(id),

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

    event_session_id UUID NOT NULL
    REFERENCES event_sessions(id) ON DELETE CASCADE,

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

    CONSTRAINT chk_hold_seated_quantity
    CHECK (
        session_seat_id IS NULL
        OR quantity = 1
    )
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    order_id UUID NOT NULL
    REFERENCES orders(id) ON DELETE CASCADE,

    ticket_type_id UUID NOT NULL
    REFERENCES ticket_types(id),

    session_seat_id UUID
    REFERENCES session_seats(id),

    quantity INT NOT NULL DEFAULT 1,

    unit_price NUMERIC(12,2) NOT NULL,

    final_price NUMERIC(12,2) NOT NULL
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    order_id UUID NOT NULL REFERENCES orders(id),

    payment_method payment_method_enum NOT NULL,

    provider payment_provider_enum NOT NULL,

    transaction_code VARCHAR(255) UNIQUE,

    amount NUMERIC(12,2) NOT NULL,

    status payment_status_enum DEFAULT 'PENDING',

    paid_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
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

    checked_in_at TIMESTAMPTZ,

    checked_in_by UUID REFERENCES users(id),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- CHECK-IN
-- =========================================================

CREATE TABLE checkin_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    ticket_id UUID NOT NULL REFERENCES tickets(id),

    staff_id UUID REFERENCES users(id),

    method checkin_method_enum NOT NULL,

    checked_in_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_checkin_once UNIQUE(ticket_id)
);

-- =========================================================
-- ENGAGEMENT
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

    user_id UUID REFERENCES users(id),

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

-- =========================================================
-- OPERATIONS
-- =========================================================

CREATE TABLE event_staffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    event_id UUID REFERENCES events(id),

    staff_id UUID REFERENCES users(id),

    staff_role VARCHAR(50),

    assigned_by UUID REFERENCES users(id),

    assigned_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(event_id, staff_id)
);

CREATE TABLE staff_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    event_id UUID REFERENCES events(id),

    staff_id UUID REFERENCES users(id),

    title VARCHAR(255) NOT NULL,

    description TEXT,

    status task_status_enum DEFAULT 'TODO',

    created_by UUID REFERENCES users(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- SUBSCRIPTIONS
-- =========================================================

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    name VARCHAR(100) NOT NULL,
    description TEXT,

    price NUMERIC(12,2) NOT NULL,
    duration_days INT DEFAULT 30,

    event_limit INT DEFAULT 0,

    staff_limit INT DEFAULT 0,

    analytics_enabled BOOLEAN DEFAULT FALSE,

    priority_support BOOLEAN DEFAULT FALSE,
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE organizer_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    organizer_id UUID REFERENCES users(id),

    subscription_id UUID REFERENCES subscriptions(id),

    start_date TIMESTAMPTZ NOT NULL,

    end_date TIMESTAMPTZ NOT NULL,

    status subscription_status_enum DEFAULT 'ACTIVE',

    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subscription_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    organizer_subscription_id
    UUID REFERENCES organizer_subscriptions(id),

    provider payment_provider_enum,

    transaction_code VARCHAR(255),

    amount NUMERIC(12,2) NOT NULL,

    status payment_status_enum DEFAULT 'PENDING',

    paid_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- PROMOTION USAGE
-- =========================================================

CREATE TABLE promo_code_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    promo_code_id UUID REFERENCES promo_codes(id),

    user_id UUID REFERENCES users(id),

    order_id UUID REFERENCES orders(id),

    used_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- ANNOUNCEMENTS
-- =========================================================

CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    event_id UUID NOT NULL REFERENCES events(id),

    organizer_id UUID NOT NULL REFERENCES users(id),

    title VARCHAR(255) NOT NULL,

    content TEXT NOT NULL,

    sent_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- INDEXES
-- =========================================================

CREATE INDEX idx_users_email
ON users(email);

CREATE INDEX idx_events_title
ON events
USING gin(to_tsvector('simple', title));

CREATE INDEX idx_events_title_trgm
ON events
USING gin(title gin_trgm_ops);

CREATE INDEX idx_events_organizer
ON events(organizer_id);

CREATE INDEX idx_event_sessions_event
ON event_sessions(event_id);

CREATE INDEX idx_orders_user
ON orders(user_id);

CREATE INDEX idx_orders_status
ON orders(status);

CREATE INDEX idx_payments_order
ON payments(order_id);

CREATE INDEX idx_tickets_code
ON tickets(ticket_code);

CREATE INDEX idx_notifications_user
ON notifications(user_id);

CREATE INDEX idx_session_seats_status
ON session_seats(event_session_id, status);

CREATE INDEX idx_venues_location
ON venues(latitude, longitude);

CREATE INDEX idx_events_not_deleted
ON events(id)
WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_active_subscription
ON organizer_subscriptions(organizer_id)
WHERE status = 'ACTIVE';

-- =========================================================
-- DEFAULT DATA
-- =========================================================

INSERT INTO roles(name)
VALUES
('CUSTOMER'),
('ORGANIZER'),
('STAFF'),
('ADMIN');

INSERT INTO seat_types(name, color)
VALUES
('VIP', '#FFD700'),
('STANDARD', '#3B82F6'),
('COUPLE', '#EC4899');

INSERT INTO subscriptions(
    name,
    price,
    event_limit,
    staff_limit,
    analytics_enabled,
    priority_support
)
VALUES
(
    'FREE',
    0,
    2,
    5,
    FALSE,
    FALSE
),
(
    'PRO',
    499000,
    20,
    50,
    TRUE,
    FALSE
),
(
    'ENTERPRISE',
    1999000,
    9999,
    9999,
    TRUE,
    TRUE
);

-- =========================================================
-- TRIGGER FUNCTION
-- =========================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- TRIGGERS
-- =========================================================

CREATE TRIGGER trigger_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_events_updated_at
BEFORE UPDATE ON events
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_event_categories_updated_at
BEFORE UPDATE ON event_categories
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_venues_updated_at
BEFORE UPDATE ON venues
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_event_sessions_updated_at
BEFORE UPDATE ON event_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_staff_tasks_updated_at
BEFORE UPDATE ON staff_tasks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_ticket_holds_updated_at
BEFORE UPDATE ON ticket_holds
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_organizer_requests_updated_at
BEFORE UPDATE ON organizer_requests
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_organizer_subscriptions_updated_at
BEFORE UPDATE ON organizer_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_subscriptions_updated_at
BEFORE UPDATE ON subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =========================================================
-- END
-- =========================================================

