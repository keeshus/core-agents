-- Rename the 'viewer' role to 'approver' for clarity
UPDATE roles SET name = 'approver', description = 'Can approve Human-in-the-Loop requests' WHERE name = 'viewer';
