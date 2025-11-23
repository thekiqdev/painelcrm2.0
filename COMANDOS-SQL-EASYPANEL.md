# Comandos SQL para Executar no Easypanel

## 📋 Como Executar

No console do PostgreSQL no Easypanel, você tem duas opções:

### Opção 1: Copiar e Colar (Recomendado)
Copie o conteúdo de cada script abaixo e cole diretamente no console, depois pressione Enter.

### Opção 2: Via psql (se os arquivos estiverem disponíveis)
```bash
psql -U postgres -d sistemas -f /caminho/do/arquivo.sql
```

---

## 🚀 Scripts na Ordem Correta

### 1️⃣ Script 01: Users e Auth

Copie e cole este conteúdo no console:

```sql
-- Create users table (replacing auth.users from Supabase)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  whatsapp_number TEXT,
  email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create sessions table for JWT token management
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_token ON public.sessions(token);
CREATE INDEX idx_sessions_expires_at ON public.sessions(expires_at);

-- Create profiles table (from Supabase profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  company_name TEXT,
  whatsapp_number TEXT NOT NULL,
  whatsapp_connected BOOLEAN DEFAULT false,
  registration_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_profiles table (multi-tenant profiles)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create profile_members table
CREATE TABLE IF NOT EXISTS public.profile_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, user_id)
);

-- Create registration_steps table
CREATE TABLE IF NOT EXISTS public.registration_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, step_name)
);

-- Create indexes
CREATE INDEX idx_profiles_user_id ON public.profiles(id);
CREATE INDEX idx_user_profiles_owner_id ON public.user_profiles(owner_id);
CREATE INDEX idx_profile_members_profile_id ON public.profile_members(profile_id);
CREATE INDEX idx_profile_members_user_id ON public.profile_members(user_id);
CREATE INDEX idx_registration_steps_user_id ON public.registration_steps(user_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profile_members_updated_at
  BEFORE UPDATE ON public.profile_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_registration_steps_updated_at
  BEFORE UPDATE ON public.registration_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

**✅ Após executar, você deve ver:** `CREATE TABLE` e `CREATE INDEX` várias vezes.

---

### 2️⃣ Script 02: Enums

```sql
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
```

**✅ Após executar, você deve ver:** `DO` várias vezes (sem erros).

---

### 3️⃣ Script 03: Permissions e Roles

```sql
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
```

**✅ Após executar, você deve ver:** `CREATE TABLE`, `CREATE INDEX`, `CREATE FUNCTION` e `CREATE TRIGGER`.

---

## 📝 Próximos Scripts

Para os scripts restantes (04 a 13), você pode:

1. **Abrir cada arquivo** em `database/init/` no seu editor
2. **Copiar todo o conteúdo** do arquivo
3. **Colar no console** do PostgreSQL no Easypanel
4. **Pressionar Enter** para executar

Ou me avise e eu posso fornecer o conteúdo completo de cada script aqui!

---

## ✅ Verificar se Funcionou

Após executar todos os scripts, verifique as tabelas criadas:

```sql
\dt public.*
```

Ou:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Você deve ver todas as tabelas listadas!

