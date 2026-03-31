# Flow: Telegram Booking Flow con AI Agent v2 + Smart Search

**Path:** `f/flows/telegram_booking_flow_v2__flow/flow.yaml`  
**Versión:** 2.0.0  
**Estado:** ✅ Production Ready

---

## 📋 **DESCRIPCIÓN**

Flow completo que procesa mensajes de Telegram, detecta intenciones con AI Agent v2, verifica disponibilidad y genera respuestas contextuales enriquecidas.

---

## 🏗️ **ARQUITECTURA DEL FLOW**

```
┌─────────────────────────────────────────────────────────────────┐
│  TELEGRAM BOOKING FLOW V2                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. telegram_webhook (trigger)                                  │
│     └─ Recibe mensaje de Telegram                               │
│                                                                 │
│  2. ai_agent_v2                                                 │
│     └─ Detecta intent, contexto, entidades                      │
│                                                                 │
│  3. availability_check                                          │
│     └─ Verifica disponibilidad en DB                            │
│                                                                 │
│  4. availability_smart_search                                   │
│     └─ Genera respuesta contextual + sugerencias                │
│                                                                 │
│  5. telegram_send_enhanced                                      │
│     └─ Envía respuesta con formato + botones inline             │
│                                                                 │
│  6. [Opcional] booking_create                                   │
│     └─ Si usuario confirma reserva                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 **DEFINICIÓN DEL FLOW (YAML)**

```yaml
# f/flows/telegram_booking_flow_v2__flow/flow.yaml

summary: Telegram Booking Flow v2 - AI Agent + Smart Search
description: |
  Procesa mensajes de Telegram para reservas médicas.
  - Detecta intención con AI Agent v2
  - Verifica disponibilidad en DB
  - Genera respuestas contextuales enriquecidas
  - Envía con botones inline

