# Telegram Booking Flow — Improved Happy Path

## ✅ Complete User Journey: `/start` → Booking Created

### Step 1: `/start` Command
```
┌─────────────────────────────────────────┐
│ ¡Bienvenido al sistema de citas        │
│ médicas!                                 │
│                                          │
│ ¿Qué deseas hacer?                       │
├─────────────────────────────────────────┤
│ [📅 Agendar cita]                        │
│ [📋 Mis citas] [🔔 Recordatorios]       │
│ [ℹ️ Información]                         │
└─────────────────────────────────────────┘
```
**Context:** Initial menu, clean and minimal  
**Menu shown:** Main menu (contextual)  
**Next step:** User clicks "📅 Agendar cita"

---

### Step 2: Select Specialty
```
┌─────────────────────────────────────────┐
│ Selecciona la especialidad que           │
│ necesitas:                               │
├─────────────────────────────────────────┤
│ [Cardiología] [Medicina General]         │
│ [Odontología] [Dermatología]             │
│ [⬅️ Volver] [❌ Cancelar]                │
└─────────────────────────────────────────┘
```
**Context:** In wizard flow, selecting specialty  
**Menu shown:** Specialty buttons only (no redundant list, no dual UI)  
**User clicks:** "Cardiología"  
**State:** `selecting_specialty` → `selecting_doctor`

---

### Step 3: Select Doctor
```
┌─────────────────────────────────────────┐
│ ¿Con qué doctor deseas tu cita?          │
├─────────────────────────────────────────┤
│ [Dr. García] [Dra. López]                │
│ [Dr. Martínez]                           │
│ [⬅️ Volver] [❌ Cancelar]                │
└─────────────────────────────────────────┘
```
**Context:** Specialty selected, now choosing doctor  
**Menu shown:** Doctor buttons only (contextual, no specialty name redundant)  
**User clicks:** "Dr. García"  
**State:** `selecting_doctor` → `selecting_time`

---

### Step 4: Select Time Slot
```
┌─────────────────────────────────────────┐
│ ¿Qué horario prefieres?                  │
├─────────────────────────────────────────┤
│ [Hoy 10:00] [Hoy 11:00]                  │
│ [Mañana 14:00] [Mañana 15:00]            │
│ [⬅️ Volver] [❌ Cancelar]                │
└─────────────────────────────────────────┘
```
**Context:** Doctor selected, now choosing time  
**Menu shown:** Time slot buttons only (no redundant doctor name)  
**User clicks:** "Hoy 10:00"  
**State:** `selecting_time` → `confirming`

---

### Step 5: Confirmation
```
┌─────────────────────────────────────────┐
│ 📋 *Confirmar Cita*                      │
│                                          │
│ Doctor: Dr. García                       │
│ Horario: Hoy 10:00                       │
│                                          │
│ ¿Confirmas esta cita? Responde "sí"    │
│ o "no".                                  │
├─────────────────────────────────────────┤
│ [✅ Sí, confirmar] [❌ No, volver]       │
└─────────────────────────────────────────┘
```
**Context:** All details chosen, ready to confirm  
**Menu shown:** Yes/No buttons (final decision)  
**User clicks:** "✅ Sí, confirmar"  
**State:** `confirming` → `completed`

---

### Step 6: Success (Booking Created)
```
┌─────────────────────────────────────────┐
│ ✅ Cita confirmada correctamente.        │
│                                          │
│ Tu cita ha sido agendada:                │
│ • Doctor: Dr. García                     │
│ • Especialidad: Cardiología              │
│ • Fecha y Hora: Hoy 10:00               │
│                                          │
│ Recibirás recordatorios 24 horas,       │
│ 2 horas y 30 minutos antes de tu        │
│ cita.                                    │
├─────────────────────────────────────────┤
│ [📅 Agendar otra] [🏠 Menú Principal]   │
└─────────────────────────────────────────┘
```
**Context:** Booking successfully created  
**Menu shown:** Quick-action buttons (book another, go home)  
**User experience:** Clear success state, options for next action

---

## 🎯 UX Improvements Applied

| Aspect | Before | After | Impact |
|--------|--------|-------|--------|
| **Specialty Selection** | List (1-4) + "write number" + buttons | Buttons only | No confusion, 1 way to choose |
| **Doctor Selection** | List (1-3) + "write number" + buttons | Buttons only | No confusion, 1 way to choose |
| **Time Selection** | List (1-4) + "write number" + buttons | Buttons only | No confusion, 1 way to choose |
| **Menu Clarity** | Emoji + numbers in welcome | Buttons only | Context flows naturally |
| **Mobile Experience** | Dual UI (text + buttons) | Buttons only | Easier to tap, no typing |
| **Context Redundancy** | "Doctor: *Name*" in time selection | Removed | Less noise, cleaner flow |

---

## ✅ Validation Checklist

- ✅ No numbered lists (confusing with buttons)
- ✅ No "write the number" instructions (buttons are primary UX)
- ✅ Context is never redundant (each step shows only necessary info)
- ✅ Back buttons available at each step (except confirmation)
- ✅ Cancel always returns to main menu
- ✅ Success state is clear and actionable
- ✅ Mobile-friendly (buttons instead of text input)
- ✅ Menu contextual (main menu only on /start, not repeated)

---

## 🚀 Testing in Telegram Bot

To verify the improved flow:

1. Start bot: `/start`
2. Click "📅 Agendar cita"
3. Select specialty
4. Select doctor
5. Select time
6. Confirm booking
7. Verify success message shows correct details

**Expected:** Clean flow with no confusion about how to select options (buttons vs typing).

---

## Menu Strategy

| Context | Menu Shown | Buttons |
|---------|-----------|---------|
| `/start` command (idle) | Main Menu | Agendar, Mis citas, Recordatorios, Info |
| In wizard, need to go back | Previous step's selection | Specialty/Doctor/Time buttons |
| After completion | Success + Quick actions | Book Another, Main Menu |
| User clicks "Volver" | Back to previous step | Previous options |
| User clicks "Cancelar" | Main Menu | Agendar, Mis citas, etc. |

**Rule:** Menu matches context. Main menu only shown on `/start` and after cancel/completion.

---

## Code Implementation

**Files Changed:**
- `f/internal/booking_fsm/responses.ts` — Simplified prompts (no lists, no redundancy)
- `f/internal/telegram_router/services.ts` — Trimmed welcome message
- `f/internal/booking_fsm/machine.ts` — FSM transitions (no changes, already correct)

**Keyboard Builders:** Already optimal in `responses.ts` (buttons layout is correct)

**Router Logic:** Already correct in `main.ts` (context routing unchanged)

---

## Success Metrics

- **Booking completion rate:** Should increase (less confusion)
- **User satisfaction:** Clearer flow, no ambiguity
- **Mobile usability:** Better (buttons > text input)
- **Support requests:** Fewer "how do I book?" questions
