-- Create all enums used in the application

-- App role enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'member', 'viewer');
  END IF;
END $$;

-- Permission type enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'permission_type') THEN
    CREATE TYPE public.permission_type AS ENUM (
      'all_access',
      'manage_clients',
      'view_clients',
      'manage_leads',
      'view_leads',
      'manage_funnels',
      'view_funnels',
      'manage_settings',
      'view_reports',
      'manage_users'
    );
  END IF;
END $$;

-- Contract status enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_status') THEN
    CREATE TYPE public.contract_status AS ENUM (
      'DRAFT',
      'PENDING_SIGNATURE',
      'PARTIALLY_SIGNED',
      'ACTIVE',
      'INACTIVE',
      'EXPIRED',
      'CANCELLED'
    );
  END IF;
END $$;

-- Ticket status enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE public.ticket_status AS ENUM (
      'new',
      'open',
      'pending',
      'waiting_customer',
      'in_progress',
      'resolved',
      'closed',
      'cancelled'
    );
  END IF;
END $$;

-- Ticket priority enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority') THEN
    CREATE TYPE public.ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
  END IF;
END $$;

-- Ticket channel enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_channel') THEN
    CREATE TYPE public.ticket_channel AS ENUM ('portal', 'email', 'whatsapp', 'internal');
  END IF;
END $$;

-- Message visibility enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_visibility') THEN
    CREATE TYPE public.message_visibility AS ENUM ('public', 'internal');
  END IF;
END $$;

-- Automation trigger enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'automation_trigger') THEN
    CREATE TYPE public.automation_trigger AS ENUM (
      'on_create',
      'on_update',
      'status_change',
      'sla_overdue',
      'first_response_overdue',
      'resolution_overdue'
    );
  END IF;
END $$;


