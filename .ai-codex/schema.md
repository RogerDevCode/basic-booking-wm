# Database Schema — booking-titanium-wm

> Source of truth: `AGENTS.md §DB`. Extensions: uuid-ossp, btree_gist, vector.
> RLS active on all tables via `app.current_tenant` setting.

## Core Tables

### providers
```
provider_id  UUID PK
name         TEXT NOT NULL
email        TEXT UNIQUE NOT NULL
phone        TEXT
specialty    TEXT NOT NULL
timezone     TEXT DEFAULT 'America/Mexico_City'
is_active    BOOLEAN DEFAULT true
-- Extended fields (from web_provider_profile queries):
password_hash          TEXT
honorific_id           UUID → honorifics
specialty_id           UUID → specialties
timezone_id            UUID → timezones
region_id              UUID → regions
commune_id             UUID → communes
phone_app              TEXT
phone_contact          TEXT
telegram_chat_id       TEXT
gcal_calendar_id       TEXT
gcal_access_token      TEXT
gcal_refresh_token     TEXT
gcal_client_id         TEXT
gcal_client_secret     TEXT
address_street         TEXT
address_number         TEXT
address_complement     TEXT
address_sector         TEXT
last_password_change   TIMESTAMPTZ
updated_at             TIMESTAMPTZ
```

### services
```
service_id       UUID PK
provider_id      UUID → providers
name             TEXT NOT NULL
duration_minutes INT DEFAULT 30
buffer_minutes   INT DEFAULT 10
price_cents      INT DEFAULT 0
```

### provider_schedules
```
schedule_id UUID PK
provider_id UUID → providers
day_of_week INT (0=Sun, 6=Sat)
start_time  TIME NOT NULL
end_time    TIME NOT NULL
UNIQUE(provider_id, day_of_week, start_time)
```

### clients
```
client_id  UUID PK
name       TEXT NOT NULL
email      TEXT UNIQUE
phone      TEXT
timezone   TEXT DEFAULT 'America/Mexico_City'
-- user_id  UUID (links to auth users table)
```

### bookings
```
booking_id       UUID PK
provider_id      UUID → providers
client_id        UUID → clients
service_id       UUID → services
start_time       TIMESTAMPTZ NOT NULL
end_time         TIMESTAMPTZ NOT NULL
status           TEXT DEFAULT 'pendiente'
idempotency_key  TEXT UNIQUE NOT NULL
gcal_sync_status TEXT DEFAULT 'pending'
gcal_provider_event_id  TEXT
gcal_client_event_id    TEXT
-- GIST exclusion: no overlap for same provider (except cancelada/no_presentado/reagendada)
```

## Status Values

### bookings.status (FSM)
```
pendiente → confirmada | cancelada | reagendada
confirmada → en_servicio | cancelada | reagendada
en_servicio → completada | no_presentado
completada → (terminal)
cancelada → (terminal)
no_presentado → (terminal)
reagendada → (terminal)
```

### bookings.gcal_sync_status
```
pending | synced | failed | pending_gcal
```

## Lookup / Catalog Tables
```
honorifics   (honorific_id, label)
specialties  (specialty_id, name)
timezones    (id, name)
regions      (region_id, name)
communes     (commune_id, region_id, name)
```

## Other Tables
```
knowledge_base  (kb_id, category, title, content, is_active)  -- used by rag_query
distributed_locks  (lock_key, owner_token, expires_at, start_time)
conversation_logs  (log_id, chat_id, role, content, created_at)
```

## Key Patterns

```typescript
// Always use withTenantContext — direct pool.query is FORBIDDEN
await withTenantContext(sql, provider_id, async (tx) => {
  const rows = await tx<MyRow[]>`SELECT ...`;
  return [null, rows];
});

// Idempotency key on every booking write
idempotency_key: `${provider_id}:${client_id}:${start_time.toISOString()}`

// Double-booking prevention: GIST exclusion in DB + SELECT FOR UPDATE in tx
```
