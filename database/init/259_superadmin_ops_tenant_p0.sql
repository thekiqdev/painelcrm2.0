-- P0/Sprint 6.5 — Tenant virtual para Kanban Operacional do Super Admin
--
-- Reuso do Kanban existente (chat_kanban_*): as tabelas têm FK tenant_id -> tenants(id).
-- Portanto criamos um tenant "sistema" (sem users) só para isolar dados operacionais do Super Admin.

DO $$
DECLARE
  v_plan_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM tenants WHERE id = '1f1a0f0a-0000-4000-8000-000000000001'::uuid) THEN
    RETURN;
  END IF;

  SELECT id INTO v_plan_id
  FROM plans
  WHERE is_active = true
  ORDER BY sort_order NULLS LAST, created_at ASC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível criar tenant superadmin ops: nenhum plano ativo encontrado em plans.';
  END IF;

  INSERT INTO tenants (id, name, slug, domain, plan_id, status)
  VALUES (
    '1f1a0f0a-0000-4000-8000-000000000001'::uuid,
    'Super Admin Ops',
    'superadmin-ops',
    NULL,
    v_plan_id,
    'active'
  );
END $$;

