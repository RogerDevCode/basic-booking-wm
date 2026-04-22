# Telegram Booking Flow — Happy Path Test (v9.2)

## Current Flow Analysis

### 1️⃣ `/start` Command
**Current:**
```
¡Bienvenido al sistema de citas médicas!

¿En qué puedo ayudarte?

1️⃣ Agendar cita
2️⃣ Mis citas
3️⃣ Recordatorios
4️⃣ Información
```

**Keyboard:**
- [📅 Agendar cita] [📋 Mis citas]
- [🔔 Recordatorios] [ℹ️ Información]

**✓ Status:** Clear, minimal, contextual. No change needed.

---

### 2️⃣ Click "📅 Agendar cita" → Select Specialty
**Current:**
```
📅 *Pedir hora*

Especialidades disponibles:

1. Cardiología
2. Medicina General
3. Odontología
4. Dermatología

Escribe el número de la especialidad que necesitas.
```

**Keyboard:**
- [Cardiología] [Medicina General]
- [Odontología] [Dermatología]
- [❌ Cancelar]

**⚠️ Issues:**
- Title "Pedir hora" is vague (not about hours yet, about specialty)
- Dual UI: numbered list + buttons (confusing — user must choose between typing or clicking)
- List and buttons are redundant

**🔧 Proposed Improvement:**
```
Selecciona la especialidad que necesitas:
```
- Remove numbered list (buttons are clear enough)
- Remove "Pedir hora" title (context is already clear from previous step)
- Keep buttons only + [⬅️ Volver] + [❌ Cancelar]

---

### 3️⃣ Select Doctor
**Current:**
```
👨‍⚕️ *Doctores disponibles* en *Cardiología*

1. Dr. García
2. Dra. López
3. Dr. Martínez

Escribe el número del doctor que prefieres.
```

**Keyboard:**
- [Dr. García] [Dra. López]
- [Dr. Martínez] [⬅️ Volver]
- [❌ Cancelar]

**⚠️ Issues:**
- Same dual UI problem (numbered list + buttons)
- Specialty context is redundant (already shown in list title)

**🔧 Proposed Improvement:**
```
¿Con qué doctor deseas tu cita?
```
- Remove numbered list (buttons suffice)
- Keep [Dr. García] [Dra. López] etc. buttons clearly
- [⬅️ Volver] [❌ Cancelar]

---

### 4️⃣ Select Time Slot
**Current:**
```
🕐 *Horarios disponibles*

Doctor: *Dr. García*

1. Hoy 10:00
2. Hoy 11:00
3. Mañana 14:00
4. Mañana 15:00

Escribe el número del horario que prefieres.
```

**Keyboard:**
- [Hoy 10:00] [Hoy 11:00]
- [Mañana 14:00] [Mañana 15:00]
- [⬅️ Volver] [❌ Cancelar]

**⚠️ Issues:**
- "Doctor: *Dr. García*" is redundant (user just selected this)
- Dual UI again

**🔧 Proposed Improvement:**
```
¿Qué horario prefieres?
```
- Remove doctor name (already in context)
- Remove numbered list
- Buttons: [Hoy 10:00] [Hoy 11:00] [Mañana 14:00] [Mañana 15:00]
- [⬅️ Volver] [❌ Cancelar]

---

### 5️⃣ Confirmation
**Current:**
```
📋 *Confirmar Cita*

Doctor: Dr. García
Horario: Hoy 10:00

¿Confirmas esta cita? Responde "sí" o "no".
```

**Keyboard:**
- [✅ Sí, confirmar] [❌ No, volver]

**✓ Status:** Clear and minimal. No change needed.

---

## Proposed Changes Summary

| Step | Current | Proposed | Reason |
|------|---------|----------|--------|
| Specialty | Numbered list + buttons (dual UI) | **Buttons only** | Eliminate confusion, cleaner UX |
| Doctor | Numbered list + buttons (dual UI) | **Buttons only** | Eliminate confusion, cleaner UX |
| Time | Numbered list + buttons (dual UI) | **Buttons only** | Eliminate confusion, cleaner UX |
| Confirm | ✓ Already good | *No change* | Clear and minimal |
| Main Menu | ✓ Already good | *No change* | Clear and minimal |

---

## Implementation Notes

### Code Changes
1. **Remove numbered list prompts** in `f/internal/booking_fsm/responses.ts`:
   - `buildSpecialtyPrompt()` → Remove "Escribe el número de..." + list
   - `buildDoctorsPrompt()` → Remove "Escribe el número de..." + list
   - `buildSlotsPrompt()` → Remove "Escribe el número de..." + list

2. **Simplify titles:**
   - `buildSpecialtyPrompt()`: "📅 *Pedir hora*" → "Selecciona la especialidad:"
   - `buildDoctorsPrompt()`: Keep doctor emoji, remove "en *Specialty*"
   - `buildSlotsPrompt()`: Remove "Doctor: *Name*" (redundant)

3. **Router logic**: Already handles button clicks (callback_data), no changes needed

### UX Benefits
✅ **Consistency:** All selection steps use buttons, no "type or click" confusion  
✅ **Clarity:** Numbered lists removed, focus on buttons  
✅ **Minimalism:** Only essential info shown (no redundant context)  
✅ **Mobile-friendly:** Buttons are easier to tap than typing numbers

---

## Test Checklist

- [ ] `/start` → Main menu displays correctly
- [ ] Click "📅 Agendar cita" → Specialty keyboard shows (no list)
- [ ] Click specialty → Doctor keyboard shows (no list)
- [ ] Click doctor → Time keyboard shows (no list)
- [ ] Click time → Confirmation shows doctor + time + Yes/No buttons
- [ ] Click "✅ Sí, confirmar" → Booking created, success message shown
- [ ] Click "❌ No, volver" → Back to time selection
- [ ] Click "⬅️ Volver" from any step → Goes back one step (not main menu)
- [ ] Click "❌ Cancelar" from any step → Returns to main menu
- [ ] All keyboards display correctly on mobile (Telegram width limit)

---

## Success Metrics
- Booking completion rate increases (less confusion)
- User flow is natural (no "type or click" ambiguity)
- Mobile UX is optimized (buttons instead of text input)
