-- IX Sprint 0 — flags de idioma, moeda e Stripe do tenant.
-- Default OFF e rollout off. Nenhuma é consultada pelo runtime nesta sprint.
-- billing2.multi_gateway já existe em 302_billing2_multi_gateway.sql e permanece OFF até a IX4.
-- ON CONFLICT DO NOTHING: um re-seed não religa nem desliga flag que o Super Admin tenha alterado.

INSERT INTO public.platform_feature_flags (
  key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode
)
VALUES
  (
    'i18n.locale_detection_v1',
    'i18n',
    'IX: detecção de idioma (pt-BR, en, es) na landing e no app. OFF = interface permanece pt-BR.',
    false,
    NULL,
    'off',
    0,
    false
  ),
  (
    'billing.multicurrency_v1',
    'billing',
    'IX: preços de plano em USD e EUR e filtro da landing/checkout por moeda. OFF = catálogo público segue só BRL.',
    false,
    NULL,
    'off',
    0,
    false
  ),
  (
    'financial.stripe_tenant_v1',
    'financial',
    'IX: Stripe na lista de gateways do tenant (cobrança dos clientes do CRM). OFF = Asaas e Mercado Pago como hoje.',
    false,
    NULL,
    'off',
    0,
    false
  )
ON CONFLICT (key) DO NOTHING;
