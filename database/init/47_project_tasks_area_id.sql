-- Tarefas podem pertencer a uma área (projetos tipo areas/advanced)
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS area_id UUID NULL REFERENCES public.project_areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_tasks_area_id ON public.project_tasks(area_id);
COMMENT ON COLUMN public.project_tasks.area_id IS 'Área do projeto (tipos areas/advanced); NULL para projetos simple.';
