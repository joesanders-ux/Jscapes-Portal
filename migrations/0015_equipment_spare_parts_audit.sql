-- Any signed-in person can update an item's spare parts, so record who last changed them and when.
ALTER TABLE equipment
  ADD COLUMN spare_parts_updated_at timestamptz,
  ADD COLUMN spare_parts_updated_by uuid REFERENCES users (id) ON DELETE SET NULL;
