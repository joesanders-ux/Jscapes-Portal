-- Health and Safety documents. Each document keeps every version it has ever had;
-- exactly one version per document is marked current. Files live in persistent storage
-- (a Railway Volume), the database holds only the metadata and the storage key.

CREATE TABLE health_safety_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE health_safety_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       uuid NOT NULL REFERENCES health_safety_documents (id) ON DELETE CASCADE,
  version_number    integer NOT NULL,
  is_current        boolean NOT NULL DEFAULT false,
  original_filename text NOT NULL,
  size_bytes        integer NOT NULL,
  storage_key       text NOT NULL UNIQUE,
  note              text NOT NULL DEFAULT '',
  uploaded_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);

-- At most one current version per document, enforced by the database.
CREATE UNIQUE INDEX health_safety_one_current_idx
  ON health_safety_versions (document_id) WHERE is_current;
