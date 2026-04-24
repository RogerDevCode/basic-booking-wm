import os
from typing import Optional, List
from ._result import Result, ok, fail

# ============================================================================
# CONFIG — Single Source of Truth for all constants and configuration
# ============================================================================

# ─── Retry Configuration
MAX_RETRIES = 3
RETRY_BACKOFF_BASE_MS = 500
RETRY_BACKOFF_MULTIPLIER = 2
MAX_GCAL_RETRIES = 10

# ─── Timeout Configuration
TIMEOUT_GCAL_API_MS = 15000
TIMEOUT_TELEGRAM_API_MS = 10000
TIMEOUT_TELEGRAM_CALLBACK_MS = 5000
TIMEOUT_GMAIL_API_MS = 15000
TIMEOUT_DB_QUERY_MS = 30000

# ─── Input Limits
MAX_INPUT_LENGTH = 500
MAX_LLM_RESPONSE_LENGTH = 2000
MAX_FOLLOW_UP_LENGTH = 200
MAX_TELEGRAM_CALLBACK_DATA_BYTES = 64
MAX_CANCELLATION_REASON_LENGTH = 500

# ─── Booking Limits
MAX_BOOKINGS_PER_QUERY = 20
MAX_SLOTS_DISPLAYED = 10
DEFAULT_SERVICE_DURATION_MIN = 30
DEFAULT_BUFFER_TIME_MIN = 10

# ─── GCal Configuration
GCAL_BASE_URL = 'https://www.googleapis.com/calendar/v3'
GCAL_REMINDER_24H_MIN = 1440
GCAL_REMINDER_2H_MIN = 120
GCAL_REMINDER_30MIN_MIN = 30

# ─── Status Constants
BOOKING_STATUS = {
    'PENDING': 'pending',
    'CONFIRMED': 'confirmed',
    'IN_SERVICE': 'in_service',
    'COMPLETED': 'completed',
    'CANCELLED': 'cancelled',
    'NO_SHOW': 'no_show',
    'RESCHEDULED': 'rescheduled',
}

# ─── Default Values
DEFAULT_TIMEZONE = 'America/Mexico_City'

def get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    return os.getenv(name, default)

def require_env(name: str) -> Result[str]:
    val = os.getenv(name)
    if not val:
        return fail(f"CONFIGURATION_ERROR: Required environment variable {name} is not set.")
    return ok(val)

def require_database_url() -> Result[str]:
    return require_env('DATABASE_URL')
