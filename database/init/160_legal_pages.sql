-- Páginas legais editáveis pelo Super Admin (privacidade / termos), leitura pública via API + rotas /legal/*.

CREATE TABLE IF NOT EXISTS public.legal_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL UNIQUE CHECK (type IN ('privacy_policy', 'terms_of_service')),
  content_html TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_legal_pages_updated_at
  BEFORE UPDATE ON public.legal_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_legal_pages_type ON public.legal_pages(type);

COMMENT ON TABLE public.legal_pages IS 'Política de privacidade e termos de uso (HTML sanitizado no backend; leitura pública).';
