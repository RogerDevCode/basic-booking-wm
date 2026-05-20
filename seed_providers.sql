-- Seed: 5 providers across 3 specialties (Chilean names, real-looking data)
-- Run: psql -h localhost -U windmill -d windmill -f seed_providers.sql

BEGIN;

-- Specialty IDs (from existing data)
-- Cardiología:    94b7d3f1-0aab-4c96-9889-c124a8191ae7
-- Pediatría:      873ebe8d-45fa-4c74-9b6e-a0ea1125b949
-- Traumatología:  813c6ca2-1cca-4231-b8d4-890504225135

-- Honorific IDs
-- Dr.:  0ad63ec7-4810-481d-8314-a3be8594babf
-- Dra.: 1c4b57ee-b779-42be-87d3-50dd1f9e97f6

-- Timezone: America/Santiago = 2
-- Region: Metropolitana = 13
-- Commune: Santiago = 13101

-- ── Provider 1: Dr. Ricardo Valenzuela Fuentes (Cardiología)
INSERT INTO providers (
    provider_id, name, email, phone, phone_app, phone_contact,
    specialty_id, honorific_id, timezone_id, region_id, commune_id,
    address_street, address_number, address_complement, address_sector,
    is_active, gcal_calendar_id, ui_preferences
) VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    'Ricardo Valenzuela Fuentes',
    'r.valenzuela@centromedico.cl',
    '+56998765432',
    '+56998765432',
    '+56998765432',
    '94b7d3f1-0aab-4c96-9889-c124a8191ae7',
    '0ad63ec7-4810-481d-8314-a3be8594babf',
    2, 13, 13101,
    'Avenida Providencia', '1234', 'Oficina 501', 'Providencia',
    true, 'primary',
    '{"max_slots_displayed": 10, "max_bookings_per_query": 20}'::jsonb
);

INSERT INTO services (
    service_id, provider_id, name, duration_minutes, buffer_minutes,
    price_cents, currency, is_active, description
) VALUES (
    'b1b2c3d4-e5f6-7890-abcd-ef1234567001',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    'Consulta Cardiología',
    30, 10, 45000, 'CLP', true,
    'Consulta general de cardiología: evaluación, diagnóstico y tratamiento.'
);

-- ── Provider 2: Dra. Carolina Muñoz Soto (Cardiología)
INSERT INTO providers (
    provider_id, name, email, phone, phone_app, phone_contact,
    specialty_id, honorific_id, timezone_id, region_id, commune_id,
    address_street, address_number, address_complement, address_sector,
    is_active, gcal_calendar_id, ui_preferences
) VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567002',
    'Carolina Muñoz Soto',
    'c.munoz@centromedico.cl',
    '+56987654321',
    '+56987654321',
    '+56987654321',
    '94b7d3f1-0aab-4c96-9889-c124a8191ae7',
    '1c4b57ee-b779-42be-87d3-50dd1f9e97f6',
    2, 13, 13101,
    'Avenida Libertador Bernardo OHiggins', '2350', 'Piso 3', 'Santiago Centro',
    true, 'primary',
    '{"max_slots_displayed": 10, "max_bookings_per_query": 20}'::jsonb
);

INSERT INTO services (
    service_id, provider_id, name, duration_minutes, buffer_minutes,
    price_cents, currency, is_active, description
) VALUES (
    'b1b2c3d4-e5f6-7890-abcd-ef1234567002',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567002',
    'Consulta Cardiología',
    30, 10, 45000, 'CLP', true,
    'Consulta general de cardiología: evaluación, diagnóstico y tratamiento.'
);

-- ── Provider 3: Dr. Felipe Aravena Contreras (Pediatría)
INSERT INTO providers (
    provider_id, name, email, phone, phone_app, phone_contact,
    specialty_id, honorific_id, timezone_id, region_id, commune_id,
    address_street, address_number, address_complement, address_sector,
    is_active, gcal_calendar_id, ui_preferences
) VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567003',
    'Felipe Aravena Contreras',
    'f.aravena@centromedico.cl',
    '+56976543210',
    '+56976543210',
    '+56976543210',
    '873ebe8d-45fa-4c74-9b6e-a0ea1125b949',
    '0ad63ec7-4810-481d-8314-a3be8594babf',
    2, 13, 13101,
    'Calle San Martín', '456', 'Consultorio 12', 'Las Condes',
    true, 'primary',
    '{"max_slots_displayed": 10, "max_bookings_per_query": 20}'::jsonb
);

INSERT INTO services (
    service_id, provider_id, name, duration_minutes, buffer_minutes,
    price_cents, currency, is_active, description
) VALUES (
    'b1b2c3d4-e5f6-7890-abcd-ef1234567003',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567003',
    'Consulta Pediatría',
    30, 10, 35000, 'CLP', true,
    'Consulta pediátrica: control de niño sano, vacunación, enfermedades infantiles.'
);

-- ── Provider 4: Dra. Valentina Espinoza Rojas (Pediatría)
INSERT INTO providers (
    provider_id, name, email, phone, phone_app, phone_contact,
    specialty_id, honorific_id, timezone_id, region_id, commune_id,
    address_street, address_number, address_complement, address_sector,
    is_active, gcal_calendar_id, ui_preferences
) VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567004',
    'Valentina Espinoza Rojas',
    'v.espinoza@centromedico.cl',
    '+56965432109',
    '+56965432109',
    '+56965432109',
    '873ebe8d-45fa-4c74-9b6e-a0ea1125b949',
    '1c4b57ee-b779-42be-87d3-50dd1f9e97f6',
    2, 13, 13102,
    'Avenida Matta', '1890', 'Oficina 302', 'Cerrillos',
    true, 'primary',
    '{"max_slots_displayed": 10, "max_bookings_per_query": 20}'::jsonb
);

INSERT INTO services (
    service_id, provider_id, name, duration_minutes, buffer_minutes,
    price_cents, currency, is_active, description
) VALUES (
    'b1b2c3d4-e5f6-7890-abcd-ef1234567004',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567004',
    'Consulta Pediatría',
    30, 10, 35000, 'CLP', true,
    'Consulta pediátrica: control de niño sano, vacunación, enfermedades infantiles.'
);

-- ── Provider 5: Dr. Matías Sepúlveda Guzmán (Traumatología)
INSERT INTO providers (
    provider_id, name, email, phone, phone_app, phone_contact,
    specialty_id, honorific_id, timezone_id, region_id, commune_id,
    address_street, address_number, address_complement, address_sector,
    is_active, gcal_calendar_id, ui_preferences
) VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567005',
    'Matías Sepúlveda Guzmán',
    'm.sepulveda@centromedico.cl',
    '+56954321098',
    '+56954321098',
    '+56954321098',
    '813c6ca2-1cca-4231-b8d4-890504225135',
    '0ad63ec7-4810-481d-8314-a3be8594babf',
    2, 13, 13103,
    'Avenida Apoquindo', '3200', 'Torre B, Piso 7', 'Las Condes',
    true, 'primary',
    '{"max_slots_displayed": 10, "max_bookings_per_query": 20}'::jsonb
);

INSERT INTO services (
    service_id, provider_id, name, duration_minutes, buffer_minutes,
    price_cents, currency, is_active, description
) VALUES (
    'b1b2c3d4-e5f6-7890-abcd-ef1234567005',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567005',
    'Consulta Traumatología',
    30, 10, 50000, 'CLP', true,
    'Consulta traumatológica: fracturas, lesiones deportivas, rehabilitación.'
);

COMMIT;
