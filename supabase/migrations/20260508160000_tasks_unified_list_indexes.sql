-- Suporte à listagem unificada de tarefas (filtros por utilizador / datas)

CREATE INDEX IF NOT EXISTS idx_tasks_user_id_due_date ON public.tasks (user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id_due_date ON public.tasks (assignee_id, due_date)
  WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at_desc ON public.tasks (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_assignee ON public.project_tasks (project_id, assignee_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_user_id ON public.project_tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_due_updated ON public.project_tasks (due_date, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_tasks_user_client ON public.client_tasks (user_id, client_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_due ON public.client_tasks (due_date);

CREATE INDEX IF NOT EXISTS idx_lead_tasks_user_lead ON public.lead_tasks (user_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_due ON public.lead_tasks (due_date);
