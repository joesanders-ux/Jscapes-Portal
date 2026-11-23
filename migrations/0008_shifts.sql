-- Shifts, plus in-app notifications (used to tell staff when shifts are published).
--   * shifts: one shift per person per day. published_at IS NULL means HIDDEN: only admins can see it.
--     Staff only ever see their own shifts once published_at is set (enforced in every query on the server).
--   * notifications: a simple in-app inbox, one row per person per message.

CREATE TABLE shifts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day           date NOT NULL,
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  -- NULL = hidden from staff. Set when an admin publishes.
  published_at  timestamptz,
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shifts_one_per_day UNIQUE (user_id, day),
  CONSTRAINT shifts_ends_after_start CHECK (end_time > start_time)
);
CREATE INDEX shifts_day_idx ON shifts (day);
CREATE INDEX shifts_hidden_idx ON shifts (day) WHERE published_at IS NULL;

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message     text NOT NULL CHECK (btrim(message) <> ''),
  link        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);
CREATE INDEX notifications_unread_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
