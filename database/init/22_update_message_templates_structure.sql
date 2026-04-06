-- Atualizar estrutura da tabela message_templates para separar tipo e ação
-- Migration para adicionar resource_type e action separados

-- Adicionar novas colunas
ALTER TABLE public.message_templates 
  ADD COLUMN IF NOT EXISTS resource_type TEXT,
  ADD COLUMN IF NOT EXISTS action TEXT;

-- Migrar dados existentes (se houver)
-- Mapear os tipos antigos para resource_type e action
UPDATE public.message_templates
SET 
  resource_type = CASE 
    WHEN type = 'new_invoice' THEN 'invoices'
    WHEN type = 'new_ticket' THEN 'tickets'
    WHEN type = 'new_project' THEN 'projects'
    WHEN type = 'new_task' THEN 'tasks'
    WHEN type = 'contract_send' THEN 'contracts'
    WHEN type = 'contract_link' THEN 'contracts'
    ELSE 'system'
  END,
  action = CASE 
    WHEN type = 'new_invoice' THEN 'created'
    WHEN type = 'new_ticket' THEN 'created'
    WHEN type = 'new_project' THEN 'created'
    WHEN type = 'new_task' THEN 'created'
    WHEN type = 'contract_send' THEN 'sent_for_signature'
    WHEN type = 'contract_link' THEN 'signature_requested'
    ELSE 'created'
  END
WHERE resource_type IS NULL OR action IS NULL;

-- Remover constraint antiga do tipo
ALTER TABLE public.message_templates 
  DROP CONSTRAINT IF EXISTS message_templates_type_check;

-- Tornar a coluna type nullable (deprecated, mas mantida para compatibilidade)
ALTER TABLE public.message_templates 
  ALTER COLUMN type DROP NOT NULL;

-- Adicionar novas constraints
ALTER TABLE public.message_templates
  ADD CONSTRAINT message_templates_resource_type_check 
    CHECK (resource_type IN (
      'invoices', 'contracts', 'tasks', 'tickets', 'projects', 
      'project_tasks', 'leads', 'clients', 'proposals', 'expenses', 
      'funnels', 'system'
    ));

-- Criar constraint para actions (será mais flexível, validado no backend)
-- As actions válidas dependem do resource_type

-- Atualizar constraint UNIQUE para incluir resource_type e action
ALTER TABLE public.message_templates 
  DROP CONSTRAINT IF EXISTS message_templates_user_id_name_type_key;

ALTER TABLE public.message_templates
  ADD CONSTRAINT message_templates_user_id_name_resource_action_key 
    UNIQUE(user_id, name, resource_type, action);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_message_templates_resource_type 
  ON public.message_templates(resource_type);

CREATE INDEX IF NOT EXISTS idx_message_templates_action 
  ON public.message_templates(action);

CREATE INDEX IF NOT EXISTS idx_message_templates_resource_action 
  ON public.message_templates(resource_type, action);

-- Manter a coluna type por enquanto para compatibilidade (será removida depois)
-- Mas marcar como deprecated
COMMENT ON COLUMN public.message_templates.type IS 'DEPRECATED: Use resource_type e action instead';

