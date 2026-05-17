-- ============================================================================
-- RAG Knowledge Base Seed — FAQs Médicas (Chile)
-- Última actualización: 2026-05-17
--
-- ESTRUCTURA:
--   provider_id = NULL   → FAQ globales del sistema (responden a cualquier consulta)
--   provider_id = <uuid> → FAQ específicas de un proveedor/doctor
--
-- BÚSQUEDA: keyword-based sobre title + content + category.
-- Sin pgvector instalado; columna embedding no existe en este entorno.
-- ============================================================================

-- Limpiar FAQs globales anteriores (no toca las de proveedores)
DELETE FROM knowledge_base WHERE provider_id IS NULL;

-- ============================================================================
-- SECCIÓN 1: FAQs GLOBALES (provider_id = NULL)
-- ============================================================================
INSERT INTO knowledge_base (provider_id, category, title, content, is_active) VALUES

-- ── FONASA / ISAPRE ──────────────────────────────────────────────────────────
(NULL, 'fonasa_isapre',
 '¿Aceptan FONASA?',
 'Sí, aceptamos FONASA modalidad libre elección (MLE). El bono FONASA cubre parte del valor de la consulta según tu tramo (A, B, C o D). Para usarlo, dinos en recepción que pagarás con FONASA y trae tu RUT.',
 true),

(NULL, 'fonasa_isapre',
 '¿Qué tramos FONASA cubren y cuánto debo pagar de copago?',
 'El copago depende de tu tramo: Tramo A (indigente) paga $0. Tramo B paga 20% del arancel. Tramos C y D pagan 10%. El valor del bono FONASA lo puedes verificar en Fonasa.cl o llamando al 600 360 3000.',
 true),

(NULL, 'fonasa_isapre',
 '¿Trabajan con ISAPRES?',
 'Trabajamos con las principales ISAPRES (Banmédica, Colmena, Cruz Blanca, Consalud, MásVida, Nueva Masvida y Vida Tres). Trae tu carnet de ISAPRE y RUT. Verifica con tu ISAPRE si el profesional está en su nómina para bonificación directa.',
 true),

(NULL, 'fonasa_isapre',
 '¿Emiten boleta para reembolso de ISAPRE?',
 'Sí, emitimos boleta electrónica por cada atención. Con esa boleta puedes solicitar reembolso directamente a tu ISAPRE desde su app o sucursal. El reembolso demora entre 3 y 10 días hábiles según tu ISAPRE.',
 true),

(NULL, 'fonasa_isapre',
 '¿Qué pasa si no tengo seguro de salud?',
 'Puedes atenderte de forma particular (sin seguro). El valor de la consulta se paga al contado. Si no tienes FONASA activo, puedes activarlo en Fonasa.cl si cotizas o eres beneficiario.',
 true),

(NULL, 'fonasa_isapre',
 '¿Aceptan el seguro complementario de empresa?',
 'Depende del seguro. Muchos seguros complementarios reembolsan el copago una vez que presentas la boleta. Consulta con tu área de RRHH o la corredora de seguros de tu empresa.',
 true),

-- ── AGENDA ───────────────────────────────────────────────────────────────────
(NULL, 'agenda',
 '¿Cómo agendo una hora?',
 'Puedes agendar tu hora directamente por este bot de Telegram (escribe "agendar" o selecciona la opción 1 del menú). También puedes llamar a recepción en horario de atención.',
 true),

(NULL, 'agenda',
 '¿Con cuánta anticipación debo agendar?',
 'Para consulta general recomendamos agendar con 2-3 días de anticipación. Para especialidades puede haber espera de 1-2 semanas según disponibilidad. Urgencias se coordinan el mismo día vía recepción.',
 true),

(NULL, 'agenda',
 '¿Puedo cancelar mi hora?',
 'Sí. Puedes cancelar hasta 24 horas antes sin costo escribiendo "cancelar" en este bot o llamando a recepción. Cancelaciones con menos de 24 horas pueden tener cobro según política del centro.',
 true),

