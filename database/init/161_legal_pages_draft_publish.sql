-- Etapa 2: rascunho vs publicado, status, datas de publicação.
-- Rollback manual (apenas se necessário): recriar content_html a partir de content_published;
-- ALTER TABLE legal_pages DROP COLUMN content_draft; ... (ajustar conforme estado).

ALTER TABLE public.legal_pages ADD COLUMN IF NOT EXISTS content_draft TEXT;
ALTER TABLE public.legal_pages ADD COLUMN IF NOT EXISTS content_published TEXT;
ALTER TABLE public.legal_pages ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.legal_pages ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.legal_pages ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'legal_pages' AND column_name = 'content_html'
  ) THEN
    UPDATE public.legal_pages lp
    SET
      content_draft = COALESCE(lp.content_html, ''),
      content_published = CASE
        WHEN length(trim(regexp_replace(COALESCE(lp.content_html, ''), '<[^>]+>', ' ', 'g'))) >= 50
          THEN COALESCE(lp.content_html, '')
        ELSE ''
      END,
      status = CASE
        WHEN length(trim(regexp_replace(COALESCE(lp.content_html, ''), '<[^>]+>', ' ', 'g'))) >= 50
          THEN 'published'
        ELSE 'draft'
      END,
      published_at = CASE
        WHEN length(trim(regexp_replace(COALESCE(lp.content_html, ''), '<[^>]+>', ' ', 'g'))) >= 50
          THEN lp.updated_at
        ELSE NULL
      END,
      published_by = CASE
        WHEN length(trim(regexp_replace(COALESCE(lp.content_html, ''), '<[^>]+>', ' ', 'g'))) >= 50
          THEN lp.updated_by
        ELSE NULL
      END;

    ALTER TABLE public.legal_pages DROP COLUMN content_html;
  END IF;
END $$;

UPDATE public.legal_pages SET content_draft = '' WHERE content_draft IS NULL;
UPDATE public.legal_pages SET content_published = '' WHERE content_published IS NULL;
UPDATE public.legal_pages SET status = 'draft' WHERE status IS NULL OR status NOT IN ('draft', 'published');

ALTER TABLE public.legal_pages ALTER COLUMN content_draft SET DEFAULT '';
ALTER TABLE public.legal_pages ALTER COLUMN content_published SET DEFAULT '';
ALTER TABLE public.legal_pages ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE public.legal_pages ALTER COLUMN content_draft SET NOT NULL;
ALTER TABLE public.legal_pages ALTER COLUMN content_published SET NOT NULL;
ALTER TABLE public.legal_pages ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.legal_pages DROP CONSTRAINT IF EXISTS legal_pages_status_check;
ALTER TABLE public.legal_pages ADD CONSTRAINT legal_pages_status_check CHECK (status IN ('draft', 'published'));

COMMENT ON COLUMN public.legal_pages.content_draft IS 'HTML sanitizado em edição (rascunho).';
COMMENT ON COLUMN public.legal_pages.content_published IS 'HTML sanitizado servido nas páginas públicas.';
COMMENT ON COLUMN public.legal_pages.status IS 'draft = nunca publicado com sucesso; published = existe versão publicada.';
COMMENT ON COLUMN public.legal_pages.published_at IS 'Última publicação bem-sucedida.';
COMMENT ON COLUMN public.legal_pages.published_by IS 'Super admin que publicou por último.';
