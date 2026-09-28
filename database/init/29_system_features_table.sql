-- Etapa 6.1: Tabela de recursos do sistema (cadastro editável; plan_features usa feature_key texto)
CREATE TABLE IF NOT EXISTS public.system_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_features_key ON public.system_features(key);
CREATE INDEX IF NOT EXISTS idx_system_features_sort_order ON public.system_features(sort_order);

CREATE TRIGGER update_system_features_updated_at
  BEFORE UPDATE ON public.system_features
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.system_features IS 'Recursos do sistema editáveis pelo Super Admin (key usado em plan_features e tenant_feature_overrides)';

-- Seed com os recursos atuais (mesmos keys do código)
INSERT INTO public.system_features (key, name, description, sort_order) VALUES
  ('dashboard', 'Dashboard', 'Visão geral e indicadores', 10),
  ('leads', 'Leads', 'Gestão de leads', 20),
  ('clients', 'Clientes', 'Cadastro de clientes', 30),
  ('funnels', 'Funil de Vendas', 'Funis e estágios', 40),
  ('products', 'Produtos', 'Catálogo de produtos', 50),
  ('contracts', 'Contratos', 'Contratos e documentos', 60),
  ('projects', 'Projetos', 'Projetos e entregas', 70),
  ('tickets', 'Tickets', 'Atendimento e suporte', 80),
  ('chat', 'Chat / WhatsApp', 'Conversas e integração WhatsApp', 90),
  ('invoices', 'Faturas', 'Faturamento', 100),
  ('expenses', 'Despesas', 'Controle de despesas', 110),
  ('proposals', 'Propostas', 'Propostas comerciais', 120),
  ('tasks', 'Tarefas', 'Tarefas e checklist', 130),
  ('reports', 'Relatórios', 'Relatórios e métricas', 140),
  ('settings', 'Configurações', 'Configurações da conta', 150),
  ('message_templates', 'Modelos de mensagem', 'Templates de mensagens', 160),
  ('whatsapp', 'Integração WhatsApp', 'Conexão e configuração WhatsApp', 170)
ON CONFLICT (key) DO NOTHING;
