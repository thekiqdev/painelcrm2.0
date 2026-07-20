-- WI2: preço por instância WhatsApp (conexão extra) por intervalo de cobrança.
-- NULL = extras não vendáveis via self-service (WI3).

ALTER TABLE public.plan_interval_prices
  ADD COLUMN IF NOT EXISTS price_per_instance_cents INTEGER;

COMMENT ON COLUMN public.plan_interval_prices.price_per_instance_cents IS
  'Preço unitário por conexão WhatsApp extra (centavos). NULL = extras não vendáveis.';

-- Snapshot contratual preparado para WI3 (add-on); motor de cobrança ainda não usa.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS contracted_price_per_instance_cents INTEGER;

COMMENT ON COLUMN public.subscriptions.contracted_price_per_instance_cents IS
  'Unitário contratado por conexão WhatsApp extra (centavos). Preparado WI2; uso em WI3+.';
