-- Policies and Handbooks. Same model as Health and Safety: every document keeps all its versions,
-- exactly one is current, and archiving hides a document from staff without deleting anything.
-- Files live in persistent storage (a Railway Volume); the database holds metadata and the storage key.

CREATE TABLE policy_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  -- Used to group the list. Text labels as well as grouping: nothing relies on colour.
  kind        text NOT NULL DEFAULT 'policy' CHECK (kind IN ('policy', 'handbook')),
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by uuid REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE policy_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       uuid NOT NULL REFERENCES policy_documents (id) ON DELETE CASCADE,
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
CREATE UNIQUE INDEX policy_one_current_idx ON policy_versions (document_id) WHERE is_current;
