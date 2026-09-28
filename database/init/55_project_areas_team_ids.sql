-- Equipes que podem visualizar a área (além de responsible_ids)
ALTER TABLE public.project_areas
  ADD COLUMN IF NOT EXISTS team_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_project_areas_team_ids ON public.project_areas USING GIN (team_ids);
COMMENT ON COLUMN public.project_areas.team_ids IS 'IDs das equipes cujos membros podem visualizar a área (array de UUIDs)';