(NULL, 'agenda',
 '¿Puedo reagendar mi hora?',
 'Sí, puedes reagendar hasta 24 horas antes sin costo. Escribe "reagendar" en el bot o llama a recepción. Te ofreceremos las alternativas disponibles del profesional que elegiste.',
 true),

(NULL, 'agenda',
 '¿Cómo sé que mi hora quedó confirmada?',
 'Al agendar recibirás un mensaje de confirmación con el nombre del profesional, fecha, hora y número de referencia. También te enviaremos un recordatorio automático 24 horas antes de tu consulta.',
 true),

(NULL, 'agenda',
 '¿Puedo agendar hora para otra persona?',
 'Sí, puedes agendar en nombre de un familiar. Indica el nombre completo y RUT del paciente al agendar. El titular debe presentarse con su documento de identidad.',
 true),

-- ── HORARIOS ─────────────────────────────────────────────────────────────────
(NULL, 'horarios',
 '¿Cuál es el horario de atención?',
 'Atendemos de lunes a viernes de 08:00 a 20:00 y sábados de 09:00 a 13:00. Los horarios específicos de cada profesional pueden variar; al agendar verás la disponibilidad real.',
 true),

(NULL, 'horarios',
 '¿Atienden sábados?',
 'Sí, atendemos sábados de 09:00 a 13:00. No todos los profesionales tienen horario de sábado; la disponibilidad se muestra al momento de agendar.',
 true),

(NULL, 'horarios',
 '¿Atienden domingos o feriados?',
 'No atendemos domingos ni feriados. Para emergencias llama al 131 (SAMU) o dirígete al hospital más cercano. Puedes dejarnos mensaje en Telegram y te contactamos el siguiente día hábil.',
 true),

-- ── SERVICIOS ────────────────────────────────────────────────────────────────
(NULL, 'servicios',
 '¿Qué especialidades médicas tienen disponibles?',
 'Contamos con medicina general, medicina familiar, pediatría, ginecología y obstetricia, traumatología, cardiología, dermatología, psicología, nutrición clínica y kinesiología. La disponibilidad varía por sede.',
 true),

(NULL, 'servicios',
 '¿Hacen exámenes de laboratorio?',
 'Sí, realizamos exámenes de laboratorio: hemograma, perfil lipídico, glicemia, examen de orina, cultivos y más. Resultados básicos en 24 horas hábiles, especializados en 48-72 horas.',
 true),

(NULL, 'servicios',
 '¿Necesito derivación médica para ver un especialista?',
 'No necesitas derivación para la mayoría de nuestros especialistas; puedes agendar directamente. Si tienes FONASA o ISAPRE, revisa si tu plan requiere interconsulta para cubrir la bonificación.',
 true),

(NULL, 'servicios',
 '¿Tienen servicio de urgencias?',
 'Contamos con atención de urgencias básicas en horario hábil. Para emergencias graves (pérdida de conciencia, dolor al pecho, dificultad respiratoria), llama al 131 (SAMU) o ve al hospital más cercano.',
 true),

(NULL, 'servicios',
 '¿Atienden a niños?',
 'Sí, contamos con pediatría desde recién nacidos. Menores de 14 años deben asistir acompañados de padre, madre o apoderado con documentos que acrediten el vínculo.',
 true),

-- ── PAGOS ────────────────────────────────────────────────────────────────────
(NULL, 'pagos',
 '¿Qué métodos de pago aceptan?',
 'Aceptamos efectivo, tarjetas de crédito y débito (Visa, MasterCard, Redbanc), transferencia bancaria y WebPay. El copago de FONASA e ISAPRE se puede pagar con cualquiera de estos métodos.',
 true),

