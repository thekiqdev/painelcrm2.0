-- Create message_templates table
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('new_invoice', 'new_ticket', 'new_project', 'new_task', 'contract_send', 'contract_link')),
  subject TEXT,
  body TEXT NOT NULL,
  is_predefined BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  variables JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name, type)
);

-- Create message_logs table to track sent messages
CREATE TABLE IF NOT EXISTS public.message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'both')),
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_message_templates_user_id ON public.message_templates(user_id);
CREATE INDEX idx_message_templates_type ON public.message_templates(type);
CREATE INDEX idx_message_templates_is_predefined ON public.message_templates(is_predefined);
CREATE INDEX idx_message_templates_is_active ON public.message_templates(is_active);

CREATE INDEX idx_message_logs_user_id ON public.message_logs(user_id);
CREATE INDEX idx_message_logs_template_id ON public.message_logs(template_id);
CREATE INDEX idx_message_logs_status ON public.message_logs(status);
CREATE INDEX idx_message_logs_created_at ON public.message_logs(created_at);

-- Create trigger for updated_at
CREATE TRIGGER update_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert predefined templates for all users (will be created per user on first access)
-- These are just examples, actual templates will be created per user

