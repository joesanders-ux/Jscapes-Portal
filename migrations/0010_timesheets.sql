-- Timesheets: hours worked per person per day. ADMIN-ONLY: no staff-facing query reads this table.
-- Hours are plain numbers (two decimal places, so quarter hours like 7.25 are exact).

CREATE TABLE timesheet_entries (
  -- RESTRICT: payroll history must not disappear if a user row is ever removed (users are deactivated instead).
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  day         date NOT NULL,
  hours       numeric(4, 2) NOT NULL CHECK (hours >= 0 AND hours <= 24),
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
CREATE INDEX timesheet_entries_day_idx ON timesheet_entries (day);
