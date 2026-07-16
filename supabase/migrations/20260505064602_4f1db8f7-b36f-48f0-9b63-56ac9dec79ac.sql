
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS code text NOT NULL DEFAULT '';

ALTER TABLE public.letterhead_templates ADD COLUMN IF NOT EXISTS watermark_pages text NOT NULL DEFAULT 'all';

ALTER TABLE public.serial_counters ADD COLUMN IF NOT EXISTS dept text NOT NULL DEFAULT '';
ALTER TABLE public.serial_counters ADD COLUMN IF NOT EXISTS day integer NOT NULL DEFAULT 0;

-- Replace old uniqueness constraint with one that includes dept + day
DO $$
DECLARE _conname text;
BEGIN
  SELECT conname INTO _conname
  FROM pg_constraint
  WHERE conrelid = 'public.serial_counters'::regclass
    AND contype = 'u';
  IF _conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.serial_counters DROP CONSTRAINT %I', _conname);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS serial_counters_unique_key
  ON public.serial_counters (prefix, legal_entity, dept, year, month, day);

-- Rewrite generate_serial_number with new signature.
-- Keeps old parameters for backward compatibility but uses new fields.
CREATE OR REPLACE FUNCTION public.generate_serial_number(
  _prefix text DEFAULT 'GC'::text,
  _separator text DEFAULT '-'::text,
  _include_month boolean DEFAULT true,
  _padding integer DEFAULT 5,
  _include_timestamp boolean DEFAULT false,
  _legal_entity_code text DEFAULT ''::text,
  _site_code text DEFAULT ''::text,
  _include_legal_entity boolean DEFAULT true,
  _include_site boolean DEFAULT false,
  _dept_code text DEFAULT ''::text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _year int; _month int; _day int; _count int; _result text; _now timestamptz;
  _le text; _de text; _date text;
BEGIN
  _now := now();
  _year := EXTRACT(YEAR FROM _now);
  _month := EXTRACT(MONTH FROM _now);
  _day := EXTRACT(DAY FROM _now);
  _le := COALESCE(_legal_entity_code, '');
  _de := COALESCE(_dept_code, '');

  INSERT INTO public.serial_counters (prefix, legal_entity, site, dept, year, month, day, counter)
  VALUES (_prefix, _le, '', _de, _year, _month, _day, 1)
  ON CONFLICT (prefix, legal_entity, dept, year, month, day)
  DO UPDATE SET counter = serial_counters.counter + 1
  RETURNING counter INTO _count;

  _date := to_char(_now, 'YYYYMMDD');

  _result := _prefix;
  IF _le <> '' THEN _result := _result || _separator || _le; END IF;
  IF _de <> '' THEN _result := _result || _separator || _de; END IF;
  _result := _result || _separator || _date;
  _result := _result || _separator || LPAD(_count::text, GREATEST(_padding, 1), '0');
  RETURN _result;
END;
$function$;