(NULL, 'pagos',
 '¿Aceptan pago con tarjeta de débito?',
 'Sí, aceptamos tarjetas de débito Redbanc y prepago. También puedes pagar con tarjeta de crédito Visa o MasterCard en cuotas sin interés dependiendo de tu banco.',
 true),

(NULL, 'pagos',
 '¿Emiten boleta electrónica?',
 'Sí, emitimos boleta electrónica por cada atención. La recibirás por correo si nos das tu email, o puedes pedirla impresa en recepción. La boleta es necesaria para reembolso de ISAPRE.',
 true),

(NULL, 'pagos',
 '¿Cuánto cuesta la consulta?',
 'Los valores varían según el profesional y la especialidad. Al agendar te informamos el valor exacto antes de confirmar. Con FONASA el valor depende de tu tramo y el arancel del bono.',
 true),

-- ── PREPARACIÓN ──────────────────────────────────────────────────────────────
(NULL, 'preparacion',
 '¿Debo ir en ayunas a mi consulta?',
 'Para consulta general no es necesario ir en ayunas. Si te tomarán exámenes de sangre (glicemia, perfil lipídico), ayuna 8-12 horas tomando solo agua. Para ecografía abdominal, ayuno de al menos 6 horas.',
 true),

(NULL, 'preparacion',
 '¿Qué documentos debo llevar a la consulta?',
 'Lleva tu cédula de identidad (RUT), carnet de FONASA o ISAPRE si lo tienes, exámenes o resultados previos relacionados con tu consulta, y lista de medicamentos que tomas actualmente.',
 true),

(NULL, 'preparacion',
 '¿Puedo llevar acompañante a la consulta?',
 'Sí, puedes ir acompañado. Por espacio y privacidad, generalmente solo ingresa una persona junto al paciente. Para niños o adultos mayores el acompañante es siempre bienvenido.',
 true),

-- ── USO DEL BOT ──────────────────────────────────────────────────────────────
(NULL, 'bot_uso',
 '¿Cómo uso este bot de Telegram?',
 'Escribe /start para ver el menú principal. Desde ahí puedes: 1️⃣ Agendar una hora, 2️⃣ Ver tus horas agendadas, 3️⃣ Configurar recordatorios, 4️⃣ Ver información, 5️⃣ Ver tus datos. También puedes escribir lo que necesitas en lenguaje natural.',
 true),

(NULL, 'bot_uso',
 '¿El bot funciona las 24 horas?',
 'Sí, el bot está disponible 24/7 para consultar información, ver tus horas y agendar. Las horas disponibles son solo en el horario de atención del centro (lun-vie 08:00-20:00, sáb 09:00-13:00).',
 true),

(NULL, 'bot_uso',
 '¿Cómo veo mis horas agendadas?',
 'Escribe "mis horas" o selecciona la opción 2️⃣ del menú. Te mostraremos todas tus horas próximas con fecha, hora y nombre del profesional.',
 true),

(NULL, 'bot_uso',
 '¿Cómo activo los recordatorios de mis horas?',
 'Selecciona la opción 3️⃣ (Recordatorios) en el menú. Puedes activar recordatorios automáticos 24 horas antes de tu consulta y desactivarlos cuando quieras.',
 true),

-- ── TELEMEDICINA ─────────────────────────────────────────────────────────────
(NULL, 'telemedicina',
 '¿Ofrecen consulta médica online o teleconsulta?',
 'Sí, ofrecemos teleconsulta por videollamada para seguimiento de tratamientos, orientación médica, revisión de resultados y renovación de recetas. Mismo valor que presencial y acepta FONASA libre elección.',
 true),

(NULL, 'telemedicina',
 '¿Cómo funciona la consulta online?',
 'Agendas tu hora online como cualquier consulta. Antes de la hora recibirás un enlace seguro por Telegram o correo. Conéctate con tu celular, tablet o computador con cámara y micrófono.',
 true),

