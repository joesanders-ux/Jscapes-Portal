-- Photos attached to an equipment check (added next to the Notes box). Same storage as Job Images:
-- a full-size file and a small thumbnail per photo, kept in persistent storage.
CREATE TABLE equipment_check_images (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id          uuid NOT NULL REFERENCES equipment_checks (id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  content_type      text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes        integer NOT NULL,
  width             integer,
  height            integer,
  storage_key       text NOT NULL UNIQUE,
  thumb_key         text NOT NULL UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX equipment_check_images_check_idx ON equipment_check_images (check_id);
