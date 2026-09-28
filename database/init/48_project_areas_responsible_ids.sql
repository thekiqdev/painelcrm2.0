-- Responsáveis que podem visualizar a área (IDs de usuários/membros)
ALTER TABLE public.project_areas
  ADD COLUMN IF NOT EXISTS responsible_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_project_areas_responsible_ids ON public.project_areas USING GIN (responsible_ids);
COMMENT ON COLUMN public.project_areas.responsible_ids IS 'IDs dos responsáveis que podem visualizar a área (array de UUIDs)';
