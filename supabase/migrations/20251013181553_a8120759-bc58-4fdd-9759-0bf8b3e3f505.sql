-- Fix search_path for ticket functions

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO counter FROM tickets;
  new_number := 'TICKET-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 4, '0');
  RETURN new_number;
END;
$$;

CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION calculate_ticket_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  policy RECORD;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION log_ticket_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

CREATE OR REPLACE FUNCTION set_first_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket_record RECORD;
BEGIN
  SELECT * INTO ticket_record FROM tickets WHERE id = NEW.ticket_id;

  IF ticket_record.first_response_at IS NULL 
     AND NEW.visibility = 'public' 
     AND NEW.user_id != ticket_record.client_id THEN
    
    UPDATE tickets
    SET first_response_at = NEW.created_at
    WHERE id = NEW.ticket_id;
  END IF;

  RETURN NEW;
END;
$$;