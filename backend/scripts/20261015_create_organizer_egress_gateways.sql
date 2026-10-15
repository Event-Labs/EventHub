-- Migration: Create organizer_egress_gateways table
-- Description: Manages dedicated outbound egress gateways and static IP mappings for organizers

CREATE TABLE IF NOT EXISTS organizer_egress_gateways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID NOT NULL UNIQUE REFERENCES organizers(id) ON DELETE CASCADE,
    gateway_type VARCHAR(50) NOT NULL DEFAULT 'MOCK', -- 'MOCK', 'STATIC_PROXY', 'DEDICATED_NAT'
    egress_ip VARCHAR(45) NOT NULL,
    proxy_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_WHITELIST', -- 'ACTIVE', 'PENDING_WHITELIST', 'DISABLED', 'ERROR'
    is_mock BOOLEAN NOT NULL DEFAULT true,
    last_verified_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_organizer_egress_ip UNIQUE (egress_ip)
);

CREATE INDEX IF NOT EXISTS idx_organizer_egress_org_id ON organizer_egress_gateways(organizer_id);
