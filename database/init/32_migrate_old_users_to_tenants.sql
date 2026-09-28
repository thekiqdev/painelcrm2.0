-- Migração: cria um tenant para cada usuário que tem user_profile (empresa) mas não tem tenant_id,
-- para que esses cadastros antigos apareçam na lista de empresas do Super Admin.

DO $$
DECLARE
  r RECORD;
  plan_uuid UUID;
  tenant_uuid UUID;
  base_slug TEXT;
  new_slug TEXT;
  suffix_val INT;
  profile_name_clean TEXT;
BEGIN
  SELECT id INTO plan_uuid FROM public.plans WHERE is_active = true ORDER BY sort_order ASC, name ASC LIMIT 1;
  IF plan_uuid IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT DISTINCT ON (u.id) u.id AS user_id,
      COALESCE(NULLIF(TRIM(up.name), ''), 'Empresa') AS profile_name
    FROM public.users u
    INNER JOIN public.user_profiles up ON up.owner_id = u.id
    WHERE u.tenant_id IS NULL
      AND (u.is_super_admin IS FALSE OR u.is_super_admin IS NULL)
    ORDER BY u.id, up.is_admin DESC NULLS LAST, up.created_at ASC
  LOOP
    profile_name_clean := lower(regexp_replace(r.profile_name, '[^a-zA-Z0-9\s-]', '', 'g'));
    profile_name_clean := regexp_replace(trim(regexp_replace(profile_name_clean, '\s+', '-', 'g')), '-+', '-', 'g');
    profile_name_clean := trim(both '-' from profile_name_clean);
    IF profile_name_clean = '' THEN
      profile_name_clean := 'empresa';
    END IF;

    base_slug := profile_name_clean;
    new_slug := base_slug;
    suffix_val := 0;
    WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = new_slug) LOOP
      suffix_val := suffix_val + 1;
      new_slug := base_slug || '-' || suffix_val;
    END LOOP;

    INSERT INTO public.tenants (name, slug, domain, plan_id, status, trial_ends_at, created_via)
    VALUES (r.profile_name, new_slug, NULL, plan_uuid, 'active', NULL, 'superadmin')
    RETURNING id INTO tenant_uuid;

    UPDATE public.users SET tenant_id = tenant_uuid, updated_at = now() WHERE id = r.user_id;

    INSERT INTO public.tenant_plan (tenant_id, plan_id, starts_at)
    VALUES (tenant_uuid, plan_uuid, now());
  END LOOP;
END $$;
