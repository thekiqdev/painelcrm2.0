-- Ticket teams table
CREATE TABLE IF NOT EXISTS public.ticket_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  members JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket categories table
CREATE TABLE IF NOT EXISTS public.ticket_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6E56CF',
  default_team_id UUID REFERENCES public.ticket_teams(id) ON DELETE SET NULL,
  custom_form JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SLA policies table
CREATE TABLE IF NOT EXISTS public.ticket_sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  priority public.ticket_priority NOT NULL,
  first_response_minutes INTEGER NOT NULL,
  resolution_minutes INTEGER NOT NULL,
  business_hours JSONB DEFAULT '{"enabled": false, "schedule": {"monday": {"start": "09:00", "end": "18:00"}, "tuesday": {"start": "09:00", "end": "18:00"}, "wednesday": {"start": "09:00", "end": "18:00"}, "thursday": {"start": "09:00", "end": "18:00"}, "friday": {"start": "09:00", "end": "18:00"}}}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, priority)
);

-- Tickets table
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL,
  public_access_token TEXT UNIQUE DEFAULT (
    replace(gen_random_uuid()::text, '-', '') ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 16)
  ),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
  priority public.ticket_priority NOT NULL DEFAULT 'normal',
  status public.ticket_status NOT NULL DEFAULT 'new',
  channel public.ticket_channel NOT NULL DEFAULT 'portal',
  team_id UUID REFERENCES public.ticket_teams(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  sla_policy_id UUID REFERENCES public.ticket_sla_policies(id) ON DELETE SET NULL,
  first_response_at TIMESTAMPTZ,
  first_response_due_at TIMESTAMPTZ,
  resolution_due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  sla_paused_at TIMESTAMPTZ,
  sla_paused_duration INTEGER DEFAULT 0,
  billable BOOLEAN DEFAULT false,
  billable_hours NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket messages table
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  visibility public.message_visibility NOT NULL DEFAULT 'public',
  attachments JSONB DEFAULT '[]'::jsonb,
  mentions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket watchers table
CREATE TABLE IF NOT EXISTS public.ticket_watchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, user_id)
);

-- Ticket templates table
CREATE TABLE IF NOT EXISTS public.ticket_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  category_id UUID REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket automations table
CREATE TABLE IF NOT EXISTS public.ticket_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type public.automation_trigger NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket activity log
CREATE TABLE IF NOT EXISTS public.ticket_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  changes JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_tickets_user_id ON public.tickets(user_id);
CREATE INDEX idx_tickets_client_id ON public.tickets(client_id);
CREATE INDEX idx_tickets_assignee_id ON public.tickets(assignee_id);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_priority ON public.tickets(priority);
CREATE INDEX idx_tickets_created_at ON public.tickets(created_at);
CREATE INDEX idx_ticket_messages_ticket_id ON public.ticket_messages(ticket_id);
CREATE INDEX idx_ticket_activities_ticket_id ON public.ticket_activities(ticket_id);

-- Function to generate ticket number
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO counter FROM public.tickets;
  new_number := 'TICKET-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 4, '0');
  RETURN new_number;
END;
$$;

-- Trigger to set ticket number
CREATE OR REPLACE FUNCTION public.set_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := public.generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_ticket_number
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ticket_number();

-- Trigger to calculate SLA due dates
CREATE OR REPLACE FUNCTION public.calculate_ticket_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  policy RECORD;
BEGIN
  SELECT * INTO policy
  FROM public.ticket_sla_policies
  WHERE user_id = NEW.user_id
    AND priority = NEW.priority
    AND is_active = true
  LIMIT 1;

  IF policy.id IS NOT NULL THEN
    NEW.sla_policy_id := policy.id;
    NEW.first_response_due_at := NEW.created_at + (policy.first_response_minutes || ' minutes')::INTERVAL;
    NEW.resolution_due_at := NEW.created_at + (policy.resolution_minutes || ' minutes')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_calculate_ticket_sla
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_ticket_sla();

-- Trigger to log ticket status changes
CREATE OR REPLACE FUNCTION public.log_ticket_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.ticket_activities (ticket_id, user_id, activity_type, changes)
    VALUES (
      NEW.id,
      NEW.user_id,
      'status_changed',
      jsonb_build_object(
        'from', OLD.status,
        'to', NEW.status
      )
    );

    IF NEW.status = 'waiting_customer' AND OLD.status != 'waiting_customer' THEN
      NEW.sla_paused_at := now();
    ELSIF OLD.status = 'waiting_customer' AND NEW.status != 'waiting_customer' THEN
      IF NEW.sla_paused_at IS NOT NULL THEN
        NEW.sla_paused_duration := NEW.sla_paused_duration + EXTRACT(EPOCH FROM (now() - NEW.sla_paused_at))::INTEGER;
        NEW.sla_paused_at := NULL;
      END IF;
    END IF;

    IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
      NEW.resolved_at := now();
    END IF;

    IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
      NEW.closed_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_log_ticket_status_change
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.log_ticket_status_change();

-- Trigger to set first response time
CREATE OR REPLACE FUNCTION public.set_first_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket_record RECORD;
BEGIN
  SELECT * INTO ticket_record FROM public.tickets WHERE id = NEW.ticket_id;

  IF ticket_record.first_response_at IS NULL 
     AND NEW.visibility = 'public' 
     AND NEW.user_id != ticket_record.user_id THEN
    
    UPDATE public.tickets
    SET first_response_at = NEW.created_at
    WHERE id = NEW.ticket_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_first_response
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_first_response();

-- Create triggers for updated_at
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ticket_teams_updated_at
  BEFORE UPDATE ON public.ticket_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ticket_categories_updated_at
  BEFORE UPDATE ON public.ticket_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ticket_sla_policies_updated_at
  BEFORE UPDATE ON public.ticket_sla_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ticket_templates_updated_at
  BEFORE UPDATE ON public.ticket_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ticket_automations_updated_at
  BEFORE UPDATE ON public.ticket_automations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ticket_messages_updated_at
  BEFORE UPDATE ON public.ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


