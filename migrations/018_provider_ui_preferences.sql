-- Migration: 018_provider_ui_preferences.sql
-- Purpose: Add ui_preferences JSONB to providers table to externalize UI limits

ALTER TABLE providers ADD COLUMN IF NOT EXISTS ui_preferences JSONB DEFAULT '{"max_slots_displayed": 10, "max_bookings_per_query": 20}'::jsonb;
