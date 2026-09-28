-- Fase 4 — ciclo de vida de versões/releases de projetos avançados

ALTER TABLE public.project_versions
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS published_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS release_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS include_in_release_notes BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS release_note_type TEXT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'project_versions'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.project_versions DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

UPDATE public.project_versions
SET status = CASE status
  WHEN 'planned' THEN 'planning'
  WHEN 'in_progress' THEN 'development'
  WHEN 'released' THEN 'published'
  ELSE COALESCE(status, 'planning')
END
WHERE status IS NULL OR status IN ('planned', 'in_progress', 'released');

UPDATE public.project_versions
SET status = 'archived'
WHERE archived_at IS NOT NULL
  AND status <> 'archived';

ALTER TABLE public.project_versions
  ALTER COLUMN status SET DEFAULT 'planning',
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'project_versions'
      AND c.conname = 'project_versions_status_lifecycle_check'
  ) THEN
    ALTER TABLE public.project_versions
      ADD CONSTRAINT project_versions_status_lifecycle_check
      CHECK (status IN ('planning', 'development', 'qa', 'published', 'archived'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'project_tasks'
      AND c.conname = 'project_tasks_release_note_type_check'
  ) THEN
    ALTER TABLE public.project_tasks
      ADD CONSTRAINT project_tasks_release_note_type_check
      CHECK (
        release_note_type IS NULL
        OR release_note_type IN ('feature', 'fix', 'improvement', 'internal')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_versions_project_status
  ON public.project_versions (project_id, status);

CREATE INDEX IF NOT EXISTS idx_project_versions_project_frozen
  ON public.project_versions (project_id, frozen);

CREATE INDEX IF NOT EXISTS idx_project_tasks_release_notes
  ON public.project_tasks (project_id, version_id, include_in_release_notes, release_note_type);

COMMENT ON COLUMN public.project_versions.release_notes IS 'Notas de release/changelog geradas ou editadas para a versão.';
COMMENT ON COLUMN public.project_versions.frozen IS 'Quando true, bloqueia alterações operacionais nas tarefas da versão.';
COMMENT ON COLUMN public.project_tasks.include_in_release_notes IS 'Controla se a tarefa entra no changelog automático da versão.';
COMMENT ON COLUMN public.project_tasks.release_note_type IS 'Categoria da tarefa no changelog: feature, fix, improvement ou internal.';
