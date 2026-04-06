-- Dados de contato/faturamento do tenant (checkout e customer no gateway)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS billing_phone TEXT,
  ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS responsible_name TEXT;

COMMENT ON COLUMN public.tenants.billing_email IS 'Email para faturamento e customer no gateway (checkout)';
COMMENT ON COLUMN public.tenants.billing_phone IS 'Telefone para customer no gateway';
COMMENT ON COLUMN public.tenants.cpf_cnpj IS 'CPF ou CNPJ para customer no gateway';
COMMENT ON COLUMN public.tenants.responsible_name IS 'Nome do responsável (checkout)';
