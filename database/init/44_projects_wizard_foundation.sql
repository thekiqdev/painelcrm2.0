-- Fase 0 — Wizard de projetos: fundação (project_type, templates, template_areas)
-- Permite criação por tipo (simple, areas, advanced, template) e origem por template.
-- Criação atual continua funcionando com project_type = 'simple'.

-- ========== 1. Tabela project_templates (estender) ==========
ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS slug TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

-- tenant_id: NULL = template do sistema; preenchido = template do tenant (tenants existe em 26)
ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES public.tenants(id) ON DELETE SET NULL;

ALTER TABLE public.project_templates
  DROP CONSTRAINT IF EXISTS chk_template_project_type;
ALTER TABLE public.project_templates
  ADD CONSTRAINT chk_template_project_type CHECK (project_type IN ('simple', 'areas', 'advanced'));

COMMENT ON COLUMN public.project_templates.project_type IS 'Tipo de projeto do template: simple, areas, advanced';
COMMENT ON COLUMN public.project_templates.slug IS 'Slug único por tenant para URLs';
COMMENT ON COLUMN public.project_templates.tenant_id IS 'NULL = template do sistema; preenchido = template do tenant';
COMMENT ON COLUMN public.project_templates.is_system IS 'true = template do sistema (Super Admin)';

-- ========== 2. Tabela project_template_areas (nova) ==========
CREATE TABLE IF NOT EXISTS public.project_template_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_project_template_areas_template_id ON public.project_template_areas(template_id);
COMMENT ON TABLE public.project_template_areas IS 'Áreas do template (para tipos areas/advanced)';

-- ========== 3. Tabela projects (novos campos) ==========
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS template_id UUID NULL REFERENCES public.project_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_template_id UUID NULL REFERENCES public.project_templates(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS chk_project_type;
ALTER TABLE public.projects
  ADD CONSTRAINT chk_project_type CHECK (project_type IN ('simple', 'areas', 'advanced', 'template'));

COMMENT ON COLUMN public.projects.project_type IS 'Tipo do projeto: simple, areas, advanced, template';
COMMENT ON COLUMN public.projects.template_id IS 'Template usado na criação (opcional; auditoria)';
COMMENT ON COLUMN public.projects.source_template_id IS 'Template do qual o projeto foi criado (clonagem)';

-- Garantir projetos existentes com tipo default
UPDATE public.projects SET project_type = 'simple' WHERE project_type IS NULL;

-- ========== 4. Placeholder project_template_versions (futuro) ==========
-- Tabela project_template_versions será criada em fase posterior para versões/releases de projeto avançado.
-- Não criar tabela aqui; apenas documentar.
