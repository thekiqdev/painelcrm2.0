-- Etapa 1 — CPF, CNPJ, RG e razão social do cliente.
-- clients.cpf_cnpj permanece o documento de cobrança já enviado ao Asaas.
-- 11 dígitos vão para cpf; 14 vão para cnpj. Outro tamanho fica só em cpf_cnpj.
-- rg e razao_social nascem vazios. O nome em company não é copiado para razao_social.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS cnpj TEXT,
  ADD COLUMN IF NOT EXISTS rg TEXT,
  ADD COLUMN IF NOT EXISTS razao_social TEXT,
  ADD COLUMN IF NOT EXISTS billing_document TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_cpf_digits_chk'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_cpf_digits_chk
      CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_cnpj_digits_chk'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_cnpj_digits_chk
      CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_rg_len_chk'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_rg_len_chk
      CHECK (rg IS NULL OR char_length(rg) <= 20);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_razao_social_len_chk'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_razao_social_len_chk
      CHECK (razao_social IS NULL OR char_length(razao_social) <= 200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_billing_document_chk'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_billing_document_chk
      CHECK (
        billing_document IS NULL
        OR (billing_document = 'cpf' AND cpf IS NOT NULL)
        OR (billing_document = 'cnpj' AND cnpj IS NOT NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.clients.cpf IS 'CPF do cliente, só 11 dígitos. Documento de cobrança quando billing_document = cpf.';
COMMENT ON COLUMN public.clients.cnpj IS 'CNPJ do cliente, só 14 dígitos. Documento de cobrança quando billing_document = cnpj.';
COMMENT ON COLUMN public.clients.rg IS 'RG do cliente. Não é enviado ao Asaas.';
COMMENT ON COLUMN public.clients.razao_social IS 'Razão social. Não é preenchida a partir de company e não é enviada ao Asaas.';
COMMENT ON COLUMN public.clients.billing_document IS 'Documento usado na cobrança: cpf ou cnpj. Nulo quando não há documento classificado.';

UPDATE public.clients AS c
SET
  cpf = CASE WHEN d.len = 11 THEN d.digits ELSE c.cpf END,
  cnpj = CASE WHEN d.len = 14 THEN d.digits ELSE c.cnpj END,
  billing_document = CASE
    WHEN d.len = 11 THEN 'cpf'
    WHEN d.len = 14 THEN 'cnpj'
    ELSE c.billing_document
  END
FROM (
  SELECT
    id,
    regexp_replace(cpf_cnpj, '\D', '', 'g') AS digits,
    length(regexp_replace(cpf_cnpj, '\D', '', 'g')) AS len
  FROM public.clients
  WHERE billing_document IS NULL
    AND cpf IS NULL
    AND cnpj IS NULL
    AND cpf_cnpj IS NOT NULL
    AND btrim(cpf_cnpj) <> ''
) AS d
WHERE c.id = d.id
  AND d.len IN (11, 14);

DO $$
DECLARE
  unclassified integer;
BEGIN
  SELECT count(*) INTO unclassified
  FROM public.clients
  WHERE cpf_cnpj IS NOT NULL
    AND btrim(cpf_cnpj) <> ''
    AND length(regexp_replace(cpf_cnpj, '\D', '', 'g')) NOT IN (11, 14);

  RAISE NOTICE 'clients.cpf_cnpj com tamanho diferente de 11 ou 14 (não classificados): %', unclassified;
END $$;
