-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.audit_logs (
  id bigint NOT NULL DEFAULT nextval('audit_logs_id_seq'::regclass),
  actor_id bigint,
  action text NOT NULL CHECK (char_length(action) <= 100),
  entity_type text NOT NULL CHECK (char_length(entity_type) <= 100),
  entity_id text NOT NULL CHECK (char_length(entity_id) <= 100),
  old_value jsonb,
  new_value jsonb,
  ip_address inet,
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 1000),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id, created_at),
  CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id)
);
CREATE TABLE public.audit_logs_default (
  id bigint NOT NULL DEFAULT nextval('audit_logs_id_seq'::regclass),
  actor_id bigint,
  action text NOT NULL CHECK (char_length(action) <= 100),
  entity_type text NOT NULL CHECK (char_length(entity_type) <= 100),
  entity_id text NOT NULL CHECK (char_length(entity_id) <= 100),
  old_value jsonb,
  new_value jsonb,
  ip_address inet,
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 1000),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_default_pkey PRIMARY KEY (id, created_at),
  CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id)
);
CREATE TABLE public.chat_messages (
  id bigint NOT NULL DEFAULT nextval('chat_messages_id_seq'::regclass),
  session_id uuid NOT NULL,
  sender text NOT NULL CHECK (sender = ANY (ARRAY['user'::text, 'bot'::text, 'system'::text])),
  message text NOT NULL CHECK (char_length(message) <= 12000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id, created_at),
  CONSTRAINT chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id)
);
CREATE TABLE public.chat_messages_default (
  id bigint NOT NULL DEFAULT nextval('chat_messages_id_seq'::regclass),
  session_id uuid NOT NULL,
  sender text NOT NULL CHECK (sender = ANY (ARRAY['user'::text, 'bot'::text, 'system'::text])),
  message text NOT NULL CHECK (char_length(message) <= 12000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_default_pkey PRIMARY KEY (id, created_at),
  CONSTRAINT chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id)
);
CREATE TABLE public.chat_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id bigint,
  guest_token text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  CONSTRAINT chat_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT chat_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.check_ins (
  id bigint NOT NULL DEFAULT nextval('check_ins_id_seq'::regclass),
  ticket_id uuid NOT NULL,
  event_id bigint NOT NULL,
  staff_user_id bigint,
  check_in_method USER-DEFINED NOT NULL,
  checked_at timestamp with time zone NOT NULL DEFAULT now(),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  CONSTRAINT check_ins_pkey PRIMARY KEY (id, event_id),
  CONSTRAINT check_ins_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT check_ins_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES public.users(id),
  CONSTRAINT check_ins_ticket_event_fk FOREIGN KEY (ticket_id) REFERENCES public.tickets(id),
  CONSTRAINT check_ins_ticket_event_fk FOREIGN KEY (event_id) REFERENCES public.tickets(id),
  CONSTRAINT check_ins_ticket_event_fk FOREIGN KEY (ticket_id) REFERENCES public.tickets(event_id),
  CONSTRAINT check_ins_ticket_event_fk FOREIGN KEY (event_id) REFERENCES public.tickets(event_id)
);
CREATE TABLE public.check_ins_default (
  id bigint NOT NULL DEFAULT nextval('check_ins_id_seq'::regclass),
  ticket_id uuid NOT NULL,
  event_id bigint NOT NULL,
  staff_user_id bigint,
  check_in_method USER-DEFINED NOT NULL,
  checked_at timestamp with time zone NOT NULL DEFAULT now(),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  CONSTRAINT check_ins_default_pkey PRIMARY KEY (id, event_id),
  CONSTRAINT check_ins_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT check_ins_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES public.users(id),
  CONSTRAINT check_ins_ticket_event_fk FOREIGN KEY (ticket_id) REFERENCES public.tickets(id),
  CONSTRAINT check_ins_ticket_event_fk FOREIGN KEY (event_id) REFERENCES public.tickets(id),
  CONSTRAINT check_ins_ticket_event_fk FOREIGN KEY (ticket_id) REFERENCES public.tickets(event_id),
  CONSTRAINT check_ins_ticket_event_fk FOREIGN KEY (event_id) REFERENCES public.tickets(event_id)
);
CREATE TABLE public.email_verification_tokens (
  id bigint NOT NULL DEFAULT nextval('email_verification_tokens_id_seq'::regclass),
  user_id bigint NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.event_analytics_snapshots (
  id bigint NOT NULL DEFAULT nextval('event_analytics_snapshots_id_seq'::regclass),
  event_id bigint NOT NULL,
  snapshot_date date NOT NULL,
  total_orders integer NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
  paid_orders integer NOT NULL DEFAULT 0 CHECK (paid_orders >= 0),
  tickets_sold integer NOT NULL DEFAULT 0 CHECK (tickets_sold >= 0),
  tickets_checked_in integer NOT NULL DEFAULT 0 CHECK (tickets_checked_in >= 0),
  gross_revenue numeric NOT NULL DEFAULT 0 CHECK (gross_revenue >= 0::numeric),
  refund_amount numeric NOT NULL DEFAULT 0 CHECK (refund_amount >= 0::numeric),
  platform_fee numeric NOT NULL DEFAULT 0 CHECK (platform_fee >= 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_analytics_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT event_analytics_snapshots_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id)
);
CREATE TABLE public.event_announcements (
  id bigint NOT NULL DEFAULT nextval('event_announcements_id_seq'::regclass),
  event_id bigint NOT NULL,
  organizer_id bigint NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  channel USER-DEFINED NOT NULL DEFAULT 'both'::notification_channel,
  status USER-DEFINED NOT NULL DEFAULT 'draft'::announcement_status,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_announcements_pkey PRIMARY KEY (id),
  CONSTRAINT event_announcements_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT event_announcements_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id)
);
CREATE TABLE public.event_approval_logs (
  id bigint NOT NULL DEFAULT nextval('event_approval_logs_id_seq'::regclass),
  event_id bigint NOT NULL,
  action text NOT NULL CHECK (action = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text, 'hidden'::text, 'republished'::text])),
  reason text,
  performed_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_approval_logs_pkey PRIMARY KEY (id),
  CONSTRAINT event_approval_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT event_approval_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id)
);
CREATE TABLE public.event_categories (
  id bigint NOT NULL DEFAULT nextval('event_categories_id_seq'::regclass),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT event_categories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.event_seats (
  id bigint NOT NULL DEFAULT nextval('event_seats_id_seq'::regclass),
  event_id bigint NOT NULL,
  seat_template_id bigint,
  zone text,
  row_label text,
  seat_number text NOT NULL,
  seat_type text NOT NULL DEFAULT 'standard'::text,
  status USER-DEFINED NOT NULL DEFAULT 'available'::seat_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_seats_pkey PRIMARY KEY (id),
  CONSTRAINT event_seats_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT event_seats_seat_template_id_fkey FOREIGN KEY (seat_template_id) REFERENCES public.seat_templates(id)
);
CREATE TABLE public.event_staff_assignments (
  id bigint NOT NULL DEFAULT nextval('event_staff_assignments_id_seq'::regclass),
  event_id bigint NOT NULL,
  organizer_id bigint NOT NULL,
  staff_user_id bigint NOT NULL,
  role_in_event text NOT NULL CHECK (role_in_event = ANY (ARRAY['check_in'::text, 'support'::text, 'sales'::text, 'manager'::text])),
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'removed'::text, 'expired'::text])),
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  assigned_by bigint,
  CONSTRAINT event_staff_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT event_staff_assignments_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT event_staff_assignments_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id),
  CONSTRAINT event_staff_assignments_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES public.users(id),
  CONSTRAINT event_staff_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id)
);
CREATE TABLE public.events (
  id bigint NOT NULL DEFAULT nextval('events_id_seq'::regclass),
  organizer_id bigint NOT NULL,
  category_id bigint,
  venue_id bigint,
  seat_map_id bigint,
  name text NOT NULL,
  description text,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone NOT NULL,
  location text,
  image_url text,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  status USER-DEFINED NOT NULL DEFAULT 'draft'::event_status,
  rejection_reason text,
  published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  search_vector tsvector,
  CONSTRAINT events_pkey PRIMARY KEY (id),
  CONSTRAINT events_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id),
  CONSTRAINT events_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.event_categories(id),
  CONSTRAINT events_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id),
  CONSTRAINT events_seat_map_id_fkey FOREIGN KEY (seat_map_id) REFERENCES public.seat_maps(id)
);
CREATE TABLE public.favorites (
  user_id bigint NOT NULL,
  event_id bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT favorites_pkey PRIMARY KEY (user_id, event_id),
  CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT favorites_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id)
);
CREATE TABLE public.feedback (
  id bigint NOT NULL DEFAULT nextval('feedback_id_seq'::regclass),
  event_id bigint NOT NULL,
  user_id bigint NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 4000),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT feedback_pkey PRIMARY KEY (id),
  CONSTRAINT feedback_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.notifications (
  id bigint NOT NULL DEFAULT nextval('notifications_id_seq'::regclass),
  user_id bigint NOT NULL,
  title text NOT NULL CHECK (char_length(title) <= 200),
  message text CHECK (message IS NULL OR char_length(message) <= 4000),
  type USER-DEFINED NOT NULL DEFAULT 'system'::notification_type,
  channel USER-DEFINED NOT NULL DEFAULT 'in_app'::notification_channel,
  is_read boolean NOT NULL DEFAULT false,
  related_event_id bigint,
  related_order_id bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  CONSTRAINT notifications_pkey PRIMARY KEY (id, created_at),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT notifications_related_event_id_fkey FOREIGN KEY (related_event_id) REFERENCES public.events(id),
  CONSTRAINT notifications_related_order_id_fkey FOREIGN KEY (related_order_id) REFERENCES public.orders(id)
);
CREATE TABLE public.notifications_default (
  id bigint NOT NULL DEFAULT nextval('notifications_id_seq'::regclass),
  user_id bigint NOT NULL,
  title text NOT NULL CHECK (char_length(title) <= 200),
  message text CHECK (message IS NULL OR char_length(message) <= 4000),
  type USER-DEFINED NOT NULL DEFAULT 'system'::notification_type,
  channel USER-DEFINED NOT NULL DEFAULT 'in_app'::notification_channel,
  is_read boolean NOT NULL DEFAULT false,
  related_event_id bigint,
  related_order_id bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  CONSTRAINT notifications_default_pkey PRIMARY KEY (id, created_at),
  CONSTRAINT notifications_related_event_id_fkey FOREIGN KEY (related_event_id) REFERENCES public.events(id),
  CONSTRAINT notifications_related_order_id_fkey FOREIGN KEY (related_order_id) REFERENCES public.orders(id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.order_items (
  id bigint NOT NULL DEFAULT nextval('order_items_id_seq'::regclass),
  order_id bigint NOT NULL,
  ticket_type_id bigint NOT NULL,
  seat_id bigint,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0::numeric),
  subtotal numeric NOT NULL CHECK (subtotal >= 0::numeric),
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_items_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id),
  CONSTRAINT order_items_seat_id_fkey FOREIGN KEY (seat_id) REFERENCES public.event_seats(id)
);
CREATE TABLE public.orders (
  id bigint NOT NULL DEFAULT nextval('orders_id_seq'::regclass),
  customer_id bigint,
  event_id bigint NOT NULL,
  reservation_id uuid,
  sales_channel USER-DEFINED NOT NULL DEFAULT 'online'::sales_channel,
  created_by_staff_id bigint,
  buyer_name text CHECK (buyer_name IS NULL OR char_length(buyer_name) <= 150),
  buyer_email text CHECK (buyer_email IS NULL OR char_length(buyer_email) <= 254),
  buyer_phone text CHECK (buyer_phone IS NULL OR char_length(buyer_phone) <= 20),
  total_amount numeric NOT NULL DEFAULT 0 CHECK (total_amount >= 0::numeric),
  discount_amount numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0::numeric),
  platform_fee_rate numeric CHECK (platform_fee_rate IS NULL OR platform_fee_rate >= 0::numeric),
  platform_fee_amount numeric NOT NULL DEFAULT 0 CHECK (platform_fee_amount >= 0::numeric),
  final_amount numeric NOT NULL DEFAULT 0 CHECK (final_amount >= 0::numeric),
  currency text NOT NULL DEFAULT 'VND'::text CHECK (char_length(currency) >= 3 AND char_length(currency) <= 10),
  status USER-DEFINED NOT NULL DEFAULT 'pending'::order_status,
  payment_status USER-DEFINED NOT NULL DEFAULT 'pending'::payment_status,
  expires_at timestamp with time zone,
  confirmed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id),
  CONSTRAINT orders_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT orders_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES public.ticket_reservations(id),
  CONSTRAINT orders_created_by_staff_id_fkey FOREIGN KEY (created_by_staff_id) REFERENCES public.users(id)
);
CREATE TABLE public.organizer_bank_accounts (
  id bigint NOT NULL DEFAULT nextval('organizer_bank_accounts_id_seq'::regclass),
  organizer_id bigint NOT NULL,
  bank_name text NOT NULL,
  account_holder_name text NOT NULL,
  account_number_masked text NOT NULL,
  account_token text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT organizer_bank_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT organizer_bank_accounts_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id)
);
CREATE TABLE public.organizer_profiles (
  user_id bigint NOT NULL,
  organization_name text NOT NULL,
  description text,
  website_url text,
  logo_url text,
  verified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT organizer_profiles_pkey PRIMARY KEY (user_id),
  CONSTRAINT organizer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.organizer_requests (
  id bigint NOT NULL DEFAULT nextval('organizer_requests_id_seq'::regclass),
  user_id bigint NOT NULL,
  organization_name text NOT NULL,
  business_email text,
  business_phone text,
  description text,
  document_url text,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::request_status,
  admin_remarks text,
  reviewed_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  CONSTRAINT organizer_requests_pkey PRIMARY KEY (id),
  CONSTRAINT organizer_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT organizer_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id)
);
CREATE TABLE public.organizer_staffs (
  organizer_id bigint NOT NULL,
  staff_user_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['invited'::text, 'active'::text, 'removed'::text, 'rejected'::text])),
  invited_at timestamp with time zone NOT NULL DEFAULT now(),
  accepted_at timestamp with time zone,
  removed_at timestamp with time zone,
  created_by bigint,
  CONSTRAINT organizer_staffs_pkey PRIMARY KEY (organizer_id, staff_user_id),
  CONSTRAINT organizer_staffs_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES public.users(id),
  CONSTRAINT organizer_staffs_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id),
  CONSTRAINT organizer_staffs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.password_resets (
  id bigint NOT NULL DEFAULT nextval('password_resets_id_seq'::regclass),
  user_id bigint NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT password_resets_pkey PRIMARY KEY (id),
  CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.payment_webhook_logs (
  id bigint NOT NULL DEFAULT nextval('payment_webhook_logs_id_seq'::regclass),
  provider text NOT NULL,
  event_type text,
  transaction_id text,
  order_id bigint,
  payload jsonb NOT NULL,
  signature text,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  processing_error text,
  CONSTRAINT payment_webhook_logs_pkey PRIMARY KEY (id),
  CONSTRAINT payment_webhook_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id)
);
CREATE TABLE public.payments (
  id bigint NOT NULL DEFAULT nextval('payments_id_seq'::regclass),
  order_id bigint NOT NULL,
  provider text NOT NULL,
  payment_method text NOT NULL,
  transaction_id text,
  provider_order_id text,
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  currency text NOT NULL DEFAULT 'VND'::text,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::payment_status,
  failure_reason text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id)
);
CREATE TABLE public.payout_requests (
  id bigint NOT NULL DEFAULT nextval('payout_requests_id_seq'::regclass),
  organizer_id bigint NOT NULL,
  event_id bigint,
  settlement_id bigint,
  bank_account_id bigint,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  status USER-DEFINED NOT NULL DEFAULT 'pending'::payout_status,
  admin_remarks text,
  reviewed_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  paid_at timestamp with time zone,
  CONSTRAINT payout_requests_pkey PRIMARY KEY (id),
  CONSTRAINT payout_requests_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id),
  CONSTRAINT payout_requests_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT payout_requests_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.settlements(id),
  CONSTRAINT payout_requests_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.organizer_bank_accounts(id),
  CONSTRAINT payout_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id)
);
CREATE TABLE public.platform_config (
  key text NOT NULL,
  value jsonb NOT NULL,
  description text,
  updated_by bigint,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT platform_config_pkey PRIMARY KEY (key),
  CONSTRAINT platform_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
CREATE TABLE public.platform_fee_rules (
  id bigint NOT NULL DEFAULT nextval('platform_fee_rules_id_seq'::regclass),
  name text NOT NULL,
  fee_type USER-DEFINED NOT NULL,
  fee_value numeric NOT NULL CHECK (fee_value >= 0::numeric),
  effective_from timestamp with time zone NOT NULL,
  effective_to timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT platform_fee_rules_pkey PRIMARY KEY (id),
  CONSTRAINT platform_fee_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.promo_codes (
  id bigint NOT NULL DEFAULT nextval('promo_codes_id_seq'::regclass),
  organizer_id bigint NOT NULL,
  event_id bigint,
  code text NOT NULL,
  discount_type USER-DEFINED NOT NULL,
  discount_value numeric NOT NULL CHECK (discount_value > 0::numeric),
  max_uses integer CHECK (max_uses > 0),
  max_uses_per_user integer CHECK (max_uses_per_user > 0),
  min_order_amount numeric NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0::numeric),
  valid_from timestamp with time zone NOT NULL,
  valid_to timestamp with time zone NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT promo_codes_pkey PRIMARY KEY (id),
  CONSTRAINT promo_codes_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id),
  CONSTRAINT promo_codes_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id)
);
CREATE TABLE public.promotion_usages (
  id bigint NOT NULL DEFAULT nextval('promotion_usages_id_seq'::regclass),
  promo_code_id bigint NOT NULL,
  order_id bigint NOT NULL,
  user_id bigint,
  buyer_email text,
  discount_amount numeric NOT NULL CHECK (discount_amount >= 0::numeric),
  used_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT promotion_usages_pkey PRIMARY KEY (id),
  CONSTRAINT promotion_usages_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES public.promo_codes(id),
  CONSTRAINT promotion_usages_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT promotion_usages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.refund_logs (
  id bigint NOT NULL DEFAULT nextval('refund_logs_id_seq'::regclass),
  refund_id bigint NOT NULL,
  old_status USER-DEFINED,
  new_status USER-DEFINED NOT NULL,
  note text,
  performed_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT refund_logs_pkey PRIMARY KEY (id),
  CONSTRAINT refund_logs_refund_id_fkey FOREIGN KEY (refund_id) REFERENCES public.refunds(id),
  CONSTRAINT refund_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id)
);
CREATE TABLE public.refunds (
  id bigint NOT NULL DEFAULT nextval('refunds_id_seq'::regclass),
  order_id bigint,
  ticket_id uuid,
  requested_by bigint,
  buyer_email text,
  reason text,
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  status USER-DEFINED NOT NULL DEFAULT 'pending'::refund_status,
  admin_remarks text,
  processed_by bigint,
  provider text,
  provider_refund_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  CONSTRAINT refunds_pkey PRIMARY KEY (id),
  CONSTRAINT refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT refunds_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id),
  CONSTRAINT refunds_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id),
  CONSTRAINT refunds_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES public.users(id)
);
CREATE TABLE public.seat_maps (
  id bigint NOT NULL DEFAULT nextval('seat_maps_id_seq'::regclass),
  organizer_id bigint NOT NULL,
  venue_id bigint NOT NULL,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT seat_maps_pkey PRIMARY KEY (id),
  CONSTRAINT seat_maps_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id),
  CONSTRAINT seat_maps_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id)
);
CREATE TABLE public.seat_templates (
  id bigint NOT NULL DEFAULT nextval('seat_templates_id_seq'::regclass),
  seat_map_id bigint NOT NULL,
  zone text,
  row_label text,
  seat_number text NOT NULL,
  seat_type text NOT NULL DEFAULT 'standard'::text,
  pos_x numeric,
  pos_y numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT seat_templates_pkey PRIMARY KEY (id),
  CONSTRAINT seat_templates_seat_map_id_fkey FOREIGN KEY (seat_map_id) REFERENCES public.seat_maps(id)
);
CREATE TABLE public.settlement_items (
  id bigint NOT NULL DEFAULT nextval('settlement_items_id_seq'::regclass),
  settlement_id bigint NOT NULL,
  order_id bigint,
  payment_id bigint,
  refund_id bigint,
  gross_amount numeric NOT NULL DEFAULT 0 CHECK (gross_amount >= 0::numeric),
  refund_amount numeric NOT NULL DEFAULT 0 CHECK (refund_amount >= 0::numeric),
  fee_amount numeric NOT NULL DEFAULT 0 CHECK (fee_amount >= 0::numeric),
  net_amount numeric NOT NULL DEFAULT 0 CHECK (net_amount >= 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT settlement_items_pkey PRIMARY KEY (id),
  CONSTRAINT settlement_items_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.settlements(id),
  CONSTRAINT settlement_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT settlement_items_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id),
  CONSTRAINT settlement_items_refund_id_fkey FOREIGN KEY (refund_id) REFERENCES public.refunds(id)
);
CREATE TABLE public.settlements (
  id bigint NOT NULL DEFAULT nextval('settlements_id_seq'::regclass),
  event_id bigint NOT NULL UNIQUE,
  organizer_id bigint NOT NULL,
  total_revenue numeric NOT NULL DEFAULT 0 CHECK (total_revenue >= 0::numeric),
  total_refund numeric NOT NULL DEFAULT 0 CHECK (total_refund >= 0::numeric),
  platform_fee numeric NOT NULL DEFAULT 0 CHECK (platform_fee >= 0::numeric),
  net_amount numeric NOT NULL DEFAULT 0 CHECK (net_amount >= 0::numeric),
  status USER-DEFINED NOT NULL DEFAULT 'pending'::settlement_status,
  verified_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  verified_at timestamp with time zone,
  CONSTRAINT settlements_pkey PRIMARY KEY (id),
  CONSTRAINT settlements_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT settlements_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id),
  CONSTRAINT settlements_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id)
);
CREATE TABLE public.staff_tasks (
  id bigint NOT NULL DEFAULT nextval('staff_tasks_id_seq'::regclass),
  event_id bigint NOT NULL,
  staff_user_id bigint NOT NULL,
  title text NOT NULL,
  description text,
  priority USER-DEFINED NOT NULL DEFAULT 'medium'::task_priority,
  status USER-DEFINED NOT NULL DEFAULT 'not_started'::task_status,
  deadline timestamp with time zone,
  created_by bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT staff_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT staff_tasks_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT staff_tasks_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES public.users(id),
  CONSTRAINT staff_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.ticket_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id bigint,
  event_id bigint NOT NULL,
  ticket_type_id bigint NOT NULL,
  seat_id bigint,
  quantity integer NOT NULL CHECK (quantity > 0),
  status USER-DEFINED NOT NULL DEFAULT 'active'::reservation_status,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  converted_at timestamp with time zone,
  CONSTRAINT ticket_reservations_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_reservations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT ticket_reservations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT ticket_reservations_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id),
  CONSTRAINT ticket_reservations_seat_id_fkey FOREIGN KEY (seat_id) REFERENCES public.event_seats(id)
);
CREATE TABLE public.ticket_scan_logs (
  id bigint NOT NULL DEFAULT nextval('ticket_scan_logs_id_seq'::regclass),
  event_id bigint NOT NULL,
  ticket_id uuid,
  scanned_code text NOT NULL CHECK (char_length(scanned_code) <= 100),
  staff_user_id bigint,
  result USER-DEFINED NOT NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  scanned_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ticket_scan_logs_pkey PRIMARY KEY (id, event_id),
  CONSTRAINT ticket_scan_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT ticket_scan_logs_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES public.users(id),
  CONSTRAINT ticket_scan_logs_ticket_event_fk FOREIGN KEY (event_id) REFERENCES public.tickets(id),
  CONSTRAINT ticket_scan_logs_ticket_event_fk FOREIGN KEY (ticket_id) REFERENCES public.tickets(id),
  CONSTRAINT ticket_scan_logs_ticket_event_fk FOREIGN KEY (event_id) REFERENCES public.tickets(event_id),
  CONSTRAINT ticket_scan_logs_ticket_event_fk FOREIGN KEY (ticket_id) REFERENCES public.tickets(event_id)
);
CREATE TABLE public.ticket_scan_logs_default (
  id bigint NOT NULL DEFAULT nextval('ticket_scan_logs_id_seq'::regclass),
  event_id bigint NOT NULL,
  ticket_id uuid,
  scanned_code text NOT NULL CHECK (char_length(scanned_code) <= 100),
  staff_user_id bigint,
  result USER-DEFINED NOT NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  scanned_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ticket_scan_logs_default_pkey PRIMARY KEY (id, event_id),
  CONSTRAINT ticket_scan_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT ticket_scan_logs_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES public.users(id),
  CONSTRAINT ticket_scan_logs_ticket_event_fk FOREIGN KEY (event_id) REFERENCES public.tickets(id),
  CONSTRAINT ticket_scan_logs_ticket_event_fk FOREIGN KEY (ticket_id) REFERENCES public.tickets(id),
  CONSTRAINT ticket_scan_logs_ticket_event_fk FOREIGN KEY (event_id) REFERENCES public.tickets(event_id),
  CONSTRAINT ticket_scan_logs_ticket_event_fk FOREIGN KEY (ticket_id) REFERENCES public.tickets(event_id)
);
CREATE TABLE public.ticket_types (
  id bigint NOT NULL DEFAULT nextval('ticket_types_id_seq'::regclass),
  event_id bigint NOT NULL,
  name text NOT NULL,
  description text,
  price numeric NOT NULL CHECK (price >= 0::numeric),
  quantity integer NOT NULL CHECK (quantity >= 0),
  max_per_order integer NOT NULL DEFAULT 10 CHECK (max_per_order > 0),
  sales_start timestamp with time zone,
  sales_end timestamp with time zone,
  status USER-DEFINED NOT NULL DEFAULT 'active'::ticket_type_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT ticket_types_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_types_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id)
);
CREATE TABLE public.tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id bigint NOT NULL,
  order_item_id bigint,
  event_id bigint NOT NULL,
  ticket_type_id bigint NOT NULL,
  seat_id bigint UNIQUE,
  attendee_name text CHECK (attendee_name IS NULL OR char_length(attendee_name) <= 150),
  attendee_email text CHECK (attendee_email IS NULL OR char_length(attendee_email) <= 254),
  unique_code text NOT NULL UNIQUE CHECK (char_length(unique_code) <= 80),
  qr_code text CHECK (qr_code IS NULL OR char_length(qr_code) <= 2048),
  status USER-DEFINED NOT NULL DEFAULT 'valid'::ticket_status,
  issued_at timestamp with time zone NOT NULL DEFAULT now(),
  used_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  refunded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tickets_pkey PRIMARY KEY (id),
  CONSTRAINT tickets_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT tickets_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id),
  CONSTRAINT tickets_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT tickets_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id),
  CONSTRAINT tickets_seat_id_fkey FOREIGN KEY (seat_id) REFERENCES public.event_seats(id)
);
CREATE TABLE public.user_roles (
  user_id bigint NOT NULL,
  role USER-DEFINED NOT NULL,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  assigned_by bigint,
  CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id)
);

CREATE TABLE public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id bigint NOT NULL,
  refresh_token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip_address inet,
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id bigint NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  email text NOT NULL CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'::text),
  password_hash text,
  full_name text NOT NULL CHECK (char_length(full_name) <= 150),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 20),
  avatar_url text CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 2048),
  google_id text CHECK (google_id IS NULL OR char_length(google_id) <= 255),
  email_verified boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.venues (
  id bigint NOT NULL DEFAULT nextval('venues_id_seq'::regclass),
  organizer_id bigint NOT NULL,
  name text NOT NULL,
  address text,
  city text,
  capacity integer CHECK (capacity > 0),
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT venues_pkey PRIMARY KEY (id),
  CONSTRAINT venues_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id)
);