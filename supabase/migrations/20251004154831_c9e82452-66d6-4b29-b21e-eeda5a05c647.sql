-- Create project_templates table
CREATE TABLE public.project_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create project_template_stages table
CREATE TABLE public.project_template_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_position INTEGER NOT NULL,
  offset_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create project_template_tasks table
CREATE TABLE public.project_template_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id UUID NOT NULL REFERENCES public.project_template_stages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  offset_days INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER DEFAULT 1,
  priority TEXT DEFAULT 'medium',
  role TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_template_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_template_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_templates
CREATE POLICY "Users can view their own templates"
  ON public.project_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own templates"
  ON public.project_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
  ON public.project_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
  ON public.project_templates FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for project_template_stages
CREATE POLICY "Users can view stages of their templates"
  ON public.project_template_stages FOR SELECT
  USING (template_id IN (SELECT id FROM public.project_templates WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert stages in their templates"
  ON public.project_template_stages FOR INSERT
  WITH CHECK (template_id IN (SELECT id FROM public.project_templates WHERE user_id = auth.uid()));

CREATE POLICY "Users can update stages in their templates"
  ON public.project_template_stages FOR UPDATE
  USING (template_id IN (SELECT id FROM public.project_templates WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete stages from their templates"
  ON public.project_template_stages FOR DELETE
  USING (template_id IN (SELECT id FROM public.project_templates WHERE user_id = auth.uid()));

-- RLS Policies for project_template_tasks
CREATE POLICY "Users can view tasks of their templates"
  ON public.project_template_tasks FOR SELECT
  USING (stage_id IN (
    SELECT s.id FROM public.project_template_stages s
    JOIN public.project_templates t ON s.template_id = t.id
    WHERE t.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert tasks in their templates"
  ON public.project_template_tasks FOR INSERT
  WITH CHECK (stage_id IN (
    SELECT s.id FROM public.project_template_stages s
    JOIN public.project_templates t ON s.template_id = t.id
    WHERE t.user_id = auth.uid()
  ));

CREATE POLICY "Users can update tasks in their templates"
  ON public.project_template_tasks FOR UPDATE
  USING (stage_id IN (
    SELECT s.id FROM public.project_template_stages s
    JOIN public.project_templates t ON s.template_id = t.id
    WHERE t.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete tasks from their templates"
  ON public.project_template_tasks FOR DELETE
  USING (stage_id IN (
    SELECT s.id FROM public.project_template_stages s
    JOIN public.project_templates t ON s.template_id = t.id
    WHERE t.user_id = auth.uid()
  ));

-- Trigger for updated_at
CREATE TRIGGER update_project_templates_updated_at
  BEFORE UPDATE ON public.project_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();