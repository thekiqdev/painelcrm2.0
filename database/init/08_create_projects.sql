-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  due_date TIMESTAMPTZ,
  tags JSONB DEFAULT '[]'::jsonb,
  kanban_stage TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create project_lists table (stages/columns)
CREATE TABLE IF NOT EXISTS public.project_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create project_tasks table
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.project_lists(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  assignee_id UUID,
  tags JSONB DEFAULT '[]'::jsonb,
  start_date TIMESTAMPTZ,
  start_time TEXT,
  end_time TEXT,
  estimated_effort_hours NUMERIC,
  estimated_story_points NUMERIC,
  checklist JSONB DEFAULT '[]'::jsonb,
  attachments JSONB DEFAULT '[]'::jsonb,
  dependencies JSONB DEFAULT '[]'::jsonb,
  watchers JSONB DEFAULT '[]'::jsonb,
  reminders JSONB DEFAULT '[]'::jsonb,
  recurrence_rule JSONB,
  milestone_id UUID,
  parent_task_id UUID REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  sprint_id UUID,
  visibility TEXT DEFAULT 'internal',
  billable BOOLEAN DEFAULT false,
  hourly_rate NUMERIC,
  budget_cap NUMERIC,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  severity TEXT,
  task_type TEXT DEFAULT 'task',
  meeting_location TEXT,
  meeting_link TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create project_templates table
CREATE TABLE IF NOT EXISTS public.project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create project_template_stages table
CREATE TABLE IF NOT EXISTS public.project_template_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_position INTEGER NOT NULL,
  offset_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create project_template_tasks table
CREATE TABLE IF NOT EXISTS public.project_template_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.project_template_stages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  offset_days INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER DEFAULT 1,
  priority TEXT DEFAULT 'medium',
  role TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_projects_user ON public.projects(user_id);
CREATE INDEX idx_project_lists_project ON public.project_lists(project_id);
CREATE INDEX idx_project_lists_user ON public.project_lists(user_id);
CREATE INDEX idx_project_tasks_list ON public.project_tasks(list_id);
CREATE INDEX idx_project_tasks_project ON public.project_tasks(project_id);
CREATE INDEX idx_project_tasks_user ON public.project_tasks(user_id);
CREATE INDEX idx_project_tasks_parent ON public.project_tasks(parent_task_id);
CREATE INDEX idx_project_tasks_type ON public.project_tasks(task_type);
CREATE INDEX idx_project_tasks_status ON public.project_tasks(status);

-- Create triggers for updated_at
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_lists_updated_at
  BEFORE UPDATE ON public.project_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_tasks_updated_at
  BEFORE UPDATE ON public.project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_templates_updated_at
  BEFORE UPDATE ON public.project_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


