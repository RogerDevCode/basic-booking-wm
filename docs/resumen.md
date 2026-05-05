# Plan de Erradicación de Valores Hardcodeados y Migración a Base de Datos

## VISIÓN ARQUITECTÓNICA: DOMAIN-DRIVEN DESIGN (DDD)

Para garantizar la escalabilidad y flexibilidad del sistema Multi-tenant, debemos erradicar las configuraciones hardcodeadas y migrar hacia un esquema basado en el dominio de los datos. 

**Principio Fundamental:** Rechazamos el antipatrón de una mega-tabla genérica (ej. `system_config` tipo EAV - Entity Attribute Value). Las "configuraciones" de un proveedor o servicio no son datos huérfanos; son propiedades intrínsecas de sus respectivas entidades. Su separación en tablas específicas garantiza integridad referencial, tipado estricto en SQL y evita cuellos de botella por consultas globales.

---

## ROADMAP DE MIGRACIÓN POR DOMINIOS

### DOMINIO 1: Clínicas y Profesionales (Tabla `providers`)
Las configuraciones que dictan cómo opera un profesional o clínica deben vivir directamente en su registro.

- [ ] **Migración de Preferencias Regionales**
  - **Dato actual:** `DEFAULT_TIMEZONE = "America/Santiago"` en `_config.py`.
  - **Destino:** Columna `timezone` (TEXT, NOT NULL) en la tabla `providers`.
  - **Responsabilidad:** Cada profesional dicta en qué zona horaria opera. Los cálculos de disponibilidad (`availability_check`) deben hacer un JOIN o consultar este campo en lugar de usar constantes globales.
- [ ] **Migración de Preferencias de UI/UX**
  - **Datos actuales:** `MAX_SLOTS_DISPLAYED` (10), `MAX_BOOKINGS_PER_QUERY` (20) en `_config.py`.
  - **Destino:** Nueva columna `ui_preferences` (JSONB) en la tabla `providers`. Ejemplo: `{"max_slots": 10, "max_history": 20}`.
  - **Responsabilidad:** Permite que Clínicas Premium muestren más opciones que clínicas estándar, aislando la experiencia visual por Tenant.

### DOMINIO 2: Catálogo de Servicios (Tabla `services`)
Las reglas de negocio que definen un procedimiento médico pertenecen a su propia entidad, no a la configuración del sistema.

- [ ] **Migración de Tiempos Operativos**
  - **Datos actuales:** `DEFAULT_SERVICE_DURATION_MIN` (30), `DEFAULT_BUFFER_TIME_MIN` (10) en `_config.py`.
  - **Destino:** Columnas `duration_minutes` (INT) y `buffer_minutes` (INT) en la tabla `services`.
  - **Responsabilidad:** Un "Control de Rutina" dura 15 min y un "Procedimiento Quirúrgico" dura 120 min. El motor de agendamiento (`scheduling_engine`) debe rechazar la creación de citas si el servicio no define sus propios tiempos.

### DOMINIO 3: Pacientes (Tabla `clients`)
Los datos de localización y preferencias de comunicación de los usuarios.

- [ ] **Migración de Zona Horaria del Paciente**
  - **Dato actual:** Asunciones locales al registrar o parsear fechas.
  - **Destino:** Columna `timezone` (TEXT) en la tabla `clients` (Ya implementado parcialmente).
  - **Responsabilidad:** Permite notificaciones precisas y conversiones de hora si el paciente viaja o agenda consultas telemáticas desde otro país.

### DOMINIO 4: Inteligencia Artificial y NLU (Nueva Tabla `nlu_rules`)
El comportamiento del agente conversacional no debe requerir un nuevo despliegue (PR) para ajustarse.

- [ ] **Migración de Umbrales y Diccionarios**
  - **Datos actuales:** `CONFIDENCE_THRESHOLDS`, `INTENT_KEYWORDS`, `GREETINGS`, `FAREWELLS`, `PROFANITY_TO_IGNORE` en `f/internal/ai_agent/_constants.py`.
  - **Destino:** Nueva tabla `nlu_rules` (Columnas: `rule_key` TEXT PK, `threshold_value` FLOAT, `keywords` JSONB).
  - **Responsabilidad:** Aislar la afinación del modelo del código fuente. 
  - **Estrategia de Rendimiento:** Dado que estos datos se consultan en *cada* mensaje, deben ser cargados en Redis al arrancar el contenedor o cacheados con un TTL largo, exponiendo un endpoint de invalidación (Webhook) al modificarlos en la BD.

### DOMINIO 5: Textos y Localización (Nueva Tabla `system_messages` o Archivos i18n)
La mensajería de interacción de Telegram no es lógica de negocio.

- [ ] **Migración de Cadenas de Texto de Interfaz**
  - **Datos actuales:** `_MSG_SLOT_TAKEN`, `MAIN_MENU_TEXT` y respuestas en `f/booking_confirm/main.py` y `_fsm_machine.py`.
  - **Destino:** Si se requiere edición por el cliente final, usar tabla `tenant_messages` (asociada al `provider_id`). Si es estandarización, usar archivos de localización formales (i18n locales) que se inyectan al compilado.
  - **Responsabilidad:** Desacoplar el rol del Copywriter del Desarrollador.

---

## EXCEPCIONES: HARDCODING ACEPTABLE (SAFEGUARDS)

Los siguientes elementos NO deben migrarse a base de datos, ya que protegen la estabilidad del hardware y definen la topología de la red:

1. **Límites Físicos (Circuit Breakers):** `MAX_RETRIES_API`, `TIMEOUT_SECONDS`, límites máximos de Pydantic (`max_length=500` en campos de texto para evitar OOM o inyecciones kilométricas).
2. **Topología de Red:** URLs absolutas de APIs externas (ej. `api.telegram.org` o endpoints de Google Calendar). Las credenciales viajan por variables de entorno, pero los endpoints son constantes.
3. **Esquemas Estáticos (Types):** Identificadores de Estados de Máquina Finita (FSM: `INIT`, `CONFIRMING`), `Literal[]` en tipado estricto, que mapean 1:1 con la lógica compilada.