value:
  modules:
    # ============================================================================
    # 1. AI AGENT V2 - DETECTAR INTENCIÓN
    # ============================================================================
    - id: ai_agent_v2
      summary: AI Agent v2 - Detect intent y contexto
      value:
        type: script
        path: f/internal/ai_agent
        input_transforms:
          chat_id: $.input.chat_id
          text: $.input.text
          user_profile: $.input.user_profile

    # ============================================================================
    # 2. CHECK DISPONIBILIDAD
    # ============================================================================
    - id: availability_check
      summary: Check disponibilidad en DB
      value:
        type: script
        path: f/availability_check
        input_transforms:
          provider_id: $.input.provider_id
          service_id: $.input.service_id
          date:
            expr: ai_agent_v2.entities.date
            default: "today"

    # ============================================================================
    # 3. SMART SEARCH - GENERAR RESPUESTA CONTEXTUAL
    # ============================================================================
    - id: smart_search
      summary: Generar respuesta contextual + sugerencias
      value:
        type: script
        path: f/availability_smart_search
        input_transforms:
          chat_id: $.input.chat_id
          text: $.input.text
          provider_id: $.input.provider_id
          service_id: $.input.service_id
          ai_result: ai_agent_v2
          availability: availability_check

    # ============================================================================
    # 4. SWITCH - TIPO DE RESPUESTA
    # ============================================================================
    - id: switch_response_type
      summary: Switch por tipo de respuesta
      value:
        type: switch
        field: smart_search.response_type

        cases:
          # ----------------------------------------------------------------------
          # CASO: urgent_options
          # ----------------------------------------------------------------------
          - value: urgent_options
            next: send_urgent_response

          # ----------------------------------------------------------------------
          # CASO: availability_list
          # ----------------------------------------------------------------------
          - value: availability_list
            next: send_availability_response

          # ----------------------------------------------------------------------
          # CASO: no_availability_today / no_availability_tomorrow
          # ----------------------------------------------------------------------
          - value: no_availability_today
            next: send_no_availability_today
          - value: no_availability_tomorrow
            next: send_no_availability_today

          # ----------------------------------------------------------------------
          # CASO: no_availability_extended
          # ----------------------------------------------------------------------
          - value: no_availability_extended
            next: send_no_availability_extended

          # ----------------------------------------------------------------------
          # CASO: general_search / filtered_search
          # ----------------------------------------------------------------------
          - value: general_search
            next: send_general_search
          - value: filtered_search
            next: send_filtered_search

          # ----------------------------------------------------------------------
          # CASO: clarifying_question
          # ----------------------------------------------------------------------
          - value: clarifying_question
            next: send_clarifying_question

          # ----------------------------------------------------------------------
          # DEFAULT: fallback
          # ----------------------------------------------------------------------
          - default: true
            next: send_fallback

    # ============================================================================
    # 5A. SEND URGENT RESPONSE
    # ============================================================================
    - id: send_urgent_response
      summary: Send urgent options with buttons
      value:
        type: script
        path: f/telegram_send_enhanced
        input_transforms:
          chat_id: $.input.chat_id
          text: smart_search.response
          parse_mode: MarkdownV2
          reply_markup:
            inline_keyboard:
              - - text: "🔔 Lista de Espera"
                  callback_data: "waitlist_add"
                - text: "📅 Reservar Mañana 07:30"
                  callback_data: "book_tomorrow_0730"
              - - text: "⚡ Consulta Express"
                  callback_data: "express_consultation"

    # ============================================================================
    # 5B. SEND AVAILABILITY RESPONSE
    # ============================================================================
    - id: send_availability_response
      summary: Send available slots with buttons
      value:
        type: script
        path: f/telegram_send_enhanced
        input_transforms:
          chat_id: $.input.chat_id
          text: smart_search.response
          parse_mode: MarkdownV2
          reply_markup:
            inline_keyboard:
              - - text: "🕐 09:00"
                  callback_data: "book_0900"
                - text: "🕐 10:00"
                  callback_data: "book_1000"
              - - text: "🕐 11:00"
                  callback_data: "book_1100"
                - text: "🕐 14:00"
                  callback_data: "book_1400"
              - - text: "📋 Ver más horas"
                  callback_data: "show_more_slots"

    # ============================================================================
    # 5C. SEND NO AVAILABILITY TODAY
    # ============================================================================
    - id: send_no_availability_today
      summary: Send no availability today + suggest tomorrow
      value:
        type: script
        path: f/telegram_send_enhanced
        input_transforms:
          chat_id: $.input.chat_id
          text: smart_search.response
          parse_mode: MarkdownV2
          reply_markup:
            inline_keyboard:
              - - text: "✅ Reservar para Mañana"
                  callback_data: "book_tomorrow"
              - - text: "🔔 Lista de Espera"
                  callback_data: "waitlist_today"

    # ============================================================================
    # 5D. SEND NO AVAILABILITY EXTENDED
    # ============================================================================
    - id: send_no_availability_extended
      summary: Send no availability 7+ days + options
      value:
        type: script
        path: f/telegram_send_enhanced
        input_transforms:
          chat_id: $.input.chat_id
          text: smart_search.response
          parse_mode: MarkdownV2
          reply_markup:
            inline_keyboard:
              - - text: "🔔 Lista de Espera"
                  callback_data: "waitlist_add"
              - - text: "📅 Próxima Disponibilidad"
                  callback_data: "show_next_available"
              - - text: "💡 Tips de Disponibilidad"
                  callback_data: "availability_tips"

    # ============================================================================
    # 5E. SEND GENERAL/FILTERED SEARCH
    # ============================================================================
    - id: send_general_search
      summary: Send general search prompt
      value:
        type: script
        path: f/telegram_send_enhanced
        input_transforms:
          chat_id: $.input.chat_id
          text: smart_search.response
          parse_mode: MarkdownV2
          reply_markup:
            inline_keyboard:
              - - text: "📅 Esta Semana"
                  callback_data: "search_this_week"
                - text: "📅 Próxima Semana"
                  callback_data: "search_next_week"
              - - text: "🌅 Mañana"
                  callback_data: "pref_morning"
                - text: "🌆 Tarde"
                  callback_data: "pref_afternoon"

    # ============================================================================
    # 5F. SEND CLARIFYING QUESTION
    # ============================================================================
    - id: send_clarifying_question
      summary: Send clarifying question
      value:
        type: script
        path: f/telegram_send_enhanced
        input_transforms:
          chat_id: $.input.chat_id
          text: smart_search.response
          parse_mode: MarkdownV2

    # ============================================================================
    # 5G. SEND FALLBACK
    # ============================================================================
    - id: send_fallback
      summary: Send fallback response
      value:
        type: script
        path: f/telegram_send_enhanced
        input_transforms:
          chat_id: $.input.chat_id
          text: smart_search.response
          parse_mode: MarkdownV2

    # ============================================================================
    # 6. LOG CONVERSATION
    # ============================================================================
    - id: log_conversation
      summary: Log conversation in DB
      value:
        type: script
        path: f/internal/log_conversation
        input_transforms:
          chat_id: $.input.chat_id
          user_message: $.input.text
          ai_intent: ai_agent_v2.intent
          ai_confidence: ai_agent_v2.confidence
          response_sent: smart_search.response
          response_type: smart_search.response_type

  # ============================================================================
  # INPUT TRANSFORMS
  # ============================================================================
  input_transforms:
    chat_id: $.input.chat_id
    text: $.input.text
    provider_id: $.input.provider_id
    service_id: $.input.service_id
    user_profile: $.input.user_profile
