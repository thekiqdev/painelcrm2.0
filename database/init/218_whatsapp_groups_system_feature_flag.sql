-- Grupos WhatsApp (UazAPI): ativo por defeito; Super Admin pode desligar em Conexões.
INSERT INTO public.system_feature_flags (key, value, scope, tenant_id)
SELECT 'whatsapp_groups_enabled', true, 'global', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_feature_flags
  WHERE key = 'whatsapp_groups_enabled' AND scope = 'global' AND tenant_id IS NULL
);
