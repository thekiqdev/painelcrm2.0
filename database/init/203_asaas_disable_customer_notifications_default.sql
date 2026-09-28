-- Asaas: opção padrão em options (alinhado ao supabase/migrations/20260510120000_...).
UPDATE payment_gateway_configs
SET options = COALESCE(options, '{}'::jsonb) || jsonb_build_object('asaas_disable_customer_notifications', true)
WHERE gateway_key = 'asaas'
  AND (options IS NULL OR options->>'asaas_disable_customer_notifications' IS NULL);
