-- Billing 2.0 Sprint 11 — Multi Gateway: flag + catálogo Stripe skeleton (disabled).
-- Asaas permanece default. billing2.multi_gateway default OFF.

INSERT INTO public.platform_feature_flags
  (key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode)
VALUES
  (
    'billing2.multi_gateway',
    'billing2',
    'Billing 2.0 — Multi Gateway SaaS (permite resolver gateway ≠ Asaas)',
    false,
    NULL,
    'off',
    0,
    false
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.payment_gateways (key, name, description, is_enabled, credentials_schema, sort_order)
VALUES (
  'stripe',
  'Stripe (skeleton)',
  'Billing 2.0 Sprint 11 — adapter SaaS skeleton. Não cobrar até implementação real + flag multi_gateway.',
  false,
  '{"api_key": "required", "env": "sandbox|production"}'::jsonb,
  20
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  credentials_schema = EXCLUDED.credentials_schema,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
-- is_enabled NÃO forçado no UPDATE (ops pode habilitar no catálogo sem ativar runtime).
