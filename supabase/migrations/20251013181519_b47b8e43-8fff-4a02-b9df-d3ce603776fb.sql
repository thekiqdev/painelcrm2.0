-- Create enums for tickets system
CREATE TYPE ticket_status AS ENUM (
  'new',
  'open',
  'pending',
  'waiting_customer',
  'in_progress',
  'resolved',
  'closed',
  'cancelled'
);

CREATE TYPE ticket_priority AS ENUM (
  'low',
  'normal',
  'high',
  'urgent'
);

CREATE TYPE ticket_channel AS ENUM (
  'portal',
  'email',
  'whatsapp',
  'internal'
);

CREATE TYPE message_visibility AS ENUM (
  'public',
  'internal'
);

CREATE TYPE automation_trigger AS ENUM (
  'on_create',
  'on_update',
  'status_change',
  'sla_overdue',
  'first_response_overdue',
  'resolution_overdue'
);

-- Ticket teams table
CREATE TABLE ticket_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  members JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ticket_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own teams" ON ticket_teams
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users manage own teams" ON ticket_teams
  FOR ALL USING (auth.uid() = user_id);

-- Ticket categories table
CREATE TABLE ticket_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6E56CF',
  default_team_id UUID REFERENCES ticket_teams(id),
  custom_form JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ticket_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own categories" ON ticket_categories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users manage own categories" ON ticket_categories
  FOR ALL USING (auth.uid() = user_id);

-- SLA policies table
CREATE TABLE ticket_sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_id UUID,
  name TEXT NOT NULL,
  priority ticket_priority NOT NULL,
  first_response_minutes INTEGER NOT NULL,
  resolution_minutes INTEGER NOT NULL,
  business_hours JSONB DEFAULT '{"enabled": false, "schedule": {"monday": {"start": "09:00", "end": "18:00"}, "tuesday": {"start": "09:00", "end": "18:00"}, "wednesday": {"start": "09:00", "end": "18:00"}, "thursday": {"start": "09:00", "end": "18:00"}, "friday": {"start": "09:00", "end": "18:00"}}}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, priority)
);

ALTER TABLE ticket_sla_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own SLA policies" ON ticket_sla_policies
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users manage own SLA policies" ON ticket_sla_policies
  FOR ALL USING (auth.uid() = user_id);

-- Tickets table
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL,
  user_id UUID NOT NULL,
  profile_id UUID,
  client_id UUID REFERENCES clients(id),
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id UUID REFERENCES ticket_categories(id),
  priority ticket_priority NOT NULL DEFAULT 'normal',
  status ticket_status NOT NULL DEFAULT 'new',
  channel ticket_channel NOT NULL DEFAULT 'portal',
  team_id UUID REFERENCES ticket_teams(id),
  assignee_id UUID,
  tags JSONB DEFAULT '[]'::jsonb,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  sla_policy_id UUID REFERENCES ticket_sla_policies(id),
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

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Users view tickets they created or are assigned to
CREATE POLICY "Users view own tickets" ON tickets
  FOR SELECT USING (
    auth.uid() = user_id OR 
    auth.uid() = assignee_id OR
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );

-- Users manage tickets they own
CREATE POLICY "Users manage own tickets" ON tickets
  FOR ALL USING (auth.uid() = user_id);

-- Clients can view their tickets
CREATE POLICY "Clients view their tickets" ON tickets
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );

-- Clients can create tickets
CREATE POLICY "Clients create tickets" ON tickets
  FOR INSERT WITH CHECK (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );

-- Ticket messages table
CREATE TABLE ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  visibility message_visibility NOT NULL DEFAULT 'public',
  attachments JSONB DEFAULT '[]'::jsonb,
  mentions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

-- Users view messages for tickets they have access to
CREATE POLICY "Users view ticket messages" ON ticket_messages
  FOR SELECT USING (
    ticket_id IN (
      SELECT id FROM tickets 
      WHERE user_id = auth.uid() 
        OR assignee_id = auth.uid()
        OR client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    )
  );

-- Users create messages for tickets they have access to
CREATE POLICY "Users create ticket messages" ON ticket_messages
  FOR INSERT WITH CHECK (
    ticket_id IN (
      SELECT id FROM tickets 
      WHERE user_id = auth.uid() 
        OR assignee_id = auth.uid()
        OR client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    )
  );

-- Ticket watchers table
CREATE TABLE ticket_watchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, user_id)
);

ALTER TABLE ticket_watchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view watchers for accessible tickets" ON ticket_watchers
  FOR SELECT USING (
    ticket_id IN (
      SELECT id FROM tickets 
      WHERE user_id = auth.uid() OR assignee_id = auth.uid()
    )
  );

