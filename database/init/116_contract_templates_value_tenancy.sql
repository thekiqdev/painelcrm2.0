-- Modelos: título padrão, valor padrão, moeda e regras de vigência (cópia imutável no contrato).
-- Contratos: cópia das regras no momento da criação (o modelo não atualiza o contrato depois).

ALTER TABLE public.contract_templates
  ADD COLUMN IF NOT EXISTS default_title TEXT,
  ADD COLUMN IF NOT EXISTS default_total_value NUMERIC,
  ADD COLUMN IF NOT EXISTS default_currency TEXT DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS tenancy_rules JSONB DEFAULT NULL;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS tenancy_rules JSONB DEFAULT NULL;

COMMENT ON COLUMN public.contract_templates.default_title IS 'Título sugerido do contrato ao criar a partir deste modelo (editável no contrato).';
COMMENT ON COLUMN public.contract_templates.default_total_value IS 'Valor monetário sugerido; o contrato pode alterar antes do congelamento.';
COMMENT ON COLUMN public.contract_templates.tenancy_rules IS 'Regras de vigência: copiadas para contracts.tenancy_rules na criação; datas finais persistidas no contrato.';
COMMENT ON COLUMN public.contracts.tenancy_rules IS 'Cópia das regras do modelo na criação; não sincroniza com alterações posteriores do modelo.';
