-- Job Images. Photos from jobs, uploaded by staff and visible to every signed-in user.
-- Files live in persistent storage (a Railway Volume); the database holds the details and storage keys.
-- Each image has a full-size file and a small thumbnail (made at upload) so the browsing pages stay light.
-- Nothing here depends on ServiceM8: an import can be added later once its decisions are made.

CREATE TABLE job_images (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The day of the job. Images are grouped by the Monday-to-Sunday week containing this date.
  job_date          date NOT NULL,
  job_ref           text NOT NULL DEFAULT '',   -- job number or reference, optional
  description       text NOT NULL DEFAULT '',   -- job description
  operator_notes    text NOT NULL DEFAULT '',
  original_filename text NOT NULL,
  content_type      text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes        integer NOT NULL,
  width             integer,
  height            integer,
  storage_key       text NOT NULL UNIQUE,
  thumb_key         text NOT NULL UNIQUE,
  uploaded_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  uploaded_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_images_date_idx ON job_images (job_date);
