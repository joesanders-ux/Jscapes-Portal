-- Equipment Maintenance: an asset list and a record of each monthly check.
--   * equipment: what the company owns (name, model/serial, spare parts, manual PDF, notes)
--   * equipment_checks: one row per completed check of one item
--   * equipment_check_items: the answers, one row per checklist item. Which items apply depends on
--     the equipment's category, so answers are rows rather than fixed columns.
-- The database enforces the key rule itself: an item answered "No" must have an explanation.

CREATE TABLE equipment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (btrim(name) <> ''),
  -- The category decides the checklist, and is fixed once the item exists so history stays comparable.
  category        text NOT NULL CHECK (category IN ('hand_tools', 'lawn_mower', 'petrol')),
  model_serial    text NOT NULL DEFAULT '',
  spare_parts     text NOT NULL DEFAULT '',
  notes           text NOT NULL DEFAULT '',
  -- Optional manual (PDF in persistent storage). The three columns are all set or all empty.
  manual_key      text UNIQUE,
  manual_filename text,
  manual_size     integer,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_manual_complete CHECK (
    (manual_key IS NULL AND manual_filename IS NULL AND manual_size IS NULL)
    OR (manual_key IS NOT NULL AND manual_filename IS NOT NULL AND manual_size IS NOT NULL)
  )
);

CREATE TABLE equipment_checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: equipment with check history cannot be deleted (it can be deactivated).
  equipment_id  uuid NOT NULL REFERENCES equipment (id) ON DELETE RESTRICT,
  checked_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  checked_at    timestamptz NOT NULL DEFAULT now(),
  notes         text NOT NULL DEFAULT ''
);
CREATE INDEX equipment_checks_item_date_idx ON equipment_checks (equipment_id, checked_at DESC);
CREATE INDEX equipment_checks_date_idx ON equipment_checks (checked_at DESC);

CREATE TABLE equipment_check_items (
  check_id  uuid NOT NULL REFERENCES equipment_checks (id) ON DELETE CASCADE,
  item_key  text NOT NULL,
  -- yes = fine, no = needs attention, na = not required (only offered for items that can be not required)
  result    text NOT NULL CHECK (result IN ('yes', 'no', 'na')),
  note      text NOT NULL DEFAULT '',
  PRIMARY KEY (check_id, item_key),
  CONSTRAINT equipment_item_explained CHECK (result <> 'no' OR btrim(note) <> '')
);