-- ── RESULTADOS ───────────────────────────────────────────────────────────────
(NULL, 'resultados',
 '¿Cuándo están listos los resultados de exámenes?',
 'Exámenes básicos (hemograma, orina, glicemia): 24 horas hábiles. Especializados (hormonas, cultivos, PCR): 48-72 horas. Biopsias: 5-7 días hábiles. Te avisamos cuando estén disponibles.',
 true),

(NULL, 'resultados',
 '¿Pueden enviar los resultados por correo electrónico?',
 'Sí, enviamos resultados al email que registres. También puedes pedirlos en recepción o por Telegram indicando tu RUT y número de orden.',
 true);

-- ============================================================================
-- SECCIÓN 2: FAQs POR PROVEEDOR (provider_id = <uuid>)
-- Se insertan via subquery para no depender de UUIDs hardcodeados.
-- La columna en providers es `name` (nombre completo del profesional).
-- ============================================================================

-- Ejemplo genérico (descomentar y adaptar por proveedor):
-- INSERT INTO knowledge_base (provider_id, category, title, content, is_active)
-- SELECT p.provider_id, 'atencion', '¿Atiende a domicilio?',
--        'Sí, el Dr. [Nombre] realiza visitas a domicilio previa coordinación...',
--        true
-- FROM providers p WHERE p.email = 'dr.nombre@clinica.cl' LIMIT 1;

DO $$
DECLARE
    v_provider_id UUID;
BEGIN
    -- ── Dr. Gallegos ─────────────────────────────────────────────────────────
    SELECT provider_id INTO v_provider_id
    FROM providers
    WHERE name ILIKE '%gallegos%' OR email ILIKE '%gallegos%'
    LIMIT 1;

    IF v_provider_id IS NOT NULL THEN
        DELETE FROM knowledge_base WHERE provider_id = v_provider_id;

        INSERT INTO knowledge_base (provider_id, category, title, content, is_active) VALUES
        (v_provider_id, 'atencion',
         '¿El Dr. Gallegos atiende a domicilio?',
         'Sí, el Dr. Gallegos realiza visitas a domicilio previa coordinación y disponibilidad de agenda. El valor es diferente a la consulta en clínica. Para coordinar, escribe por Telegram o llama a recepción.',
         true),
        (v_provider_id, 'especialidad',
         '¿Cuál es la especialidad del Dr. Gallegos?',
         'El Dr. Gallegos es especialista en medicina general y familiar, con énfasis en manejo de enfermedades crónicas (diabetes, hipertensión, dislipidemia) y atención preventiva.',
         true),
        (v_provider_id, 'disponibilidad',
         '¿Cuándo atiende el Dr. Gallegos?',
         'El Dr. Gallegos atiende lunes, miércoles y viernes de 09:00 a 17:00. Para ver su disponibilidad exacta, agenda directamente desde el menú de este bot.',
         true),
        (v_provider_id, 'recetas',
         '¿El Dr. Gallegos puede renovar recetas médicas?',
         'Sí, puede renovar recetas para enfermedades crónicas tanto en consulta presencial como en teleconsulta. Trae tus recetas anteriores o los nombres de tus medicamentos actuales.',
         true);

        RAISE NOTICE 'FAQs Dr. Gallegos insertadas (provider_id: %)', v_provider_id;
    ELSE
        RAISE NOTICE 'Dr. Gallegos no encontrado en providers — FAQs de proveedor omitidas';
    END IF;
END $$;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
SELECT
    CASE WHEN provider_id IS NULL THEN 'GLOBAL' ELSE 'PROVEEDOR' END AS tipo,
    category,
    COUNT(*) AS total
FROM knowledge_base
WHERE is_active = true
GROUP BY tipo, category
ORDER BY tipo, category;

SELECT
    COUNT(*) AS total_faqs,
    COUNT(*) FILTER (WHERE provider_id IS NULL) AS globales,
    COUNT(*) FILTER (WHERE provider_id IS NOT NULL) AS por_proveedor
FROM knowledge_base
WHERE is_active = true;
