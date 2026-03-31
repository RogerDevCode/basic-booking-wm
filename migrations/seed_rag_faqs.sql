-- ============================================================================
-- RAG Database Seeding - Medical FAQs
-- Purpose: Seed knowledge_base with real frequently asked questions
-- Date: 2026-03-30
-- ============================================================================

-- Clear existing data
TRUNCATE TABLE knowledge_base RESTART IDENTITY CASCADE;

-- Insert FAQs (embeddings will be generated later or use placeholders)
INSERT INTO knowledge_base (category, title, content, is_active, embedding) VALUES

-- SERVICIOS
('servicios', 
 '¿Qué servicios médicos ofrecen?', 
 'Ofrecemos consulta general, medicina interna, cardiología, pediatría, ginecología, dermatología, psicología, nutrición, fisioterapia, y laboratorio clínico. Todos nuestros servicios cuentan con profesionales certificados y tecnología de vanguardia.', 
 true, 
 ARRAY_FILL(0.01, ARRAY[1536])),

('servicios', 
 '¿Realizan exámenes de laboratorio?', 
 'Sí, contamos con laboratorio clínico propio para exámenes de sangre, orina, heces, cultivos, pruebas de alergias, marcadores tumorales, hormonas, y más. Los resultados se entregan en 24-48 horas hábiles.', 
 true, 
 ARRAY_FILL(0.01, ARRAY[1536])),

('servicios', 
 '¿Tienen servicio de urgencias?', 
 'Contamos con servicio de urgencias básicas de lunes a viernes de 7:00 AM a 7:00 PM. Para emergencias fuera de este horario, recomendamos dirigir al hospital más cercano o llamar al 911.', 
 true, 
 ARRAY_FILL(0.01, ARRAY[1536])),

-- AGENDA
('agenda', 
 '¿Cómo puedo agendar una cita?', 
 'Puedes agendar tu cita a través de nuestro bot de Telegram, llamando al (555) 123-4567, o visitando nuestra recepción. También puedes solicitar cita mediante nuestro sitio web en la sección de reservas.', 
 true, 
 ARRAY_FILL(0.02, ARRAY[1536])),

('agenda', 
 '¿Con cuánta anticipación debo agendar?', 
 'Recomendamos agendar con al menos 3-5 días de anticipación para consulta general. Para especialidades, el tiempo de espera puede ser de 1-2 semanas. Urgencias se atienden el mismo día.', 
 true, 
 ARRAY_FILL(0.02, ARRAY[1536])),

('agenda', 
 '¿Puedo cancelar o reagendar mi cita?', 
 'Sí, puedes cancelar o reagendar hasta 24 horas antes de tu cita sin costo. Cancelaciones con menos de 24 horas tienen un cargo del 50% del valor de la consulta. Puedes hacerlo vía Telegram, teléfono o en recepción.', 
 true, 
 ARRAY_FILL(0.02, ARRAY[1536])),

-- PAGOS
('pagos', 
 '¿Qué métodos de pago aceptan?', 
 'Aceptamos efectivo, tarjetas de crédito y débito (Visa, MasterCard, American Express), transferencias bancarias, y pagos mediante aplicaciones móviles (Yape, Plin, Tunki). También trabajamos con algunas aseguradoras.', 
 true, 
 ARRAY_FILL(0.03, ARRAY[1536])),

('pagos', 
 '¿Aceptan seguros médicos?', 
 'Trabajamos con Pacífico, Rimac, Mapfre, La Positiva, y Seguro Esencial. Verifica con tu aseguradora si estamos en su red. Si tu seguro no está conveniado, puedes pagar particular y solicitar reembolso.', 
 true, 
 ARRAY_FILL(0.03, ARRAY[1536])),

('pagos', 
 '¿Necesito referencia para consulta?', 
 'No necesitas referencia médica para consulta general ni la mayoría de especialidades. Solo algunos exámenes especializados requieren orden médica por protocolos de laboratorio.', 
 true, 
 ARRAY_FILL(0.03, ARRAY[1536])),

-- PREPARACION
('preparacion', 
 '¿Debo ir en ayunas para mi consulta?', 
 'Para consulta general no es necesario ir en ayunas. Si te realizarán exámenes de sangre, deberás ayunar 8-12 horas. Toma solo agua si tienes sed. Para ecografías abdominales, ayuno de 6 horas.', 
 true, 
 ARRAY_FILL(0.04, ARRAY[1536])),

