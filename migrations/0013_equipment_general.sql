-- New equipment no longer has a category chosen for it: it gets a "general" checklist.
-- The original three categories stay valid so existing equipment and its check history are unchanged.
ALTER TABLE equipment DROP CONSTRAINT equipment_category_check;
ALTER TABLE equipment ADD CONSTRAINT equipment_category_check CHECK (category IN ('hand_tools', 'lawn_mower', 'petrol', 'general'));
