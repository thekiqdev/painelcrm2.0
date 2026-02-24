-- Etapa 2.4: Seed de planos iniciais (Free, Pro, Enterprise)
-- Executar após 24_plans_and_plan_features.sql
-- Usa ON CONFLICT para não duplicar se rodar mais de uma vez

INSERT INTO public.plans (id, name, slug, description, price_cents, billing_interval, max_users, max_profiles, is_active, sort_order, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Free', 'free', 'Plano gratuito com recursos essenciais', 0, 'monthly', 1, 1, true, 0, now(), now()),
  (gen_random_uuid(), 'Pro', 'pro', 'Plano profissional com mais recursos', 9900, 'monthly', 5, 5, true, 1, now(), now()),
  (gen_random_uuid(), 'Enterprise', 'enterprise', 'Plano completo para grandes equipes', 29900, 'monthly', NULL, NULL, true, 2, now(), now())
ON CONFLICT (slug) DO NOTHING;

-- Inserir features para cada plano (após os planos existirem)
-- Free: apenas dashboard, leads, clients, settings
DO $$
DECLARE
  plan_rec RECORD;
  fkey TEXT;
  free_keys TEXT[] := ARRAY['dashboard', 'leads', 'clients', 'settings'];
  pro_keys TEXT[] := ARRAY['dashboard', 'leads', 'clients', 'funnels', 'products', 'contracts', 'projects', 'tickets', 'chat', 'proposals', 'tasks', 'settings', 'message_templates', 'whatsapp'];
  all_keys TEXT[] := ARRAY['dashboard', 'leads', 'clients', 'funnels', 'products', 'contracts', 'projects', 'tickets', 'chat', 'invoices', 'expenses', 'proposals', 'tasks', 'reports', 'settings', 'message_templates', 'whatsapp'];
BEGIN
  FOR plan_rec IN SELECT id, slug FROM plans LOOP
    IF plan_rec.slug = 'free' THEN
      FOREACH fkey IN ARRAY free_keys LOOP
        INSERT INTO plan_features (plan_id, feature_key, enabled, created_at, updated_at)
        VALUES (plan_rec.id, fkey, true, now(), now())
        ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = true, updated_at = now();
      END LOOP;
    ELSIF plan_rec.slug = 'pro' THEN
      FOREACH fkey IN ARRAY pro_keys LOOP
        INSERT INTO plan_features (plan_id, feature_key, enabled, created_at, updated_at)
        VALUES (plan_rec.id, fkey, true, now(), now())
        ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = true, updated_at = now();
      END LOOP;
    ELSIF plan_rec.slug = 'enterprise' THEN
      FOREACH fkey IN ARRAY all_keys LOOP
        INSERT INTO plan_features (plan_id, feature_key, enabled, created_at, updated_at)
        VALUES (plan_rec.id, fkey, true, now(), now())
        ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = true, updated_at = now();
      END LOOP;
    END IF;
  END LOOP;
END $$;
