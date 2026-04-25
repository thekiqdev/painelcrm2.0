-- Ativa por defeito leitura e dual-write de ciclos de assinatura em instalações que já correram 141 com 'false'.
-- O Super Admin pode desligar em: Configurações → Faturas recorrentes — Ciclos de assinatura.
INSERT INTO public.superadmin_settings (key, value, updated_at)
VALUES
  ('subscription_cycles_read', 'true', now()),
  ('subscription_cycles_write', 'true', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
