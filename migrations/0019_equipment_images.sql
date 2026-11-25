-- Pictures of an item on the Equipment list (for example the machine itself, or its serial plate).
-- Same storage approach as check photos: a full-size file and a small thumbnail per picture, in persistent storage.
CREATE TABLE equipment_images (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id      uuid NOT NULL REFERENCES equipment (id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  content_type      text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes        integer NOT NULL,
  width             integer,
  height            integer,
  storage_key       text NOT NULL UNIQUE,
  thumb_key         text NOT NULL UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX equipment_images_equipment_idx ON equipment_images (equipment_id);
