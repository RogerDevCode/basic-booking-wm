-- 016_normalize_clients_timezone.sql
-- Description: Drop legacy text column 'timezone' from clients table and replace with timezone_id FK

BEGIN;

ALTER TABLE clients DROP COLUMN IF EXISTS timezone;
ALTER TABLE clients ADD COLUMN timezone_id integer REFERENCES timezones(id);

COMMIT;
