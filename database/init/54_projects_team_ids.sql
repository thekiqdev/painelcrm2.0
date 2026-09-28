-- Equipes responsáveis por projeto (múltiplas). Mantém team_id como primeira equipe para compatibilidade.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS team_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_projects_team_ids ON public.projects USING GIN (team_ids);
COMMENT ON COLUMN public.projects.team_ids IS 'Lista de IDs de equipes responsáveis pelo projeto (UUIDs como strings no array).';
