CREATE TABLE IF NOT EXISTS booking_reminder_dispatches (
  booking_id uuid NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  reminder_window text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT NOW(),
  sent_at timestamptz NULL,
  skip_reason text NULL,
  last_error text NULL,
  PRIMARY KEY (booking_id, reminder_window, channel)
);

CREATE INDEX IF NOT EXISTS idx_booking_reminder_dispatches_status
ON booking_reminder_dispatches (status, decided_at);
