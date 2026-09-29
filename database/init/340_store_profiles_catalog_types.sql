-- Tipos de catálogo habilitados na loja (produtos e/ou serviços).

ALTER TABLE public.store_profiles
  ADD COLUMN IF NOT EXISTS enable_products BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.store_profiles
  ADD COLUMN IF NOT EXISTS enable_services BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.store_profiles.enable_products IS 'Se true, o catálogo/loja trabalha com itens do tipo produto.';
COMMENT ON COLUMN public.store_profiles.enable_services IS 'Se true, o catálogo/loja trabalha com itens do tipo serviço.';

-- Garante pelo menos um tipo ativo (idempotente se a constraint já existir).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'store_profiles_enable_products_or_services_chk'
  ) THEN
    ALTER TABLE public.store_profiles
      ADD CONSTRAINT store_profiles_enable_products_or_services_chk
      CHECK (enable_products OR enable_services);
  END IF;
END $$;
