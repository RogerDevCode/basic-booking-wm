# 🐛 Telegram Booking Flow Issue — Root Cause Analysis

## Problem Description

User flows through Telegram booking process but gets stuck at specialty selection:

```
/start → Main Menu ✓
"1" (Book Appointment) → Specialty Selection ✓
"1" (Cardiología) → STUCK - Same prompt repeats ✗
```

## Root Cause

**The booking flow is NOT properly integrated between telegram_gateway and booking_wizard FSM.**

### Current Broken Flow

```
telegram_gateway/main.ts
  ↓
TelegramRouter.routeUpdate()
  ├─ if callback_query → handleCallback()
  │  └─ if 'client:book' → return [null, 'book_init'] ✗ (Does nothing!)
  │
  └─ if message (text input) → handleMessage()
     └─ Check username → sendClientMenu() ✗ (Loops back to main menu)
```

**Problem:** 
- Step 1: User clicks "📅 Agendar" button with `callback_data='client:book'`
- Step 2: `handleClientCallback` receives it, returns `'book_init'`
- Step 3: **FSM is never initialized or loaded**
- Step 4: Next message from user (the "1" for specialty) goes back to `handleMessage`
- Step 5: `handleMessage` doesn't load conversation state → just sends main menu again

### Where the Specialty Prompt Comes From

The specialty prompt ("📅 Pedir hora...") is being sent from somewhere, but there's **no stateful handling** of the user's response. The system:
1. Sends the prompt ✓
2. User responds with "1" 
3. System can't find the conversation state ✗
4. Falls back to default menu ✗

## Technical Gap

### Missing: Conversation State Management

The system needs:

```typescript
// Step 1: Initialize FSM state
const state = stateFactory.selectingSpecialty([{...}, ...]);
await redis.set(`user:${chatId}:booking_state`, JSON.stringify(state));

// Step 2: On user message, load state
const savedState = await redis.get(`user:${chatId}:booking_state`);
if (savedState) {
  const state = JSON.parse(savedState);
  const [err, outcome] = applyTransition(state, action, emptyDraft());
  await redis.set(`user:${chatId}:booking_state`, JSON.stringify(outcome.nextState));
  // Send response
}
```

### Missing: Dual Input Handling

Currently `handleMessage` only processes:
- Commands (/start, /admin, /provider)
- Username detection (hardcoded 'client_' prefix)

It **doesn't process numeric input** that should go to the FSM.

## Solution Architecture

### 1. Store Conversation State in Redis
```typescript
// Key: user:{chatId}:booking_state
// Value: { name, specialtyId, items, ... } (JSON serialized BookingState)
```

### 2. Update TelegramRouter.handleMessage

```typescript
async handleMessage(message: TelegramMessage): Promise<Result<string>> {
  const chatId = String(message.chat.id);
  const text = message.text ?? '';
  
  if (text === '/start') {
    await redis.del(`user:${chatId}:booking_state`); // Clear state
    return this.sendMainMenu(chatId);
  }
  
  // NEW: Check if user has active booking state
  const bookingStateJson = await redis.get(`user:${chatId}:booking_state`);
  if (bookingStateJson) {
    const bookingState = JSON.parse(bookingStateJson);
    // Parse user input as FSM action
    const action = parseAction(text, bookingState);
    const [err, outcome] = applyTransition(bookingState, action, emptyDraft());
    
    if (!err && outcome) {
      // Save updated state
      await redis.set(
        `user:${chatId}:booking_state`, 
        JSON.stringify(outcome.nextState)
      );
      
      // Send response
      const [sendErr] = await this.telegram.sendMessage(chatId, outcome.responseText);
      return sendErr ? [sendErr, null] : [null, 'booking_step_processed'];
    }
  }
  
  // Fallback: original logic
  return this.sendMainMenu(chatId);
}
```

### 3. Update handleClientCallback to Initialize FSM

```typescript
private async handleClientCallback(
  chatId: string, 
  data: string,
  telegram: ITelegramClient
): Promise<Result<string>> {
  const action = data.split(':')[1] ?? '';
  
  if (action === 'book') {
    // Initialize booking wizard FSM
    const initialState = stateFactory.selectingSpecialty(
      specialties, // fetch from DB
      null
    );
    await redis.set(
      `user:${chatId}:booking_state`,
      JSON.stringify(initialState)
    );
    
    // Send first prompt
    const responseText = buildSpecialtyPrompt(specialties);
    const [err] = await telegram.sendMessage(chatId, responseText);
    return err ? [err, null] : [null, 'booking_started'];
  }
  
  // ... other cases
}
```

### 4. Parse User Input to FSM Action

```typescript
function parseAction(
  userInput: string,
  state: BookingState
): BookingAction {
  const trimmed = userInput.trim();
  
  // Handle special commands
  if (trimmed.toLowerCase() === 'atrás' || trimmed === 'back') {
    return { type: 'back' };
  }
  if (trimmed.toLowerCase() === 'cancelar' || trimmed === 'cancel') {
    return { type: 'cancel' };
  }
  
  // Handle numeric selection (1-based index)
  if (/^\d+$/.test(trimmed)) {
    const index = parseInt(trimmed, 10);
    if (index > 0 && index <= state.items.length) {
      return { type: 'select', value: state.items[index - 1].id };
    }
  }
  
  // Handle direct ID
  return { type: 'select', value: trimmed };
}
```

## Files to Modify

1. **f/telegram_gateway/services.ts**
   - Import Redis client, FSM utilities
   - Modify `TelegramRouter.handleMessage()`
   - Modify `handleClientCallback()`
   - Add Redis state management

2. **f/telegram_gateway/main.ts** (no change needed)

3. **docker-compose.dev/docker-compose.yml** (verify Redis is available)

4. **Root .env**
   - Ensure `REDIS_URL` is set
   - Connection string: `redis://127.0.0.1:6380`

## Testing Plan

```bash
# 1. Start services
docker-compose -f docker-compose.dev/docker-compose.yml up -d

# 2. Verify Redis
redis-cli -p 6380 PING  # Should return PONG

# 3. Test flow (from local Telegram or webhook simulator)
/start
→ Should show main menu with "📅 Agendar" button

# 4. Click button
callback_data='client:book'
→ Should show specialty selection
→ Should store state in Redis key: user:{chatId}:booking_state

# 5. Send "1"
message text="1"
→ Should select Cardiología
→ Should advance to doctor selection
→ Should show doctors list

# 6. Continue selection
→ Should flow through time selection → confirmation → booking created
```

## Summary

| Aspect | Current | Needed |
|--------|---------|--------|
| **Stateful handling** | ❌ No | ✅ Redis + FSM |
| **Callback to FSM** | ❌ Returns 'book_init' | ✅ Initialize FSM in Redis |
| **Text input parsing** | ❌ Menu only | ✅ Parse as FSM action |
| **State persistence** | ❌ No | ✅ Redis storage |
| **FSM integration** | ❌ Disconnected | ✅ Bridged |

---

**Estimated Effort:** 2-3 hours  
**Complexity:** Medium (involves Redis coordination)  
**Risk:** Low (isolated to telegram_gateway)  
**Testing:** Unit tests + manual Telegram flow verification
