-- M5 S2.1 — Partner flags operáveis no Super Admin (Feature Flags)
-- Garante seeds + descrição clara; bypass DNS via platform_feature_flags (não só .env)

INSERT INTO public.platform_feature_flags (
  key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode
)
VALUES
  (
    'partner.master_off',
    'partner',
    'Kill switch global do canal Partner / white-label. ON = desliga tudo do namespace partner.',
    false,
    NULL,
    'off',
    0,
    false
  ),
  (
    'partner.channel_v1',
    'partner',
    'Canal Partner v1: APIs /api/superadmin/partners e /api/partner/*, UI Partners e shell /partner. Ligue aqui (Enabled ON) no Super Admin.',
    false,
    'partner.master_off',
    'off',
    0,
    false
  ),
  (
    'partner.domain_verify_bypass',
    'partner',
    'Dev/staging: marcar domínio Partner como verificado sem checar DNS TXT/CNAME. Nunca ligar em produção.',
    false,
    'partner.master_off',
    'off',
    0,
    false
  )
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  kill_switch_key = COALESCE(platform_feature_flags.kill_switch_key, EXCLUDED.kill_switch_key),
  namespace = EXCLUDED.namespace,
  shadow_mode = EXCLUDED.shadow_mode,
  updated_at = now();
