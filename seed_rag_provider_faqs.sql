-- ============================================================================
-- RAG Knowledge Base Seed — FAQs por Proveedor (5 doctores, 10+ FAQs c/u)
-- Fecha: 2026-05-20
--
-- Crea la tabla knowledge_base si no existe y carga FAQs específicas para
-- cada uno de los 5 proveedores seedeados.
-- ============================================================================

-- ── Crear tabla si no existe (migración 003 no aplicada a esta BD) ──────────
CREATE TABLE IF NOT EXISTS knowledge_base (
    kb_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   UUID REFERENCES providers(provider_id),
    category      TEXT NOT NULL,
    title         TEXT NOT NULL,
    content       TEXT NOT NULL,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_kb_provider ON knowledge_base(provider_id);

-- ============================================================================
-- PROVEEDOR 1: Dr. Ricardo Valenzuela Fuentes — Cardiología
-- ============================================================================
DO $$
DECLARE
    v_provider_id UUID;
BEGIN
    SELECT provider_id INTO v_provider_id
    FROM providers
    WHERE name ILIKE '%ricardo valenzuela%'
    LIMIT 1;

    IF v_provider_id IS NOT NULL THEN
        DELETE FROM knowledge_base WHERE provider_id = v_provider_id;

        INSERT INTO knowledge_base (provider_id, category, title, content, is_active) VALUES
        (v_provider_id, 'perfil',
         '¿Cuál es la especialidad del Dr. Valenzuela?',
         'El Dr. Ricardo Valenzuela Fuentes es cardiólogo con más de 15 años de experiencia. Especialista en cardiología clínica, electrocardiograma, ecocardiograma y prueba de esfuerzo.',
         true),
        (v_provider_id, 'perfil',
         '¿Dónde atiende el Dr. Valenzuela?',
         'El Dr. Valenzuela atiende en Avenida Providencia 1234, Oficina 501, Providencia, Santiago. El centro cuenta con estacionamiento para pacientes.',
         true),
        (v_provider_id, 'disponibilidad',
         '¿Cuándo atiende el Dr. Valenzuela?',
         'El Dr. Valenzuela atiende lunes, martes y jueves de 09:00 a 18:00. Para ver su disponibilidad exacta y agendar, usa la opción 1 del menú de este bot.',
         true),
        (v_provider_id, 'servicios',
         '¿Qué exámenes realiza el Dr. Valenzuela?',
         'El Dr. Valenzuela realiza electrocardiograma (ECG), ecocardiograma transtorácico, prueba de esfuerzo (ergometría), monitoreo Holter de 24 horas y MAPA (monitoreo de presión arterial 24h).',
         true),
        (v_provider_id, 'servicios',
         '¿El Dr. Valenzuela hace chequeos cardiovasculares preventivos?',
         'Sí, ofrece chequeo cardiovascular completo que incluye evaluación clínica, ECG, perfil lipídico, cálculo de riesgo cardiovascular y plan de prevención personalizado.',
         true),
        (v_provider_id, 'preparacion',
         '¿Debo ir en ayunas a la consulta con el Dr. Valenzuela?',
         'Para la consulta clínica no necesitas ayuno. Si te realizarán perfil lipídico o glicemia en el mismo día, ayuna 8-12 horas tomando solo agua.',
         true),
        (v_provider_id, 'preparacion',
         '¿Qué debo llevar a mi primera consulta de cardiología?',
         'Lleva tu cédula de identidad, orden médica si la tienes, exámenes previos (sangre, ECG, ecocardiograma), lista de medicamentos actuales con dosis, y tu carnet de FONASA o ISAPRE.',
         true),
        (v_provider_id, 'tratamientos',
         '¿El Dr. Valenzuela trata la hipertensión?',
         'Sí, el manejo de hipertensión arterial es una de las principales áreas del Dr. Valenzuela. Realiza diagnóstico, ajuste de medicamentos, control de factores de riesgo y seguimiento a largo plazo.',
         true),
        (v_provider_id, 'tratamientos',
         '¿Atiende problemas de arritmias?',
         'Sí, el Dr. Valenzuela diagnostica y trata arritmias cardíacas (taquicardia, bradicardia, fibrilación auricular, extrasístoles). Realiza ECG y Holter para el diagnóstico.',
         true),
        (v_provider_id, 'pagos',
         '¿Cuánto cuesta la consulta con el Dr. Valenzuela?',
         'La consulta tiene un valor de $45.000. Con FONASA libre elección el copago depende de tu tramo. Con ISAPRE puedes solicitar bonificación directa o reembolso con la boleta.',
         true),
        (v_provider_id, 'telemedicina',
         '¿El Dr. Valenzuela hace teleconsulta?',
         'Sí, ofrece teleconsulta para seguimiento de tratamientos, revisión de resultados de exámenes y control de hipertensión. La primera consulta debe ser presencial.',
         true);

        RAISE NOTICE 'FAQs Dr. Ricardo Valenzuela insertadas (11 FAQs)';
    ELSE
        RAISE NOTICE 'Dr. Ricardo Valenzuela no encontrado — FAQs omitidas';
    END IF;
END $$;

-- ============================================================================
-- PROVEEDOR 2: Dra. Carolina Muñoz Soto — Cardiología
-- ============================================================================
DO $$
DECLARE
    v_provider_id UUID;
BEGIN
    SELECT provider_id INTO v_provider_id
    FROM providers
    WHERE name ILIKE '%carolina muñoz%' OR name ILIKE '%carolina munoz%'
    LIMIT 1;

    IF v_provider_id IS NOT NULL THEN
        DELETE FROM knowledge_base WHERE provider_id = v_provider_id;

        INSERT INTO knowledge_base (provider_id, category, title, content, is_active) VALUES
        (v_provider_id, 'perfil',
         '¿Cuál es la especialidad de la Dra. Muñoz?',
         'La Dra. Carolina Muñoz Soto es cardióloga especialista en cardiología femenina, insuficiencia cardíaca y rehabilitación cardiovascular. Más de 12 años de experiencia.',
         true),
        (v_provider_id, 'perfil',
         '¿Dónde atiende la Dra. Muñoz?',
         'La Dra. Muñoz atiende en Avenida Libertador Bernardo OHiggins 2350, Piso 3, Santiago Centro. Acceso por metro estación Toesca o Parque Almagro.',
         true),
        (v_provider_id, 'disponibilidad',
         '¿Cuándo atiende la Dra. Muñoz?',
         'La Dra. Muñoz atiende lunes, miércoles y viernes de 10:00 a 19:00. Agenda directamente desde este bot para ver disponibilidad en tiempo real.',
         true),
        (v_provider_id, 'servicios',
         '¿Qué es la cardiología femenina que atiende la Dra. Muñoz?',
         'La cardiología femenina se enfoca en enfermedades cardiovasculares específicas de la mujer: cardiopatía isquémica en mujeres, efectos del embarazo en el corazón, riesgo cardiovascular postmenopausia y síndrome de takotsubo.',
         true),
        (v_provider_id, 'servicios',
         '¿La Dra. Muñoz realiza ecocardiogramas?',
         'Sí, la Dra. Muñoz realiza e interpreta ecocardiogramas transtorácicos y ecocardiogramas de estrés. El examen se realiza el mismo día de la consulta si hay disponibilidad.',
         true),
        (v_provider_id, 'servicios',
         '¿Qué es la rehabilitación cardiovascular?',
         'Es un programa supervisado de ejercicio, educación y apoyo emocional para pacientes que han sufrido infarto, cirugía cardíaca o insuficiencia cardíaca. La Dra. Muñoz diseña planes personalizados.',
         true),
        (v_provider_id, 'preparacion',
         '¿Qué debo llevar a la consulta con la Dra. Muñoz?',
         'Cédula de identidad, orden médica, exámenes previos (ECG, ecocardiograma, análisis de sangre), lista de medicamentos actuales, y carnet de FONASA o ISAPRE.',
         true),
        (v_provider_id, 'tratamientos',
         '¿La Dra. Muñoz trata insuficiencia cardíaca?',
         'Sí, es una de sus áreas de mayor expertise. Realiza diagnóstico, optimización de tratamiento médico, seguimiento con ecocardiograma seriado y coordinación con equipo multidisciplinario.',
         true),
        (v_provider_id, 'tratamientos',
         '¿Atiende dolor de pecho o angina?',
         'Sí, la Dra. Muñoz evalúa y trata dolor torácico de origen cardíaco. Si tienes dolor de pecho intenso o repentino, llama al 131 (SAMU) o acude a urgencias.',
         true),
        (v_provider_id, 'pagos',
         '¿Cuánto cuesta la consulta con la Dra. Muñoz?',
         'La consulta tiene un valor de $45.000. Acepta FONASA libre elección, ISAPRE con bonificación directa o reembolso, y pago particular con tarjeta o transferencia.',
         true),
        (v_provider_id, 'telemedicina',
         '¿La Dra. Muñoz atiende por videollamada?',
         'Sí, ofrece teleconsulta para control de insuficiencia cardíaca estable, revisión de resultados y seguimiento de tratamiento. Primera consulta debe ser presencial.',
         true);

        RAISE NOTICE 'FAQs Dra. Carolina Muñoz insertadas (11 FAQs)';
    ELSE
        RAISE NOTICE 'Dra. Carolina Muñoz no encontrada — FAQs omitidas';
    END IF;
END $$;

-- ============================================================================
-- PROVEEDOR 3: Dr. Felipe Aravena Contreras — Pediatría
-- ============================================================================
DO $$
DECLARE
    v_provider_id UUID;
BEGIN
    SELECT provider_id INTO v_provider_id
    FROM providers
    WHERE name ILIKE '%felipe aravena%'
    LIMIT 1;

    IF v_provider_id IS NOT NULL THEN
        DELETE FROM knowledge_base WHERE provider_id = v_provider_id;

        INSERT INTO knowledge_base (provider_id, category, title, content, is_active) VALUES
        (v_provider_id, 'perfil',
         '¿Cuál es la especialidad del Dr. Aravena?',
         'El Dr. Felipe Aravena Contreras es pediatra con más de 10 años de experiencia. Especialista en control de niño sano, vacunación, enfermedades respiratorias infantiles y nutrición pediátrica.',
         true),
        (v_provider_id, 'perfil',
         '¿Dónde atiende el Dr. Aravena?',
         'El Dr. Aravena atiende en Calle San Martín 456, Consultorio 12, Las Condes, Santiago. El consultorio cuenta con sala de espera infantil con juegos.',
         true),
        (v_provider_id, 'disponibilidad',
         '¿Cuándo atiende el Dr. Aravena?',
         'El Dr. Aravena atiende lunes a viernes de 08:30 a 17:30 y sábados de 09:00 a 13:00. Agenda desde este bot para ver disponibilidad actualizada.',
         true),
        (v_provider_id, 'servicios',
         '¿Desde qué edad atiende el Dr. Aravena?',
         'Atiende desde recién nacidos (control de niño sano desde los primeros días de vida) hasta los 14 años. Adolescentes de 15-17 años pueden ser derivados a medicina interna.',
         true),
        (v_provider_id, 'servicios',
         '¿El Dr. Aravena aplica vacunas?',
         'Sí, aplica el calendario completo de vacunación del MINSAL (Programa Nacional de Inmunizaciones) y vacunas adicionales: influenza, varicela, neumococo, rotavirus y meningococo.',
         true),
        (v_provider_id, 'servicios',
         '¿Qué es el control de niño sano?',
         'Es una consulta periódica donde el pediatra evalúa crecimiento (peso, talla, perímetro cefálico), desarrollo psicomotor, alimentación y aplica vacunas según la edad. Se recomienda mensualmente el primer año.',
         true),
        (v_provider_id, 'preparacion',
         '¿Qué debo llevar al control de mi hijo?',
         'Carnet de identidad del niño (o certificado de nacimiento), libreta de control de niño sano (Carnet de Salud del Niño), cartilla de vacunación, y lista de medicamentos si los toma.',
         true),
        (v_provider_id, 'tratamientos',
         '¿El Dr. Aravena trata enfermedades respiratorias?',
         'Sí, atiende frecuentemente bronquitis, bronquiolitis, asma, neumonía, faringitis, otitis y rinosinusitis. Realiza nebulizaciones en el consultorio si es necesario.',
         true),
        (v_provider_id, 'tratamientos',
         '¿Atiende urgencias pediátricas?',
         'Atiende urgencias básicas en horario de consulta (fiebre, vómitos, diarrea, rash). Para emergencias graves (dificultad respiratoria, convulsiones), llama al 131 o acude a urgencias hospitalarias.',
         true),
        (v_provider_id, 'pagos',
         '¿Cuánto cuesta la consulta con el Dr. Aravena?',
         'La consulta pediátrica tiene un valor de $35.000. El control de niño sano es gratuito con FONASA. Vacunas del programa nacional son gratuitas. Vacunas adicionales tienen costo adicional.',
         true),
        (v_provider_id, 'telemedicina',
         '¿El Dr. Aravena hace teleconsulta pediátrica?',
         'Sí, ofrece teleconsulta para seguimiento de tratamientos crónicos, orientación sobre alimentación infantil, revisión de resultados y consultas no urgentes. Primera consulta debe ser presencial.',
         true);

        RAISE NOTICE 'FAQs Dr. Felipe Aravena insertadas (11 FAQs)';
    ELSE
        RAISE NOTICE 'Dr. Felipe Aravena no encontrado — FAQs omitidas';
    END IF;
END $$;

-- ============================================================================
-- PROVEEDOR 4: Dra. Valentina Espinoza Rojas — Pediatría
-- ============================================================================
DO $$
DECLARE
    v_provider_id UUID;
BEGIN
    SELECT provider_id INTO v_provider_id
    FROM providers
    WHERE name ILIKE '%valentina espinoza%'
    LIMIT 1;

    IF v_provider_id IS NOT NULL THEN
        DELETE FROM knowledge_base WHERE provider_id = v_provider_id;

        INSERT INTO knowledge_base (provider_id, category, title, content, is_active) VALUES
        (v_provider_id, 'perfil',
         '¿Cuál es la especialidad de la Dra. Espinoza?',
         'La Dra. Valentina Espinoza Rojas es pediatra especialista en gastroenterología infantil, alergias alimentarias y desarrollo infantil. Más de 8 años de experiencia.',
         true),
        (v_provider_id, 'perfil',
         '¿Dónde atiende la Dra. Espinoza?',
         'La Dra. Espinoza atiende en Avenida Matta 1890, Oficina 302, Cerrillos, Santiago. Consultorio accesible por metro Cerro Blanco o Matta.',
         true),
        (v_provider_id, 'disponibilidad',
         '¿Cuándo atiende la Dra. Espinoza?',
         'La Dra. Espinoza atiende martes y jueves de 09:00 a 18:00, y sábados de 09:00 a 13:00. Agenda desde este bot para ver horarios disponibles.',
         true),
        (v_provider_id, 'servicios',
         '¿Qué es la gastroenterología infantil?',
         'Es la subespecialidad que diagnostica y trata enfermedades del sistema digestivo en niños: reflujo gastroesofágico, enfermedad celíaca, estreñimiento crónico, intolerancias alimentarias y diarrea persistente.',
         true),
        (v_provider_id, 'servicios',
         '¿La Dra. Espinoza trata alergias alimentarias?',
         'Sí, diagnostica y maneja alergias a proteína de leche de vaca (APLV), alergia al huevo, celiaquía e intolerancia a la lactosa. Realiza pruebas de tolerancia y planes de reintroducción.',
         true),
        (v_provider_id, 'servicios',
         '¿Atiende problemas de desarrollo infantil?',
         'Sí, evalúa hitos del desarrollo (lenguaje, motricidad, socialización), detecta retrasos y coordina derivación a estimulación temprana, fonoaudiología o terapia ocupacional.',
         true),
        (v_provider_id, 'preparacion',
         '¿Mi hijo debe ir en ayunas a la consulta?',
         'Para consulta general no necesita ayuno. Si se solicitan exámenes de sangre (glicemia, perfil lipídico), ayuna 8 horas. Para ecografía abdominal, ayuno de 4-6 horas.',
         true),
        (v_provider_id, 'tratamientos',
         '¿La Dra. Espinoza trata el reflujo en bebés?',
         'Sí, el reflujo gastroesofágico en lactantes es una de sus consultas más frecuentes. Evalúa si es fisiológico o patológico, ajusta alimentación y prescribe tratamiento si es necesario.',
         true),
        (v_provider_id, 'tratamientos',
         '¿Atiende cólicos del lactante?',
         'Sí, evalúa y orienta sobre manejo de cólicos del lactante: técnicas de masaje, ajustes en la alimentación, probióticos y descarta causas orgánicas.',
         true),
        (v_provider_id, 'pagos',
         '¿Cuánto cuesta la consulta con la Dra. Espinoza?',
         'La consulta pediátrica tiene un valor de $35.000. Con FONASA el copago depende de tu tramo. Control de niño sano es gratuito. Vacunas del programa nacional son gratuitas.',
         true),
        (v_provider_id, 'telemedicina',
         '¿La Dra. Espinoza atiende por videollamada?',
         'Sí, ofrece teleconsulta para seguimiento de tratamientos, orientación sobre alimentación complementaria, revisión de resultados de exámenes y consultas de desarrollo.',
         true);

        RAISE NOTICE 'FAQs Dra. Valentina Espinoza insertadas (11 FAQs)';
    ELSE
        RAISE NOTICE 'Dra. Valentina Espinoza no encontrada — FAQs omitidas';
    END IF;
END $$;

-- ============================================================================
-- PROVEEDOR 5: Dr. Matías Sepúlveda Guzmán — Traumatología
-- ============================================================================
DO $$
DECLARE
    v_provider_id UUID;
BEGIN
    SELECT provider_id INTO v_provider_id
    FROM providers
    WHERE name ILIKE '%matías sepúlveda%' OR name ILIKE '%matias sepulveda%'
    LIMIT 1;

    IF v_provider_id IS NOT NULL THEN
        DELETE FROM knowledge_base WHERE provider_id = v_provider_id;

        INSERT INTO knowledge_base (provider_id, category, title, content, is_active) VALUES
        (v_provider_id, 'perfil',
         '¿Cuál es la especialidad del Dr. Sepúlveda?',
         'El Dr. Matías Sepúlveda Guzmán es traumatólogo especialista en cirugía artroscópica, lesiones deportivas, fracturas y rehabilitación ortopédica. Más de 14 años de experiencia.',
         true),
        (v_provider_id, 'perfil',
         '¿Dónde atiende el Dr. Sepúlveda?',
         'El Dr. Sepúlveda atiende en Avenida Apoquindo 3200, Torre B, Piso 7, Las Condes, Santiago. El edificio cuenta con estacionamiento subterráneo y acceso para personas con movilidad reducida.',
         true),
        (v_provider_id, 'disponibilidad',
         '¿Cuándo atiende el Dr. Sepúlveda?',
         'El Dr. Sepúlveda atiende lunes, miércoles y viernes de 08:00 a 16:00. Para ver disponibilidad exacta y agendar, usa la opción 1 del menú de este bot.',
         true),
        (v_provider_id, 'servicios',
         '¿El Dr. Sepúlveda realiza artroscopía?',
         'Sí, realiza artroscopía de rodilla (meniscos, ligamento cruzado anterior, cartílago), hombro (manguito rotador, inestabilidad), cadera y tobillo. Procedimientos ambulatorios con recuperación rápida.',
         true),
        (v_provider_id, 'servicios',
         '¿Atiende lesiones deportivas?',
         'Sí, es especialista en lesiones deportivas: esguinces, desgarros musculares, tendinitis, fracturas por estrés, lesiones de ligamentos y meniscos. Trabaja con deportistas amateur y profesionales.',
         true),
        (v_provider_id, 'servicios',
         '¿El Dr. Sepúlveda coloca yesos o férulas?',
         'Sí, realiza inmovilización con yeso, férulas de yeso y férulas funcionales para fracturas y esguinces. Controla la evolución y retira la inmovilización cuando corresponde.',
         true),
        (v_provider_id, 'preparacion',
         '¿Qué debo llevar a la consulta de traumatología?',
         'Cédula de identidad, orden médica si la tienes, radiografías o resonancias previas (en disco o impresas), lista de medicamentos, y calzado cómodo para la evaluación.',
         true),
        (v_provider_id, 'preparacion',
         '¿Necesito radiografía antes de la consulta?',
         'No es obligatorio, pero si ya te tomaste radiografías, tráelas. El Dr. Sepúlveda puede solicitar nuevas radiografías el mismo día si el centro cuenta con servicio de imagenología.',
         true),
        (v_provider_id, 'tratamientos',
         '¿El Dr. Sepúlveda opera fracturas?',
         'Sí, realiza cirugía de fracturas (osteosíntesis con placas, tornillos, clavos intramedulares). Evalúa cada caso para determinar si necesita cirugía o tratamiento conservador.',
         true),
        (v_provider_id, 'tratamientos',
         '¿Atiende dolor de rodilla?',
         'Sí, el dolor de rodilla es una de sus consultas más frecuentes. Diagnostica y trata condromalacia, meniscopatía, gonartrosis, síndrome de dolor patelofemoral y lesiones ligamentarias.',
         true),
        (v_provider_id, 'pagos',
         '¿Cuánto cuesta la consulta con el Dr. Sepúlveda?',
         'La consulta traumatológica tiene un valor de $50.000. Con FONASA libre elección el copago depende de tu tramo. Con ISAPRE puedes solicitar bonificación. Cirugías se cotizan por separado.',
         true),
        (v_provider_id, 'telemedicina',
         '¿El Dr. Sepúlveda hace teleconsulta?',
         'Sí, ofrece teleconsulta para revisión de resultados de exámenes, seguimiento post-operatorio y orientación sobre rehabilitación. La evaluación física inicial debe ser presencial.',
         true);

        RAISE NOTICE 'FAQs Dr. Matías Sepúlveda insertadas (12 FAQs)';
    ELSE
        RAISE NOTICE 'Dr. Matías Sepúlveda no encontrado — FAQs omitidas';
    END IF;
END $$;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
SELECT
    p.name AS proveedor,
    COUNT(kb.kb_id) AS total_faqs,
    string_agg(DISTINCT kb.category, ', ' ORDER BY kb.category) AS categorias
FROM knowledge_base kb
JOIN providers p ON p.provider_id = kb.provider_id
WHERE kb.is_active = true
GROUP BY p.name
ORDER BY p.name;

SELECT
    COUNT(*) AS total_faqs_proveedores,
    COUNT(DISTINCT provider_id) AS proveedores_con_faqs
FROM knowledge_base
WHERE provider_id IS NOT NULL AND is_active = true;