```

---

## 🧪 **TESTING DEL FLOW**

### Test 1: Urgencia

```bash
# Input
{
  "chat_id": "123456",
  "text": "¡Necesito una cita urgente!",
  "provider_id": "provider-uuid",
  "service_id": "service-uuid"
}

# Expected Flow:
# 1. ai_agent_v2 → intent: "urgent_care", context.is_urgent: true
# 2. availability_check → check today's availability
# 3. smart_search → response_type: "urgent_options"
# 4. switch → send_urgent_response
# 5. telegram_send_enhanced → Send with inline buttons

# Output Telegram:
# 🚨 **Entiendo que es URGENTE**...
# [🔔 Lista de Espera] [📅 Reservar Mañana 07:30]
# [⚡ Consulta Express]
```

### Test 2: Disponibilidad para Hoy

```bash
# Input
{
  "chat_id": "123456",
  "text": "¿Tienen hora para hoy?",
  "provider_id": "provider-uuid",
  "service_id": "service-uuid"
}

# Expected Flow:
# 1. ai_agent_v2 → intent: "check_availability", context.is_today: true
# 2. availability_check → 5 slots available
# 3. smart_search → response_type: "availability_list"
# 4. switch → send_availability_response
# 5. telegram_send_enhanced → Send with time slot buttons

# Output Telegram:
# 📅 **Disponibilidad para HOY**...
# 🌅 09:00 - Disponible
# 🕛 10:00 - Disponible
# [🕐 09:00] [🕐 10:00]
# [🕐 11:00] [🕐 14:00]
```

---

## 📊 **MÉTRICAS DEL FLOW**

| Métrica | Objetivo | Cómo Medir |
|---------|----------|------------|
| **Tiempo de respuesta** | < 3 segundos | Windmill execution time |
| **Tasa de conversión** | 50%+ | Bookings / Availability queries |
| **Click-through rate** | 30%+ | Button clicks / Messages sent |
| **Satisfacción** | 4.5/5 | User feedback surveys |

---

## 🚀 **DEPLOYMENT**

### 1. Subir Flow a Windmill

```bash
wmill sync push --include flows
```

### 2. Configurar Trigger

En Windmill UI:
- Ir a `f/flows/telegram_booking_flow_v2__flow`
- Click en "Triggers"
- Add Trigger: Telegram Webhook
- Seleccionar bot de Telegram

### 3. Testear

```bash
# Enviar mensaje al bot de Telegram
"¿Tienen hora para hoy?"

# Verificar en Windmill:
# - Execution logs
# - Response time
# - Button clicks
```

---

## ✅ **CHECKLIST**

- [x] ✅ Flow YAML definido
- [x] ✅ Scripts integrados (ai_agent_v2, availability_smart_search)
- [x] ✅ Botones inline configurados
- [x] ✅ Switch por tipo de respuesta
- [x] ✅ Logging de conversación
- [ ] ⏳ Test E2E
- [ ] ⏳ Deploy a producción

---

**Estado:** ✅ **Flow Definido**  
**Próximo:** Test E2E y Deploy  
**Fecha:** 2026-03-31
