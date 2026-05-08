# Notas de Diseño UI/UX para Módulo de Recordatorios

**Objetivo:** Proveer una guía clara para la implementación de la interfaz de usuario en Telegram (y sentar bases para la futura Web UI), garantizando una experiencia predecible, no intrusiva y que refleje con exactitud el estado del backend.

## 1. Menú de Telegram (Inline Keyboard)

La configuración de recordatorios en Telegram no debe requerir que el usuario escriba comandos de texto. Todo debe operar mediante botones *Inline* que editen el mensaje actual (in-place) para no inundar el chat.

### Estructura Visual Recomendada

```text
🔔 *Configuración de Recordatorios*

Tus notificaciones están programadas según la zona horaria de la clínica.
Las notificaciones nocturnas (22:00 - 08:00) se pospondrán para las 06:00 AM del día de tu cita.

Canales Activos:
[📱 Telegram: ACTIVO ✅]
[📧 Email: INACTIVO ❌]

Tiempos de Aviso (Toca para alternar):
[☑️ 1 día antes]  [☑️ 24 horas]
[☐ 12 horas]      [☑️ 6 horas]
[☑️ 2 horas]      [☐ 1 hora]
[☑️ 30 minutos]

[🔕 Desactivar todo]
[« Volver al Menú Principal]
```

### Reglas de Interacción (UX)

1. **Feedback Inmediato:** Al tocar un botón (ej. `[☐ 12 horas]`), el bot debe procesar el callback, actualizar la base de datos y *editar el mismo mensaje* cambiando el icono a `[☑️ 12 horas]`. No enviar un mensaje nuevo.
2. **Estados Mutuamente Excluyentes (Visuales):** 
   - Si el usuario toca "Desactivar todo", todos los canales y ventanas cambian a estado inactivo (`❌` y `☐`).
   - Si no hay ningún canal activo, el sistema debe mostrar una advertencia visual sutil en el texto: `⚠️ No tienes canales seleccionados. No recibirás avisos.`
3. **Claridad Semántica:**
   - "1 día antes" = 08:00 AM del día anterior.
   - "24 horas" = Exactamente 24 horas antes de la cita.
   - (Nota: Si UX lo prefiere, se pueden fusionar visualmente si causan confusión, pero a nivel de sistema deben ser flags independientes).

## 2. Pautas para Frontend Web (Próxima Iteración)

Cuando se implemente esta configuración en el Dashboard Web de Pacientes (`web_patient_profile`):

1. **Componente de Switches:** Usar *Toggle Switches* en lugar de Checkboxes para los canales (Telegram / Email) para transmitir la idea de activación global.
2. **Timeline de Eventos:** Para ilustrar las ventanas de tiempo, usar una representación gráfica (timeline horizontal) que muestre la cita a la derecha y los puntos de aviso a la izquierda.
3. **Indicador de Quiet Hours:** Si el usuario selecciona un aviso de "2 horas" para una cita a las 08:00 AM, la interfaz web debe mostrar un tooltip: `🌙 Este aviso cae en horario de descanso. Te notificaremos a las 06:00 AM.`

## 3. Formato de los Mensajes de Recordatorio

El mensaje que efectivamente recibe el usuario cuando se dispara el cron debe seguir este formato estandarizado:

```text
🔔 *Recordatorio de Cita* 🔔

Hola, {nombre_paciente}. Te recordamos tu cita próxima:

👨‍⚕️ Especialista: {nombre_doctor}
🏥 Servicio: {nombre_servicio}
📅 Fecha: {fecha_formateada}
⏰ Hora: {hora_formateada}

🔖 Ref: {booking_short_id}

[❌ Cancelar Cita] [🔄 Reagendar]
```

**Importante:** Los botones de "Cancelar" y "Reagendar" deben inyectar callbacks compatibles con el FSM de booking existente, permitiendo al usuario tomar acción directa desde el recordatorio sin tener que navegar por el menú principal.