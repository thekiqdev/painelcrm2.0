-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  status text DEFAULT 'active',
  due_date timestamp with time zone,
  tags jsonb DEFAULT '[]'::jsonb,
  kanban_stage text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create project_lists table (stages/columns)
CREATE TABLE IF NOT EXISTS public.project_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  order_position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create project_tasks table with all new fields
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid REFERENCES public.project_lists(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Basic fields
  title text NOT NULL,
  description text,
  status text DEFAULT 'todo',
  priority text DEFAULT 'medium',
  due_date timestamp with time zone,
  assignee_id uuid,
  tags jsonb DEFAULT '[]'::jsonb,
  
  -- Time tracking
  start_date timestamp with time zone,
  start_time text,
  end_time text,
  estimated_effort_hours numeric,
  estimated_story_points numeric,
  
  -- Checklist and attachments
  checklist jsonb DEFAULT '[]'::jsonb,
  attachments jsonb DEFAULT '[]'::jsonb,
  
  -- Dependencies and watchers
  dependencies jsonb DEFAULT '[]'::jsonb,
  watchers jsonb DEFAULT '[]'::jsonb,
  
  -- Reminders and recurrence
  reminders jsonb DEFAULT '[]'::jsonb,
  recurrence_rule jsonb,
  
  -- Project structure
  milestone_id uuid,
  parent_task_id uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  sprint_id uuid,
  
  -- Visibility and billing
  visibility text DEFAULT 'internal',
  billable boolean DEFAULT false,
  hourly_rate numeric,
  budget_cap numeric,
  
  -- Custom fields
  custom_fields jsonb DEFAULT '{}'::jsonb,
  
  -- Task type and severity
  severity text,
  task_type text DEFAULT 'task',
  
  -- Meeting info
  meeting_location text,
  meeting_link text,
  
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
CREATE POLICY "Users can view their own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for project_lists
CREATE POLICY "Users can view their own project lists"
  ON public.project_lists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own project lists"
  ON public.project_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own project lists"
  ON public.project_lists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own project lists"
  ON public.project_lists FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for project_tasks
CREATE POLICY "Users can view their own project tasks"
  ON public.project_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own project tasks"
  ON public.project_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own project tasks"
  ON public.project_tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own project tasks"
  ON public.project_tasks FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_projects_user ON public.projects(user_id);
CREATE INDEX idx_project_lists_project ON public.project_lists(project_id);
CREATE INDEX idx_project_lists_user ON public.project_lists(user_id);
CREATE INDEX idx_project_tasks_list ON public.project_tasks(list_id);
CREATE INDEX idx_project_tasks_project ON public.project_tasks(project_id);
CREATE INDEX idx_project_tasks_user ON public.project_tasks(user_id);
CREATE INDEX idx_project_tasks_parent ON public.project_tasks(parent_task_id);
CREATE INDEX idx_project_tasks_type ON public.project_tasks(task_type);
CREATE INDEX idx_project_tasks_status ON public.project_tasks(status);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_lists_updated_at
  BEFORE UPDATE ON public.project_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_tasks_updated_at
  BEFORE UPDATE ON public.project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();