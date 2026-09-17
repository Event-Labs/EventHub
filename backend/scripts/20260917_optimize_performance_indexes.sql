-- =========================================================
-- HIGH PERFORMANCE INDEXES MIGRATION
-- Optimizes Foreign Keys, Joins, and Filtering Lookups
-- =========================================================

-- 1. Ticket Types & Sessions
CREATE INDEX IF NOT EXISTS idx_ticket_types_session ON ticket_types(event_session_id);
CREATE INDEX IF NOT EXISTS idx_event_sessions_venue ON event_sessions(venue_id);
CREATE INDEX IF NOT EXISTS idx_event_sessions_event_time ON event_sessions(event_id, start_time);

-- 2. Venues & Seat Maps & Seats
CREATE INDEX IF NOT EXISTS idx_seats_seat_map ON seats(seat_map_id);
CREATE INDEX IF NOT EXISTS idx_seats_zone ON seats(zone_id);
CREATE INDEX IF NOT EXISTS idx_seat_zones_map ON seat_zones(seat_map_id);
CREATE INDEX IF NOT EXISTS idx_session_seats_seat ON session_seats(seat_id);
CREATE INDEX IF NOT EXISTS idx_session_seats_session ON session_seats(event_session_id);
CREATE INDEX IF NOT EXISTS idx_ticket_type_seats_seat ON ticket_type_seats(seat_id);

-- 3. Order Items & Orders
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ticket_type ON order_items(ticket_type_id);

-- 4. Tickets
CREATE INDEX IF NOT EXISTS idx_tickets_order_item ON tickets(order_item_id);
CREATE INDEX IF NOT EXISTS idx_tickets_session ON tickets(event_session_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets(ticket_type_id);

-- 5. Ticket Holds (Fast availability and expiration checks)
CREATE INDEX IF NOT EXISTS idx_ticket_holds_user_status ON ticket_holds(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_holds_type ON ticket_holds(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_ticket_holds_active_expires ON ticket_holds(expires_at) WHERE status = 'ACTIVE';

-- 6. Events Listing & Filtering
CREATE INDEX IF NOT EXISTS idx_events_public_lookup ON events(category_id, status, visibility, approval_status) WHERE deleted_at IS NULL;
