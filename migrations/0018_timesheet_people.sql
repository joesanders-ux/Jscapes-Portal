-- Timesheets for people who do not have a portal (staff) account, for example someone paid but never given a login.
-- ADMIN-ONLY, like the rest of timesheets. These people cannot sign in and never appear anywhere else in the portal.

CREATE TABLE timesheet_people (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX timesheet_people_name_idx ON timesheet_people (lower(btrim(name)));

-- An entry now belongs to exactly one of: a staff account (user_id) or a timesheet-only person (person_id).
ALTER TABLE timesheet_entries DROP CONSTRAINT timesheet_entries_pkey;
ALTER TABLE timesheet_entries ALTER COLUMN user_id DROP NOT NULL;
-- RESTRICT: payroll history must not disappear (people are made inactive instead of deleted).
ALTER TABLE timesheet_entries ADD COLUMN person_id uuid REFERENCES timesheet_people (id) ON DELETE RESTRICT;
ALTER TABLE timesheet_entries ADD CONSTRAINT timesheet_entries_one_owner CHECK ((user_id IS NULL) <> (person_id IS NULL));
CREATE UNIQUE INDEX timesheet_entries_user_day_idx   ON timesheet_entries (user_id, day)   WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX timesheet_entries_person_day_idx ON timesheet_entries (person_id, day) WHERE person_id IS NOT NULL;
