-- Portal público: slug em tenant_support_portal_settings alinha-se ao tenants.slug (fonte de verdade).
UPDATE public.tenant_support_portal_settings s
SET slug = t.slug,
    updated_at = now()
FROM public.tenants t
WHERE t.id = s.tenant_id
  AND (s.slug IS DISTINCT FROM t.slug);
