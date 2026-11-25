-- The brand of each item of equipment (optional free text, for example "Stihl").
ALTER TABLE equipment ADD COLUMN brand text NOT NULL DEFAULT '';
