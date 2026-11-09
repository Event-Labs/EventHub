-- Migration: Add locale column to users and orders for bilingual localization
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'vi';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'vi';

