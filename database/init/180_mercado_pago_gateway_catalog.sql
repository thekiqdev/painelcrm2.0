-- Catálogo: gateway Mercado Pago (Fase 2 integração — OAuth/status apenas).
-- Não altera Asaas. gateway_key fixo: mercado_pago

INSERT INTO public.payment_gateways (key, name, description, is_enabled, credentials_schema, sort_order)
VALUES (
  'mercado_pago',
  'Mercado Pago',
  'Gateway Mercado Pago (Checkout Pro / OAuth).',
  true,
  '{"oauth": "authorization_code", "env": "sandbox|production"}'::jsonb,
  20
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_enabled = EXCLUDED.is_enabled,
  credentials_schema = EXCLUDED.credentials_schema,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
