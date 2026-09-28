-- Link público individual para acompanhamento de tickets sem login
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS public_access_token TEXT;

ALTER TABLE public.tickets
  ALTER COLUMN public_access_token SET DEFAULT (
    replace(gen_random_uuid()::text, '-', '') ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 16)
  );

UPDATE public.tickets
SET public_access_token = (
  replace(gen_random_uuid()::text, '-', '') ||
  substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 16)
)
WHERE public_access_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_public_access_token
  ON public.tickets(public_access_token)
  WHERE public_access_token IS NOT NULL;
