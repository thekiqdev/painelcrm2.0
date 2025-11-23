-- Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  profile_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id),
  UNIQUE(user_id, profile_id, role)
);

-- Create user_permissions table
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  permission public.permission_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES public.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, profile_id, permission)
);

-- Create indexes
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_profile_id ON public.user_roles(profile_id);
CREATE INDEX idx_user_permissions_user_id ON public.user_permissions(user_id);
CREATE INDEX idx_user_permissions_profile_id ON public.user_permissions(profile_id);

-- Create helper functions for permissions and roles
CREATE OR REPLACE FUNCTION public.has_role(
  _user_id UUID,
  _role public.app_role,
  _profile_id UUID DEFAULT NULL
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

CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id UUID,
  _profile_id UUID,
  _permission public.permission_type
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Check if user is profile owner (owners have all permissions)
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = _profile_id AND owner_id = _user_id
  )
  OR EXISTS (
    -- Check if user has all_access permission
    SELECT 1 FROM public.user_permissions
    WHERE user_id = _user_id
    AND profile_id = _profile_id
    AND permission = 'all_access'
  )
  OR EXISTS (
    -- Check if user has specific permission
    SELECT 1 FROM public.user_permissions
    WHERE user_id = _user_id
    AND profile_id = _profile_id
    AND permission = _permission
  );
$$;

CREATE OR REPLACE FUNCTION public.is_profile_member(
  _profile_id UUID,
  _user_id UUID
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

CREATE TRIGGER update_user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


