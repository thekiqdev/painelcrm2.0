-- Etapa 2 contratos: snapshot imutável do documento + marcação de congelamento
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS content_snapshot_html TEXT,
  ADD COLUMN IF NOT EXISTS document_frozen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contracts.content_snapshot_html IS 'Cópia do HTML no momento do congelamento (envio/ativação); fonte jurídica para exibição quando preenchida.';
COMMENT ON COLUMN public.contracts.document_frozen_at IS 'Momento em que o corpo do contrato foi congelado.';

-- Contratos já emitidos: preservar corpo atual como snapshot
UPDATE public.contracts
SET
  content_snapshot_html = COALESCE(NULLIF(trim(content_html), ''), content_snapshot_html),
  document_frozen_at = COALESCE(document_frozen_at, updated_at, created_at)
WHERE status IS DISTINCT FROM 'DRAFT'
  AND content_snapshot_html IS NULL;
