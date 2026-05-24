-- Páginas extras editáveis + overlay JSON (editor virtual; PDF original intacto na edição).

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS source_pdf_page_count INT;

COMMENT ON COLUMN public.contracts.source_pdf_page_count IS
  'Número de páginas do PDF original enviado. pdf_page_count = virtual (original + extras).';

CREATE TABLE IF NOT EXISTS public.contract_pdf_extra_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  page_order INT NOT NULL CHECK (page_order >= 1),
  editor_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  html_snapshot TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, page_order)
);

CREATE INDEX IF NOT EXISTS idx_contract_pdf_extra_pages_contract
  ON public.contract_pdf_extra_pages (contract_id, page_order);

CREATE TABLE IF NOT EXISTS public.contract_pdf_overlay_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  page INT NOT NULL CHECK (page >= 1),
  type TEXT NOT NULL CHECK (type IN ('signature', 'text', 'date', 'initial', 'checkbox', 'image')),
  x NUMERIC(8, 4) NOT NULL DEFAULT 0 CHECK (x >= 0 AND x <= 100),
  y NUMERIC(8, 4) NOT NULL DEFAULT 0 CHECK (y >= 0 AND y <= 100),
  width NUMERIC(8, 4) NOT NULL DEFAULT 10 CHECK (width > 0 AND width <= 100),
  height NUMERIC(8, 4) NOT NULL DEFAULT 5 CHECK (height > 0 AND height <= 100),
  signer_id UUID REFERENCES public.contract_signers(id) ON DELETE SET NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_pdf_overlay_contract_page
  ON public.contract_pdf_overlay_elements (contract_id, page, sort_order);

COMMENT ON TABLE public.contract_pdf_extra_pages IS
  'Páginas adicionais com texto rico; renderizadas na exportação/assinatura, sem alterar o PDF original.';
COMMENT ON TABLE public.contract_pdf_overlay_elements IS
  'Camada overlay virtual (futuro: texto, rubrica). Assinaturas legadas continuam em contract_signature_fields.';
