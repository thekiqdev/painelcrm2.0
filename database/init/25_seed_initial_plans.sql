-- Etapa 2.4: Estrutura de planos (sem seed automático).
-- Planos são criados pelo Super Admin; migração não insere mais Free/Pro/Enterprise
-- para evitar duplicação e permitir gerenciamento apenas via painel.

-- Inserir features para planos existentes (apenas se plan_features estiver vazio)
DO $$
DECLARE
  plan_rec RECORD;
  fkey TEXT;
  free_keys TEXT[] := ARRAY['dashboard', 'leads', 'clients', 'settings'];
  pro_keys TEXT[] := ARRAY['dashboard', 'leads', 'clients', 'funnels', 'products', 'contracts', 'projects', 'tickets', 'chat', 'proposals', 'tasks', 'settings', 'message_templates', 'whatsapp'];
  all_keys TEXT[] := ARRAY['dashboard', 'leads', 'clients', 'funnels', 'products', 'contracts', 'projects', 'tickets', 'chat', 'invoices', 'expenses', 'proposals', 'tasks', 'reports', 'settings', 'message_templates', 'whatsapp'];
  has_features BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM plan_features LIMIT 1) INTO has_features;
  IF has_features THEN
    RETURN;
  END IF;
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