CREATE POLICY "Users manage watchers for own tickets" ON ticket_watchers
  FOR ALL USING (
    ticket_id IN (SELECT id FROM tickets WHERE user_id = auth.uid())
  );

-- Ticket templates (canned responses)
CREATE TABLE ticket_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_id UUID,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  category_id UUID REFERENCES ticket_categories(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ticket_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own templates" ON ticket_templates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users manage own templates" ON ticket_templates
  FOR ALL USING (auth.uid() = user_id);

-- Ticket automations table
CREATE TABLE ticket_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type automation_trigger NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ticket_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own automations" ON ticket_automations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users manage own automations" ON ticket_automations
  FOR ALL USING (auth.uid() = user_id);

-- Ticket activity log
CREATE TABLE ticket_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID,
  activity_type TEXT NOT NULL,
  changes JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ticket_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view activities for accessible tickets" ON ticket_activities
  FOR SELECT USING (
    ticket_id IN (
      SELECT id FROM tickets 
      WHERE user_id = auth.uid() 
        OR assignee_id = auth.uid()
        OR client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    )
  );

-- Create indexes for performance
CREATE INDEX idx_tickets_user_id ON tickets(user_id);
CREATE INDEX idx_tickets_client_id ON tickets(client_id);
CREATE INDEX idx_tickets_assignee_id ON tickets(assignee_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX idx_ticket_activities_ticket_id ON ticket_activities(ticket_id);

-- Function to generate ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  -- Get the count of existing tickets + 1
  SELECT COUNT(*) + 1 INTO counter FROM tickets;
  
  -- Format: TICKET-YYYYMMDD-NNNN
  new_number := 'TICKET-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 4, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger to set ticket number
CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_ticket_number
  BEFORE INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION set_ticket_number();

-- Trigger to calculate SLA due dates
CREATE OR REPLACE FUNCTION calculate_ticket_sla()
RETURNS TRIGGER AS $$
DECLARE
  policy RECORD;
BEGIN
  -- Get SLA policy for this priority
  SELECT * INTO policy
  FROM ticket_sla_policies
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_ticket_sla
  BEFORE INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION calculate_ticket_sla();

-- Trigger to log ticket status changes
CREATE OR REPLACE FUNCTION log_ticket_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO ticket_activities (ticket_id, user_id, activity_type, changes)
    VALUES (
      NEW.id,
      auth.uid(),
      'status_changed',
      jsonb_build_object(
        'from', OLD.status,
        'to', NEW.status
      )
    );

    -- Handle SLA pausing for "waiting_customer" status
    IF NEW.status = 'waiting_customer' AND OLD.status != 'waiting_customer' THEN
      NEW.sla_paused_at := now();
    ELSIF OLD.status = 'waiting_customer' AND NEW.status != 'waiting_customer' THEN
      -- Resume SLA and add paused duration
      IF NEW.sla_paused_at IS NOT NULL THEN
        NEW.sla_paused_duration := NEW.sla_paused_duration + EXTRACT(EPOCH FROM (now() - NEW.sla_paused_at))::INTEGER;
        NEW.sla_paused_at := NULL;
      END IF;
    END IF;

    -- Mark resolved
    IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
      NEW.resolved_at := now();
    END IF;

    -- Mark closed
    IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
      NEW.closed_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_ticket_status_change
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_ticket_status_change();

-- Trigger to set first response time
CREATE OR REPLACE FUNCTION set_first_response()
RETURNS TRIGGER AS $$
DECLARE
  ticket_record RECORD;
BEGIN
  -- Get the ticket
  SELECT * INTO ticket_record FROM tickets WHERE id = NEW.ticket_id;

  -- If this is the first non-internal message and first_response_at is not set
  IF ticket_record.first_response_at IS NULL 
     AND NEW.visibility = 'public' 
     AND NEW.user_id != ticket_record.client_id THEN
    
    UPDATE tickets
    SET first_response_at = NEW.created_at
    WHERE id = NEW.ticket_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_first_response
  AFTER INSERT ON ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_first_response();

-- Trigger to update tickets updated_at
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_teams_updated_at
  BEFORE UPDATE ON ticket_teams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_categories_updated_at
  BEFORE UPDATE ON ticket_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_sla_policies_updated_at
  BEFORE UPDATE ON ticket_sla_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_templates_updated_at
  BEFORE UPDATE ON ticket_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_automations_updated_at
  BEFORE UPDATE ON ticket_automations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();