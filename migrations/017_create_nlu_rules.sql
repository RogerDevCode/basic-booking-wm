-- Migration: 017_create_nlu_rules.sql
-- Purpose: Externalize AI/NLU tuning parameters from code to DB

CREATE TABLE IF NOT EXISTS nlu_rules (
    rule_key        TEXT PRIMARY KEY,
    threshold_value FLOAT,
    keywords        JSONB,
    description     TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial data for thresholds
INSERT INTO nlu_rules (rule_key, threshold_value, description) VALUES
('confidence_urgencia', 0.5, 'Threshold for urgencia'),
('confidence_cancelar_cita', 0.5, 'Threshold for cancelar_cita'),
('confidence_reagendar_cita', 0.5, 'Threshold for reagendar_cita'),
('confidence_crear_cita', 0.3, 'Threshold for crear_cita'),
('confidence_ver_disponibilidad', 0.3, 'Threshold for ver_disponibilidad'),
('confidence_saludo', 0.5, 'Threshold for saludo'),
('confidence_despedida', 0.5, 'Threshold for despedida'),
('confidence_agradecimiento', 0.5, 'Threshold for agradecimiento'),
('confidence_pregunta_general', 0.5, 'Threshold for pregunta_general'),
('confidence_activar_recordatorios', 0.5, 'Threshold for activar_recordatorios'),
('confidence_desactivar_recordatorios', 0.5, 'Threshold for desactivar_recordatorios'),
('confidence_preferencias_recordatorio', 0.5, 'Threshold for preferencias_recordatorio'),
('confidence_mostrar_menu_principal', 0.5, 'Threshold for mostrar_menu_principal'),
('confidence_paso_wizard', 0.5, 'Threshold for paso_wizard'),
('confidence_ver_mis_citas', 0.5, 'Threshold for ver_mis_citas'),
('confidence_desconocido', 0.0, 'Threshold for desconocido'),
('escalation_medical_emergency_min', 0.8, 'Escalation threshold'),
('escalation_priority_queue_max', 0.6, 'Escalation threshold'),
('escalation_human_handoff_max', 0.4, 'Escalation threshold'),
('escalation_tfidf_minimum', 0.4, 'Escalation threshold'),
('confidence_bound_high_min', 0.85, 'Confidence bound'),
('confidence_bound_mod_min', 0.60, 'Confidence bound'),
('confidence_bound_mod_max', 0.85, 'Confidence bound'),
('confidence_bound_low_max', 0.60, 'Confidence bound');

-- Seed initial data for keywords (we will populate this via a python script to avoid massive SQL files)
