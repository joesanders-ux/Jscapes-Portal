-- Lets a notification point at the thing it is about (for example an availability change request),
-- so related notifications can be cleared automatically once the thing is dealt with.
ALTER TABLE notifications ADD COLUMN ref_id uuid;
CREATE INDEX notifications_ref_idx ON notifications (ref_id) WHERE ref_id IS NOT NULL;
