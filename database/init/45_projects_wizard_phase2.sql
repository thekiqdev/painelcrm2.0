-- Fase 2 — Wizard: campos básicos para criação (cliente, datas, responsáveis)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS responsible_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);
COMMENT ON COLUMN public.projects.client_id IS 'Cliente vinculado ao projeto (opcional)';
COMMENT ON COLUMN public.projects.start_date IS 'Data de início (opcional)';
COMMENT ON COLUMN public.projects.end_date IS 'Data de término (opcional)';
COMMENT ON COLUMN public.projects.responsible_ids IS 'IDs dos responsáveis iniciais (array UUID)';
