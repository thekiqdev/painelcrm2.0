-- Localização do tenant: moedas habilitadas (BRL/USD/EUR) e moeda padrão.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_currency TEXT,
  ADD COLUMN IF NOT EXISTS enabled_currencies TEXT[];

UPDATE public.tenants
SET
  default_currency = COALESCE(NULLIF(TRIM(default_currency), ''), 'BRL'),
  enabled_currencies = COALESCE(
    NULLIF(enabled_currencies, ARRAY[]::TEXT[]),
    ARRAY['BRL', 'USD', 'EUR']::TEXT[]
  )
WHERE default_currency IS NULL
   OR enabled_currencies IS NULL
   OR cardinality(enabled_currencies) = 0;

ALTER TABLE public.tenants
  ALTER COLUMN default_currency SET DEFAULT 'BRL',
  ALTER COLUMN enabled_currencies SET DEFAULT ARRAY['BRL', 'USD', 'EUR']::TEXT[];

COMMENT ON COLUMN public.tenants.default_currency IS
  'Moeda padrão do tenant no painel (BRL, USD ou EUR).';
COMMENT ON COLUMN public.tenants.enabled_currencies IS
  'Moedas habilitadas no tenant (subconjunto de BRL, USD, EUR).';
