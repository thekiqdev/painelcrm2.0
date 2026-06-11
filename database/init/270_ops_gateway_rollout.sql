-- Sprint N5.2 — Communication Gateway v1 habilitado somente para o tenant Ops (Super Admin).
-- Não altera platform_feature_flags globais.

INSERT INTO public.platform_feature_flag_overrides (flag_key, tenant_id, enabled)
VALUES
  (
    'communication.gateway_v1',
    '1f1a0f0a-0000-4000-8000-000000000001'::uuid,
    true
  ),
  (
    'communication.uazapi_bridge_v1',
    '1f1a0f0a-0000-4000-8000-000000000001'::uuid,
    true
  )
ON CONFLICT (flag_key, tenant_id)
DO UPDATE SET enabled = EXCLUDED.enabled;
