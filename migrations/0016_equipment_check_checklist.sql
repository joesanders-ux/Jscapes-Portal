-- The checklist used is now chosen on the check form (Hand tools, Lawn mowers or Petrol equipment),
-- not taken from the equipment's category, so each check records which checklist it used.
-- Older checks have no value here: they used their equipment's category.
ALTER TABLE equipment_checks
  ADD COLUMN checklist text CHECK (checklist IN ('hand_tools', 'lawn_mower', 'petrol'));
