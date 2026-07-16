-- Drop obsolete unique index on serial_counters that no longer matches
-- the current (prefix, legal_entity, dept, year, month, day) scoping used by
-- public.generate_serial_number. The stale index causes duplicate-key errors
-- whenever a second department (or a new day) tries to reserve a counter for
-- the same prefix+legal_entity+year+month combination, breaking serial
-- generation entirely.
DROP INDEX IF EXISTS public.serial_counters_scope_key;