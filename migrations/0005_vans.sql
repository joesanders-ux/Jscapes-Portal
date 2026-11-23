-- Van Compliance: a list of vans (registrations) and a record of each completed check.
-- The database itself enforces the rules, not just the form:
--   * any item answered "No" must have an explanation
--   * an overall condition of Poor or Moderate must have a note

CREATE TABLE vans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration  text NOT NULL,
  description   text NOT NULL DEFAULT '',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- "AB12 CDE", "ab12cde" and "AB12-CDE" are the same van.
CREATE UNIQUE INDEX vans_registration_idx ON vans (upper(regexp_replace(registration, '[ -]', '', 'g')));

CREATE TABLE van_checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: a van with check history cannot be deleted (it can be deactivated).
  van_id        uuid NOT NULL REFERENCES vans (id) ON DELETE RESTRICT,
  checked_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  checked_at    timestamptz NOT NULL DEFAULT now(),

  oil_ok        boolean NOT NULL,  oil_note        text NOT NULL DEFAULT '',
  tyres_ok      boolean NOT NULL,  tyres_note      text NOT NULL DEFAULT '',
  lights_ok     boolean NOT NULL,  lights_note     text NOT NULL DEFAULT '',
  dashboard_ok  boolean NOT NULL,  dashboard_note  text NOT NULL DEFAULT '',
  clean_ok      boolean NOT NULL,  clean_note      text NOT NULL DEFAULT '',

  condition     text NOT NULL CHECK (condition IN ('poor', 'moderate', 'compliant')),
  notes         text NOT NULL DEFAULT '',

  CONSTRAINT van_checks_explained CHECK (
        (oil_ok       OR btrim(oil_note)       <> '')
    AND (tyres_ok     OR btrim(tyres_note)     <> '')
    AND (lights_ok    OR btrim(lights_note)    <> '')
    AND (dashboard_ok OR btrim(dashboard_note) <> '')
    AND (clean_ok     OR btrim(clean_note)     <> '')
    AND (condition = 'compliant' OR btrim(notes) <> '')
  )
);
CREATE INDEX van_checks_van_date_idx ON van_checks (van_id, checked_at DESC);
CREATE INDEX van_checks_date_idx ON van_checks (checked_at DESC);
