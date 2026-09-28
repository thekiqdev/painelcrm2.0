-- Opção padrão: desativar notificações nativas do Asaas para clientes (lógica no backend default true se ausente).
-- Persistência explícita para configs existentes sem a chave.
UPDATE payment_gateway_configs
SET options = COALESCE(options, '{}'::jsonb) || jsonb_build_object('asaas_disable_customer_notifications', true)
WHERE gateway_key = 'asaas'
  AND (options IS NULL OR options->>'asaas_disable_customer_notifications' IS NULL);
