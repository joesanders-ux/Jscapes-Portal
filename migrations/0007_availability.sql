-- Individual Availability.
--   * availability_days: one row per person per day that has been SUBMITTED. A row means "locked".
--     A day with no row is "Not provided" and can still be filled in. Staff never edit a row directly;
--     it only changes when an administrator approves a change request.
--   * availability_change_requests: a person asks for a change to locked days; an administrator decides.

CREATE TABLE availability_days (
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day           date NOT NULL,
  status        text NOT NULL CHECK (status IN ('available', 'not_provided', 'not_available')),
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  source        text NOT NULL DEFAULT 'submitted' CHECK (source IN ('submitted', 'change_approved')),
  PRIMARY KEY (user_id, day)
);
CREATE INDEX availability_days_day_idx ON availability_days (day);

CREATE TABLE availability_change_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  from_day         date NOT NULL,
  to_day           date NOT NULL,
  requested_status text NOT NULL CHECK (requested_status IN ('available', 'not_provided', 'not_available')),
  reason           text NOT NULL CHECK (btrim(reason) <> ''),
  state            text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'declined')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  decided_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  decided_at       timestamptz,
  decision_note    text NOT NULL DEFAULT '',
  CONSTRAINT availability_request_range CHECK (to_day >= from_day AND to_day - from_day <= 92),
  -- Pending exactly when nobody has decided yet.
  CONSTRAINT availability_request_decided CHECK ((state = 'pending') = (decided_at IS NULL))
);
CREATE INDEX availability_requests_state_idx ON availability_change_requests (state, created_at);
CREATE INDEX availability_requests_user_idx ON availability_change_requests (user_id, created_at DESC);
