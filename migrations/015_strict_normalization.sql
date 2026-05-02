-- 015_strict_normalization.sql
-- Description: Drop legacy text columns from providers table for strict normalization

BEGIN;

ALTER TABLE providers DROP COLUMN IF EXISTS specialty;
ALTER TABLE providers DROP COLUMN IF EXISTS timezone;

COMMIT;
