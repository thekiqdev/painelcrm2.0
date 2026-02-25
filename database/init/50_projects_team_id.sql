-- Etapa 5: Integração projetos ↔ equipes (equipe responsável por projeto)

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS team_id UUID NULL REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_team_id ON public.projects(team_id);
COMMENT ON COLUMN public.projects.team_id IS 'Equipe responsável pelo projeto (opcional); escopo do tenant';
