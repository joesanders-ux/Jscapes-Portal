-- An equipment item can now have several manuals (PDFs), not just one.
CREATE TABLE equipment_manuals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id      uuid NOT NULL REFERENCES equipment (id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  size_bytes        integer NOT NULL,
  storage_key       text NOT NULL UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX equipment_manuals_equipment_idx ON equipment_manuals (equipment_id);

-- Move each existing single manual across (same stored file, nothing is re-uploaded), then clear the old columns,
-- which the app no longer reads. The columns stay in the table so this migration only ever adds and copies.
INSERT INTO equipment_manuals (equipment_id, original_filename, size_bytes, storage_key, created_at)
  SELECT id, manual_filename, manual_size, manual_key, created_at FROM equipment WHERE manual_key IS NOT NULL;
UPDATE equipment SET manual_key = NULL, manual_filename = NULL, manual_size = NULL WHERE manual_key IS NOT NULL;
