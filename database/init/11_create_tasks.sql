-- Create tasks table (standalone tasks for the Tasks page)
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  due_time TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name TEXT, -- Nome do cliente (pode ser diferente do client_id para flexibilidade)
  deal TEXT, -- Nome do negócio/deal
  assignee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assignee_name TEXT, -- Nome do responsável (pode ser diferente do assignee_id)
  checklist JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX idx_tasks_client_id ON public.tasks(client_id);
CREATE INDEX idx_tasks_assignee_id ON public.tasks(assignee_id);

-- Create trigger for updated_at
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