('preparacion', 
 '¿Qué documentos debo llevar?', 
 'Debes llevar tu DNI o documento de identidad, carné del seguro (si aplica), órdenes médicas o resultados de exámenes previos relacionados con tu consulta, y lista de medicamentos que tomas actualmente.', 
 true, 
 ARRAY_FILL(0.04, ARRAY[1536])),

('preparacion', 
 '¿Puedo llevar acompañante?', 
 'Sí, puedes llevar un acompañante. Por protocolo sanitario, solo ingresa una persona por paciente a la consulta. Menores de edad deben estar acompañados por padre, madre o apoderado.', 
 true, 
 ARRAY_FILL(0.04, ARRAY[1536])),

-- HORARIOS
('horarios', 
 '¿Cuál es el horario de atención?', 
 'Atendemos de lunes a viernes de 7:00 AM a 8:00 PM, sábados de 8:00 AM a 1:00 PM. Urgencias básicas de lunes a viernes 7:00 AM a 7:00 PM. Domingos y feriados cerrado, salvo emergencias.', 
 true, 
 ARRAY_FILL(0.05, ARRAY[1536])),

('horarios', 
 '¿Atienden domingos o feriados?', 
 'No atendemos domingos ni feriados regulares. Para emergencias en estos días, recomendamos dirigir al hospital más cercano o llamar al 911. Puedes dejar mensaje en Telegram y te respondemos el siguiente día hábil.', 
 true, 
 ARRAY_FILL(0.05, ARRAY[1536])),

-- UBICACION
('ubicacion', 
 '¿Dónde están ubicados?', 
 'Estamos en Av. Principal 123, Centro Comercial Plaza, Segundo Piso, Distrito Central. Contamos con parqueamiento gratuito por 2 horas. Referencia: frente al banco BCP, al lado de la farmacia Inkafarma.', 
 true, 
 ARRAY_FILL(0.06, ARRAY[1536])),

('ubicacion', 
 '¿Cómo llego en transporte público?', 
 'Puedes llegar en las rutas de autobús 101, 102, 205, 306. Bájate en la parada Plaza Central. También puedes usar Uber, Beat, o InDrive. El viaje desde el centro toma aproximadamente 15 minutos.', 
 true, 
 ARRAY_FILL(0.06, ARRAY[1536])),

-- TELEMEDICINA
('telemedicina', 
 '¿Ofrecen consultas virtuales?', 
 'Sí, ofrecemos telemedicina para seguimiento de tratamientos, resultados de exámenes, orientación médica, y recetas. La consulta virtual tiene el mismo costo que presencial. Se realiza por videollamada segura.', 
 true, 
 ARRAY_FILL(0.07, ARRAY[1536])),

('telemedicina', 
 '¿Cómo funciona la telemedicina?', 
 'Agenda tu cita virtual. Recibirás un enlace seguro por correo o WhatsApp 10 minutos antes. Conéctate desde tu celular, tablet o computadora con cámara y micrófono. El médico te atenderá como en consulta presencial.', 
 true, 
 ARRAY_FILL(0.07, ARRAY[1536])),

-- RESULTADOS
('resultados', 
 '¿Cuándo entregan resultados de exámenes?', 
 'Exámenes básicos (hemograma, orina): 24 horas. Exámenes especializados (hormonas, cultivos): 48-72 horas. Biopsias: 5-7 días hábiles. Puedes recoger resultados en recepción o solicitar envío por correo electrónico.', 
 true, 
 ARRAY_FILL(0.08, ARRAY[1536])),

('resultados', 
 '¿Pueden enviar resultados por correo?', 
 'Sí, enviamos resultados por correo electrónico seguro. Solicítalo en recepción o por Telegram. Los resultados también están disponibles en nuestra plataforma online con usuario y contraseña.', 
 true, 
 ARRAY_FILL(0.08, ARRAY[1536]));

-- Verify insertion
SELECT 
    category, 
    COUNT(*) as faq_count,
    STRING_AGG(title, ', ' ORDER BY title) as titles
FROM knowledge_base
GROUP BY category
ORDER BY category;

-- Show total
SELECT 
    'Total FAQs seeded: ' || COUNT(*) as summary,
    'Categories: ' || COUNT(DISTINCT category) as categories
FROM knowledge_base;
