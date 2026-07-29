-- CRM Pix Automático (CRM0) — flag plataforma separada do SaaS billing2.pix_automatic.
-- Default OFF: sem migração silenciosa; UI/API CRM escondem toggle até Super Admin ligar.

INSERT INTO public.platform_feature_flags
  (key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode)
VALUES
  (
    'crm.pix_automatic',
    'crm',
    'CRM — Pix Automático nas faturas/assinaturas de clientes do tenant (Asaas Jornada 3)',
    false,
    NULL,
    'off',
    0,
    false
  )
ON CONFLICT (key) DO NOTHING;
