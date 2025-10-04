-- SECURITY FIX: Critical vulnerabilities in RLS policies
-- Part 1: Remove public access and fix recursion issues

-- Drop ALL existing policies on affected tables to start fresh
DO $$ 
DECLARE
  r RECORD;
BEGIN
  -- Drop all policies on clients
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clients'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clients CASCADE', r.policyname);
  END LOOP;
  
  -- Drop all policies on leads
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.leads CASCADE', r.policyname);
  END LOOP;
  
  -- Drop all policies on profile_members
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profile_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profile_members CASCADE', r.policyname);
  END LOOP;
END $$;

-- Drop and recreate is_profile_member function with CASCADE
DROP FUNCTION IF EXISTS public.is_profile_member(bigint, bigint) CASCADE;
DROP FUNCTION IF EXISTS public.is_profile_member(uuid, uuid) CASCADE;

-- Create secure is_profile_member function
CREATE FUNCTION public.is_profile_member(
  _profile_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_members
    WHERE profile_id = _profile_id AND user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = _profile_id AND owner_id = _user_id
  );
$$;

-- Profile members policies (no recursion)
CREATE POLICY "Profile owners view members"
ON public.profile_members FOR SELECT
USING (profile_id IN (SELECT id FROM public.user_profiles WHERE owner_id = auth.uid()));

CREATE POLICY "Profile owners manage members"
ON public.profile_members FOR ALL
USING (profile_id IN (SELECT id FROM public.user_profiles WHERE owner_id = auth.uid()));

-- Clients policies (NO PUBLIC ACCESS)
CREATE POLICY "Users view own clients"
ON public.clients FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own clients"
ON public.clients FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own clients"
ON public.clients FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own clients"
ON public.clients FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Profile members view clients"
ON public.clients FOR SELECT
USING (
  (profile_id IS NOT NULL) 
  AND public.is_profile_member(profile_id)
  AND public.has_permission(profile_id, 'view_clients'::permission_type)
);

CREATE POLICY "Profile members manage clients"
ON public.clients FOR ALL
USING (
  (profile_id IS NOT NULL)
  AND public.is_profile_member(profile_id)
  AND public.has_permission(profile_id, 'manage_clients'::permission_type)
);

-- Leads policies (NO PUBLIC ACCESS)
CREATE POLICY "Users view own leads"
ON public.leads FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own leads"
ON public.leads FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own leads"
ON public.leads FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own leads"
ON public.leads FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Profile members view leads"
ON public.leads FOR SELECT
USING (
  (profile_id IS NOT NULL)
  AND public.is_profile_member(profile_id)
  AND public.has_permission(profile_id, 'view_leads'::permission_type)
);

CREATE POLICY "Profile members manage leads"
ON public.leads FOR ALL
USING (
  (profile_id IS NOT NULL)
  AND public.is_profile_member(profile_id)
  AND public.has_permission(profile_id, 'manage_leads'::permission_type)
);

-- Add search_path to functions
ALTER FUNCTION public.get_conversation_status SET search_path = public;
ALTER FUNCTION public.get_all_conversation_statuses SET search_path = public;
ALTER FUNCTION public.upsert_conversation_status SET search_path = public;
ALTER FUNCTION public.create_profile_for_new_user SET search_path = public;
ALTER FUNCTION public.update_updated_at_column SET search_path = public;

-- Create roles system
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'member', 'viewer');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  profile_id uuid REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(user_id, profile_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create has_role function
CREATE OR REPLACE FUNCTION public.has_role(
  _user_id uuid,
  _role app_role,
  _profile_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role = _role
    AND (_profile_id IS NULL OR profile_id = _profile_id)
  );
$$;

-- RLS for user_roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_roles' 
    AND policyname = 'Users view own roles'
  ) THEN
    CREATE POLICY "Users view own roles"
    ON public.user_roles FOR SELECT
    USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_roles' 
    AND policyname = 'Profile owners manage roles'
  ) THEN
    CREATE POLICY "Profile owners manage roles"
    ON public.user_roles FOR ALL
    USING (profile_id IN (SELECT id FROM public.user_profiles WHERE owner_id = auth.uid()));
  END IF;
END $$;

-- Migrate is_admin to roles
INSERT INTO public.user_roles (user_id, role, profile_id, created_by)
SELECT owner_id, 'admin'::app_role, id, owner_id
FROM public.user_profiles
WHERE is_admin = true
ON CONFLICT DO NOTHING;