-- Archiving hides a document from staff without deleting anything: every version and its
-- file are kept, and an admin can restore it. NULL archived_at means the document is active.

ALTER TABLE health_safety_documents
  ADD COLUMN archived_at  timestamptz,
  ADD COLUMN archived_by  uuid REFERENCES users (id) ON DELETE SET NULL;
