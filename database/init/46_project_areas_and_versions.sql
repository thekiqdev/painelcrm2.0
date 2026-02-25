-- Fase 3 — Áreas do projeto e versões (releases) para tipo areas/advanced
-- project_areas: áreas por projeto (times/domínios)
-- project_versions: versões/releases para projeto avançado

CREATE TABLE IF NOT EXISTS public.project_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_areas_project_id ON public.project_areas(project_id);

CREATE TABLE IF NOT EXISTS public.project_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  release_date TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'released')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON public.project_versions(project_id);

COMMENT ON TABLE public.project_areas IS 'Áreas do projeto (tipos areas/advanced)';
COMMENT ON TABLE public.project_versions IS 'Versões/releases do projeto (tipo advanced)';
