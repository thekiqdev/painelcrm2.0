-- Ver database/init/233_project_versions_phase2.sql

ALTER TABLE public.project_versions
  ADD COLUMN IF NOT EXISTS description TEXT NULL,
  ADD COLUMN IF NOT EXISTS start_date DATE NULL,
  ADD COLUMN IF NOT EXISTS due_date DATE NULL,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

UPDATE public.project_versions
SET due_date = (release_date AT TIME ZONE 'UTC')::date
WHERE due_date IS NULL AND release_date IS NOT NULL;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS version_id UUID NULL REFERENCES public.project_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_version
  ON public.project_tasks (project_id, version_id);

CREATE INDEX IF NOT EXISTS idx_project_tasks_version_id
  ON public.project_tasks (version_id);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_area_version
  ON public.project_tasks (project_id, area_id, version_id);

CREATE INDEX IF NOT EXISTS idx_project_versions_project_sort
  ON public.project_versions (project_id, sort_order);

INSERT INTO public.project_versions (project_id, name, status, sort_order, is_default)
SELECT p.id, 'Backlog', 'planned', 0, true
FROM public.projects p
WHERE p.project_type = 'advanced'
  AND NOT EXISTS (
    SELECT 1 FROM public.project_versions pv WHERE pv.project_id = p.id
  );

WITH ranked AS (
  SELECT pv.id, pv.project_id,
    ROW_NUMBER() OVER (PARTITION BY pv.project_id ORDER BY pv.sort_order ASC, pv.created_at ASC) AS rn
  FROM public.project_versions pv
  INNER JOIN public.projects p ON p.id = pv.project_id
  WHERE p.project_type = 'advanced'
)
UPDATE public.project_versions pv
SET is_default = true
FROM ranked r
WHERE pv.id = r.id
  AND r.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.project_versions x
    WHERE x.project_id = r.project_id AND x.is_default = true
  );

COMMENT ON COLUMN public.project_tasks.version_id IS 'Versão do projeto (tipo advanced); NULL = sem versão / backlog geral';
