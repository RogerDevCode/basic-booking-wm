-- ============================================================================
-- Migration 010: Complete Provider Schema Overhaul
-- Purpose: Specialties, Regions, Communes, Auth, Address, FK Timezone
-- Date: 2026-04-06
-- ============================================================================

-- STEP 1: Specialties
CREATE TABLE IF NOT EXISTS specialties (
    specialty_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    category TEXT DEFAULT 'Medicina',
    is_active BOOLEAN DEFAULT true,
    sort_order INT NOT NULL DEFAULT 99,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO specialties (name, description, category, sort_order) VALUES
('Medicina General', 'Atención primaria y consulta general', 'Medicina', 1),
('Cardiología', 'Enfermedades del corazón y sistema cardiovascular', 'Especialidad', 2),
('Pediatría', 'Atención médica de niños y adolescentes', 'Especialidad', 3),
('Dermatología', 'Enfermedades de la piel, pelo y uñas', 'Especialidad', 4),
('Ginecología', 'Salud femenina y sistema reproductivo', 'Especialidad', 5),
('Traumatología', 'Lesiones del sistema musculoesquelético', 'Especialidad', 6),
('Neurología', 'Enfermedades del sistema nervioso', 'Especialidad', 7),
('Oftalmología', 'Enfermedades de los ojos y la visión', 'Especialidad', 8),
('Psiquiatría', 'Salud mental y trastornos psiquiátricos', 'Especialidad', 9),
('Endocrinología', 'Trastornos hormonales y metabólicos', 'Especialidad', 10),
('Gastroenterología', 'Enfermedades del sistema digestivo', 'Especialidad', 11),
('Urología', 'Enfermedades del sistema urinario y masculino', 'Especialidad', 12),
('Otorrinolaringología', 'Enfermedades de oído, nariz y garganta', 'Especialidad', 13),
('Neumología', 'Enfermedades del sistema respiratorio', 'Especialidad', 14),
('Cirugía General', 'Procedimientos quirúrgicos generales', 'Especialidad', 15)
ON CONFLICT (name) DO NOTHING;

-- STEP 2: Regions (16 de Chile)
CREATE TABLE IF NOT EXISTS regions (
    region_id INT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT,
    country_code TEXT DEFAULT 'CL',
    is_active BOOLEAN DEFAULT true,
    sort_order INT NOT NULL DEFAULT 99,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO regions (region_id, name, code, sort_order) VALUES
(1, 'Arica y Parinacota', 'AP', 1),
(2, 'Tarapacá', 'TA', 2),
(3, 'Antofagasta', 'AN', 3),
(4, 'Atacama', 'AT', 4),
(5, 'Coquimbo', 'CO', 5),
(6, 'Valparaíso', 'VA', 6),
(13, 'Metropolitana de Santiago', 'RM', 7),
(7, "O'Higgins", 'OH', 8),
(8, 'Maule', 'MA', 9),
(16, 'Ñuble', 'NB', 10),
(9, 'Biobío', 'BI', 11),
(10, 'Araucanía', 'AR', 12),
(14, 'Los Ríos', 'LR', 13),
(15, 'Los Lagos', 'LL', 14),
(11, 'Aysén', 'AY', 15),
(12, 'Magallanes', 'MG', 16)
ON CONFLICT (region_id) DO NOTHING;

-- STEP 3: Communes (346 comunas de Chile)
CREATE TABLE IF NOT EXISTS communes (
    commune_id INT PRIMARY KEY,
    name TEXT NOT NULL,
    region_id INT NOT NULL REFERENCES regions(region_id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communes_region ON communes(region_id);
CREATE INDEX IF NOT EXISTS idx_communes_name ON communes(name);

INSERT INTO communes (commune_id, name, region_id) VALUES
-- Región de Arica y Parinacota (1)
(1101, 'Arica', 1), (1102, 'Camarones', 1), (1201, 'Putre', 1), (1202, 'General Lagos', 1),
-- Región de Tarapacá (2)
(2101, 'Iquique', 2), (2102, 'Alto Hospicio', 2), (2201, 'Pozo Almonte', 2), (2202, 'Camiña', 2), (2203, 'Colchane', 2), (2204, 'Huara', 2), (2205, 'Pica', 2),
-- Región de Antofagasta (3)
(3101, 'Antofagasta', 3), (3102, 'Mejillones', 3), (3103, 'Sierra Gorda', 3), (3104, 'Taltal', 3), (3201, 'Calama', 3), (3202, 'Ollagüe', 3), (3203, 'San Pedro de Atacama', 3), (3301, 'María Elena', 3), (3302, 'Tocopilla', 3),
-- Región de Atacama (4)
(4101, 'Copiapó', 4), (4102, 'Caldera', 4), (4103, 'Tierra Amarilla', 4), (4201, 'Chañaral', 4), (4202, 'Diego de Almagro', 4), (4301, 'Vallenar', 4), (4302, 'Alto del Carmen', 4), (4303, 'Freirina', 4), (4304, 'Huasco', 4),
-- Región de Coquimbo (5)
(5101, 'La Serena', 5), (5102, 'Coquimbo', 5), (5103, 'Andacollo', 5), (5104, 'La Higuera', 5), (5105, 'Paiguano', 5), (5106, 'Vicuña', 5), (5201, 'Illapel', 5), (5202, 'Canela', 5), (5203, 'Los Vilos', 5), (5204, 'Salamanca', 5), (5301, 'Ovalle', 5), (5302, 'Combarbalá', 5), (5303, 'Monte Patria', 5), (5304, 'Punitaqui', 5), (5305, 'Río Hurtado', 5),
-- Región de Valparaíso (6)
(6101, 'Valparaíso', 6), (6102, 'Casablanca', 6), (6103, 'Concón', 6), (6104, 'Juan Fernández', 6), (6105, 'Puchuncaví', 6), (6107, 'Quintero', 6), (6109, 'Viña del Mar', 6), (6201, 'Isla de Pascua', 6), (6301, 'Los Andes', 6), (6302, 'Calle Larga', 6), (6303, 'Rinconada', 6), (6304, 'San Esteban', 6), (6401, 'La Ligua', 6), (6402, 'Cabildo', 6), (6403, 'Papudo', 6), (6404, 'Petorca', 6), (6405, 'Zapallar', 6), (6501, 'Quillota', 6), (6502, 'Calera', 6), (6503, 'Hijuelas', 6), (6504, 'La Cruz', 6), (6505, 'Nogales', 6), (6601, 'San Antonio', 6), (6602, 'Algarrobo', 6), (6603, 'Cartagena', 6), (6604, 'El Quisco', 6), (6605, 'El Tabo', 6), (6606, 'Santo Domingo', 6), (6701, 'San Felipe', 6), (6702, 'Catemu', 6), (6703, 'Llaillay', 6), (6704, 'Panquehue', 6), (6705, 'Putaendo', 6), (6706, 'Santa María', 6), (6801, 'Quilpué', 6), (6802, 'Limache', 6), (6803, 'Olmué', 6), (6804, 'Villa Alemana', 6),
-- Región Metropolitana (13)
(13101, 'Santiago', 13), (13102, 'Cerrillos', 13), (13103, 'Cerro Navia', 13), (13104, 'Conchalí', 13), (13105, 'El Bosque', 13), (13106, 'Estación Central', 13), (13107, 'Huechuraba', 13), (13108, 'Independencia', 13), (13109, 'La Cisterna', 13), (13110, 'La Florida', 13), (13111, 'La Granja', 13), (13112, 'La Pintana', 13), (13113, 'La Reina', 13), (13114, 'Las Condes', 13), (13115, 'Lo Barnechea', 13), (13116, 'Lo Espejo', 13), (13117, 'Lo Prado', 13), (13118, 'Macul', 13), (13119, 'Maipú', 13), (13120, 'Ñuñoa', 13), (13121, 'Pedro Aguirre Cerda', 13), (13122, 'Peñalolén', 13), (13123, 'Providencia', 13), (13124, 'Pudahuel', 13), (13125, 'Quilicura', 13), (13126, 'Quinta Normal', 13), (13127, 'Recoleta', 13), (13128, 'Renca', 13), (13129, 'San Joaquín', 13), (13130, 'San Miguel', 13), (13131, 'San Ramón', 13), (13132, 'Vitacura', 13), (13201, 'Puente Alto', 13), (13202, 'Pirque', 13), (13203, 'San José de Maipo', 13), (13301, 'Colina', 13), (13302, 'Lampa', 13), (13303, 'Tiltil', 13), (13401, 'San Bernardo', 13), (13402, 'Buin', 13), (13403, 'Calera de Tango', 13), (13404, 'Paine', 13), (13501, 'Melipilla', 13), (13502, 'Alhué', 13), (13503, 'Curacaví', 13), (13504, 'María Pinto', 13), (13505, 'San Pedro', 13), (13601, 'Talagante', 13), (13602, 'El Monte', 13), (13603, 'Isla de Maipo', 13), (13604, 'Padre Hurtado', 13), (13605, 'Peñaflor', 13),
-- Región de O'Higgins (7)
(7101, 'Rancagua', 7), (7102, 'Codegua', 7), (7103, 'Coinco', 7), (7104, 'Coltauco', 7), (7105, 'Doñihue', 7), (7106, 'Graneros', 7), (7107, 'Las Cabras', 7), (7108, 'Machalí', 7), (7109, 'Malloa', 7), (7110, 'Mostazal', 7), (7111, 'Olivar', 7), (7112, 'Peumo', 7), (7113, 'Pichidegua', 7), (7114, 'Quinta de Tilcoco', 7), (7115, 'Rengo', 7), (7116, 'Requínoa', 7), (7117, 'San Vicente', 7), (7201, 'Pichilemu', 7), (7202, 'La Estrella', 7), (7203, 'Litueche', 7), (7204, 'Marchihue', 7), (7205, 'Navidad', 7), (7206, 'Paredones', 7), (7301, 'San Fernando', 7), (7302, 'Chépica', 7), (7303, 'Chimbarongo', 7), (7304, 'Lolol', 7), (7305, 'Nancagua', 7), (7306, 'Palmilla', 7), (7307, 'Peralillo', 7), (7308, 'Placilla', 7), (7309, 'Pumanque', 7), (7310, 'Santa Cruz', 7),
-- Región del Maule (8)
(8101, 'Talca', 8), (8102, 'Constitución', 8), (8103, 'Curepto', 8), (8104, 'Empedrado', 8), (8105, 'Maule', 8), (8106, 'Pelarco', 8), (8107, 'Pencahue', 8), (8108, 'Río Claro', 8), (8109, 'San Clemente', 8), (8110, 'San Rafael', 8), (8201, 'Cauquenes', 8), (8202, 'Chanco', 8), (8203, 'Pelluhue', 8), (8301, 'Curicó', 8), (8302, 'Hualañé', 8), (8303, 'Licantén', 8), (8304, 'Molina', 8), (8305, 'Rauco', 8), (8306, 'Romeral', 8), (8307, 'Sagrada Familia', 8), (8308, 'Teno', 8), (8309, 'Vichuquén', 8), (8401, 'Linares', 8), (8402, 'Colbún', 8), (8403, 'Longaví', 8), (8404, 'Parral', 8), (8405, 'Retiro', 8), (8406, 'San Javier', 8), (8407, 'Villa Alegre', 8), (8408, 'Yerbas Buenas', 8),
-- Región de Ñuble (16)
(16101, 'Chillán', 16), (16102, 'Bulnes', 16), (16103, 'Chillán Viejo', 16), (16104, 'El Carmen', 16), (16105, 'Pemuco', 16), (16106, 'Pinto', 16), (16107, 'Quillón', 16), (16108, 'San Ignacio', 16), (16109, 'Yungay', 16), (16201, 'Quirihue', 16), (16202, 'Cobquecura', 16), (16203, 'Coelemu', 16), (16204, 'Ninhue', 16), (16205, 'Portezuelo', 16), (16206, 'Ránquil', 16), (16207, 'Treguaco', 16), (16301, 'San Carlos', 16), (16302, 'Coihueco', 16), (16303, 'Ñiquén', 16), (16304, 'San Fabián', 16), (16305, 'San Nicolás', 16),
-- Región del Biobío (9)
(9101, 'Concepción', 9), (9102, 'Coronel', 9), (9103, 'Chiguayante', 9), (9104, 'Florida', 9), (9105, 'Hualqui', 9), (9106, 'Lota', 9), (9107, 'Penco', 9), (9108, 'San Pedro de la Paz', 9), (9109, 'Santa Juana', 9), (9110, 'Talcahuano', 9), (9111, 'Tomé', 9), (9112, 'Hualpén', 9), (9201, 'Lebu', 9), (9202, 'Arauco', 9), (9203, 'Cañete', 9), (9204, 'Contulmo', 9), (9205, 'Curanilahue', 9), (9206, 'Los Álamos', 9), (9207, 'Tirúa', 9), (9301, 'Los Ángeles', 9), (9302, 'Antuco', 9), (9303, 'Cabrero', 9), (9304, 'Laja', 9), (9305, 'Mulchén', 9), (9306, 'Nacimiento', 9), (9307, 'Negrete', 9), (9308, 'Quilaco', 9), (9309, 'Quilleco', 9), (9310, 'San Rosendo', 9), (9311, 'Santa Bárbara', 9), (9312, 'Tucapel', 9), (9313, 'Yumbel', 9), (9314, 'Alto Biobío', 9),
-- Región de la Araucanía (10)
(10101, 'Temuco', 10), (10102, 'Carahue', 10), (10103, 'Cunco', 10), (10104, 'Curarrehue', 10), (10105, 'Freire', 10), (10106, 'Galvarino', 10), (10107, 'Gorbea', 10), (10108, 'Lautaro', 10), (10109, 'Loncoche', 10), (10110, 'Melipeuco', 10), (10111, 'Nueva Imperial', 10), (10112, 'Padre Las Casas', 10), (10113, 'Perquenco', 10), (10114, 'Pitrufquén', 10), (10115, 'Pucón', 10), (10116, 'Saavedra', 10), (10117, 'Teodoro Schmidt', 10), (10118, 'Toltén', 10), (10119, 'Vilcún', 10), (10120, 'Villarrica', 10), (10121, 'Cholchol', 10), (10201, 'Angol', 10), (10202, 'Collipulli', 10), (10203, 'Curacautín', 10), (10204, 'Ercilla', 10), (10205, 'Lonquimay', 10), (10206, 'Los Sauces', 10), (10207, 'Lumaco', 10), (10208, 'Purén', 10), (10209, 'Renaico', 10), (10210, 'Traiguén', 10), (10211, 'Victoria', 10),
-- Región de Los Ríos (14)
(14101, 'Valdivia', 14), (14102, 'Corral', 14), (14103, 'Lanco', 14), (14104, 'Los Lagos', 14), (14105, 'Máfil', 14), (14106, 'Mariquina', 14), (14107, 'Paillaco', 14), (14108, 'Panguipulli', 14), (14201, 'La Unión', 14), (14202, 'Futrono', 14), (14203, 'Lago Ranco', 14), (14204, 'Río Bueno', 14),
-- Región de Los Lagos (15)
(15101, 'Puerto Montt', 15), (15102, 'Calbuco', 15), (15103, 'Cochamó', 15), (15104, 'Fresia', 15), (15105, 'Frutillar', 15), (15106, 'Los Muermos', 15), (15107, 'Llanquihue', 15), (15108, 'Maullín', 15), (15109, 'Puerto Varas', 15), (15201, 'Castro', 15), (15202, 'Ancud', 15), (15203, 'Chonchi', 15), (15204, 'Curaco de Vélez', 15), (15205, 'Dalcahue', 15), (15206, 'Puqueldón', 15), (15207, 'Queilén', 15), (15208, 'Quellón', 15), (15209, 'Quemchi', 15), (15210, 'Quinchao', 15), (15301, 'Osorno', 15), (15302, 'Puerto Octay', 15), (15303, 'Purranque', 15), (15304, 'Puyehue', 15), (15305, 'Río Negro', 15), (15306, 'San Juan de la Costa', 15), (15307, 'San Pablo', 15), (15401, 'Chaitén', 15), (15402, 'Futaleufú', 15), (15403, 'Hualaihué', 15), (15404, 'Palena', 15),
-- Región de Aysén (11)
(11101, 'Coyhaique', 11), (11102, 'Lago Verde', 11), (11201, 'Aysén', 11), (11202, 'Cisnes', 11), (11203, 'Guaitecas', 11), (11301, 'Cochrane', 11), (11302, "O'Higgins", 11), (11303, 'Tortel', 11), (11401, 'Chile Chico', 11), (11402, 'Río Ibáñez', 11),
-- Región de Magallanes (12)
(12101, 'Punta Arenas', 12), (12102, 'Laguna Blanca', 12), (12103, 'Río Verde', 12), (12104, 'San Gregorio', 12), (12201, 'Cabo de Hornos', 12), (12202, 'Antártica', 12), (12301, 'Porvenir', 12), (12302, 'Primavera', 12), (12303, 'Timaukel', 12), (12401, 'Natales', 12), (12402, 'Torres del Paine', 12)
ON CONFLICT (commune_id) DO NOTHING;

-- STEP 4: Provider schema changes
ALTER TABLE providers ADD COLUMN IF NOT EXISTS specialty_id UUID REFERENCES specialties(specialty_id);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS timezone_id INT REFERENCES timezones(id);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS password_reset_token TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMPTZ;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS phone_app TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS phone_contact TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS address_number TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS address_complement TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS address_sector TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS region_id INT REFERENCES regions(region_id);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS commune_id INT REFERENCES communes(commune_id);

-- STEP 5: Migrate existing specialty TEXT → specialty_id FK
UPDATE providers SET specialty_id = (
  SELECT specialty_id FROM specialties WHERE name = providers.specialty LIMIT 1
) WHERE specialty IS NOT NULL AND specialty != '';

-- STEP 6: Migrate existing timezone TEXT → timezone_id FK
UPDATE providers SET timezone_id = (
  SELECT id FROM timezones WHERE name = providers.timezone LIMIT 1
) WHERE timezone IS NOT NULL AND timezone != '';

-- STEP 7: Create indexes
CREATE INDEX IF NOT EXISTS idx_providers_specialty ON providers(specialty_id);
CREATE INDEX IF NOT EXISTS idx_providers_timezone ON providers(timezone_id);
CREATE INDEX IF NOT EXISTS idx_providers_region ON providers(region_id);
CREATE INDEX IF NOT EXISTS idx_providers_commune ON providers(commune_id);

-- STEP 8: RLS for new tables
ALTER TABLE specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialties FORCE ROW LEVEL SECURITY;
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions FORCE ROW LEVEL SECURITY;
ALTER TABLE communes ENABLE ROW LEVEL SECURITY;
ALTER TABLE communes FORCE ROW LEVEL SECURITY;
