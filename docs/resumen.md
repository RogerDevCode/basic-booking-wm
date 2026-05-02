## Booking Titanium - Sanitization Summary

### Objective

Sanitize the Telegram -> Windmill -> Redis -> Telegram subgraph using incremental integration / gradual reconstruction.

The goal is to validate node boundaries and edge contracts before reintroducing router, FSM, and AI complexity.

### Current Strategy

Treat the system as a DAG.

Active path (Phase 3):

`webhook_trigger -> normalize -> classify -> get_state -> telegram_router -> update_state -> read_back -> telegram_send`

Rules currently enforced in practice:

- Windmill `main()` boundaries must return plain `dict[str, object]`
- Internal validation can use Pydantic
- No tuple/model leakage across Windmill node boundaries
- Failures must be explicit
- New modules should be pure when possible

### What Was Fixed

#### 1. Windmill boundary serialization

Main issue found:

- Windmill was failing with opaque errors like:
  - `AttributeError: 'tuple' object has no attribute 'replace'`
  - `BeartypeCallHintParamViolation`

Root cause:

- Some nodes returned Pydantic models, internal `Result` tuples, or assumed Windmill would instantiate typed models automatically.
- Windmill actually passes plain dictionaries at boundaries and is sensitive to non-primitive return values.

Boundary fix applied:

- `conversation_update.main()` now validates incoming `dict` explicitly and returns plain `dict`
- `telegram_send.main()` now returns plain `dict`
- `conversation_get.main()` already returns plain `dict`

#### 2. Redis persistence path validated

The Redis echo counter now works and increments correctly across messages.

The write path was hardened by adding:

- reread after update
- persisted counter verification

### Modules Added During Sanitization

#### `f/internal/conversation_verify`

Purpose:

- Validate that the just-persisted Redis state matches the expected `chat_id` and `echo_count`

Role:

- post-write read-back verification
- explicit contract check before continuing to Telegram send

#### `f/internal/telegram_normalize`

Purpose:

- Normalize Telegram trigger output into a canonical input contract

Behavior:

- trims text
- classifies raw event kind as `message`, `callback`, or `empty`
- sets `processable`

Role:

- separates raw webhook shape from downstream logic

#### `f/internal/telegram_classify`

Purpose:

- Apply minimal semantic classification to normalized text

Behavior:

- classifies as:
  - `plain_text`
  - `command_start`
  - `command_other`
  - `callback`
  - `empty`
- exposes `should_process`
- exposes `canonical_text`

Role:

- prepares the future reintroduction of router / FSM / AI
- avoids mixing semantic interpretation into transport nodes

### Phase 3 State (current)

`telegram_router` integrated as deterministic routing node.

The path now is:

- Telegram webhook receives message
- input is normalized
- input is classified
- Redis conversation state is read
- telegram_router applies FSM transition (BookingState)
- Redis state is updated with new booking_state and active_flow
- Redis state is reread (read-back verification)
- Telegram reply is sent (router response_text or fallback)

Router behavior:
- `handled=True`: FSM transition applied, response_text from FSM, booking_state persisted
- `handled=False`: update/read-back skipped, fallback message sent

We have NOT yet reintroduced:

- AI intent extraction
- orchestration branching (booking_orchestrator)
- deduplication

### Recommended Next Direction

1. `telegram_deduplicate`
   - detect repeated webhook deliveries / replayed messages
   - prevent double FSM transitions on retried webhooks

2. `/start` command handler
   - currently router returns handled=False for /start (no active_flow)
   - need explicit handler to initialize booking flow and load specialties

3. `booking_orchestrator` reintroduction
   - triggered after router advances FSM state
   - handles async I/O (fetch specialties, doctors, slots)

Recommended order:

1. telegram_deduplicate
2. /start → initialize booking flow
3. booking_orchestrator reintroduction
4. AI / NLU reintroduction

### Operational Guidance For Next LLM

- Do not collapse multiple concerns into one Windmill node yet
- Keep sanitizing with small explicit modules
- Keep `main()` boundaries plain and explicit
- Assume Windmill sends raw `dict`, not typed models
- Keep read-back verification where correctness matters
- Prefer pure logic modules before reintroducing side effects or orchestration
- Optimize latency only after the graph is fully stable
