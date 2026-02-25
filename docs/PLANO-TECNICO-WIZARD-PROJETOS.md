# Plano técnico operacional — Wizard multi-etapas de criação de projetos

**Fonte de verdade:** [PLANO-WIZARD-PROJETOS.md](./PLANO-WIZARD-PROJETOS.md)

**Objetivo:** Documento de arquitetura e execução para implantar o wizard fase a fase, sem quebrar a criação atual de projetos.

---

## 1️⃣ Roadmap técnico resumido

### Lista das fases e dependências

| Fase | Nome | Depende de | Escopo principal |
|------|------|------------|------------------|
| **0** | Fundação (modelagem e compatibilidade) | — | DB: project_type, template_id, source_template_id; tabelas templates/áreas; API aceita novos campos |
| **1** | Wizard estrutura + Etapa 1 | Fase 0 | Rota wizard, estado, 4 cards seleção de modelo, navegação |
| **2** | Etapa 2 + Etapa 4 + criação | Fase 0, 1 | Formulário básico, revisão, POST com tipo/template; clonagem; transação |
| **3** | Etapa 3 + áreas/versão/template | Fase 0, 1, 2 | Config específica por tipo; initial_areas; primeira versão; listagem templates |
| **4** | UX, persistência, validações | Fase 1–3 | sessionStorage, validações por etapa, rascunho, acessibilidade |
| **5** | Integração e extensibilidade | Fase 1–4 | "Novo projeto" → wizard; doc extensão; opcional formulário clássico |

**Ordem estrita:** 0 → 1 → 2 → 3 → 4 → 5. Nenhuma fase pode pular dependências.

### Ordem ideal Backend vs Frontend

| Fase | Backend primeiro? | Frontend primeiro? | Nota |
|------|-------------------|-------------------|------|
| **0** | Sim | — | Só backend (migrations + API). Frontend não alterado. |
| **1** | Não | Sim | Só frontend (rota, wizard, Etapa 1). API já aceita project_type. |
| **2** | Sim (paralelo possível) | Sim | Backend: criação condicional + clonagem. Frontend: Etapa 2 e 4. Podem evoluir em paralelo após contrato da API. |
| **3** | Sim (paralelo possível) | Sim | Backend: initial_areas, primeira versão. Frontend: Etapa 3 por tipo. |
| **4** | Opcional (rascunho) | Sim | Foco frontend (sessionStorage, validações, UX). |
| **5** | Não | Sim | Só frontend (ponto de entrada, doc). |

**Recomendação por fase:**  
- **Fase 0:** 100% backend.  
- **Fase 1:** 100% frontend.  
- **Fases 2 e 3:** definir contrato da API (payload POST) no início; implementar backend e frontend em paralelo ou backend ligeiramente antes.  
- **Fase 4:** frontend; backend só se “salvar rascunho” for persistido em DB.  
- **Fase 5:** frontend + documentação.

---

## 2️⃣ Arquitetura proposta

### 2.1 Estrutura de pastas frontend (wizard)

```
src/
├── components/
│   └── projects/
│       ├── NewProjectDialog.tsx          # Mantido até Fase 5 (formulário clássico)
│       ├── wizard/                        # NOVO: módulo do wizard
│       │   ├── ProjectWizard.tsx          # Container: steps, estado, navegação
│       │   ├── ProjectWizardContext.tsx   # (opcional) Context do estado do wizard
│       │   ├── steps/
│       │   │   ├── StepIndicator.tsx     # Indicador 1 de 4, 2 de 4...
│       │   │   ├── Step1SelectModel.tsx   # Etapa 1: 4 cards
│       │   │   ├── Step2BasicConfig.tsx   # Etapa 2: nome, cliente, descrição, responsáveis, datas
│       │   │   ├── Step3SpecificConfig.tsx# Etapa 3: varia por tipo (áreas, versão, template)
│       │   │   └── Step4Review.tsx        # Etapa 4: resumo + Criar projeto
│       │   ├── steps/step3/              # (opcional) Subcomponentes da Etapa 3
│       │   │   ├── Step3Simple.tsx
│       │   │   ├── Step3Areas.tsx
│       │   │   ├── Step3Advanced.tsx
│       │   │   └── Step3Template.tsx
│       │   └── types.ts                  # WizardState, ProjectType, etc.
│       └── ...
├── pages/ ou routes/                     # Conforme estrutura do projeto
│   └── (rota /projects/new ou /projects/create → ProjectWizard)
```

- **Container único:** `ProjectWizard` controla `step`, lê/grava estado (state ou Context) e renderiza o step atual.
- **Um componente por etapa:** Step1, Step2, Step3, Step4; Step3 pode delegar a subcomponentes por `projectType`.
- **Extensibilidade:** adicionar novo step = novo componente + entrada no array de steps + validação opcional.

### 2.2 Estrutura backend (suporte aos tipos)

```
packages/backend/src/
├── controllers/
│   ├── projectsController.ts    # Estender: createProject com project_type, template_id, clonagem
│   └── projectTemplatesController.ts  # Estender: project_type, tenant_id, is_system; listagem para wizard
├── services/                    # (opcional) Extrair lógica pesada
│   ├── projectCreateService.ts # createFromScratch, createFromTemplate, createWithAreas
│   └── projectTemplateCloneService.ts
├── routes/
│   ├── projectsRoutes.ts       # POST / mantido; aceita novos campos
│   └── projectTemplatesRoutes.ts
├── utils/
│   └── db.js                   # pool para transações
```

- **Transação:** criação de projeto (e listas/áreas/versão/template clone) em uma única transação; rollback em erro.
- **Validação por tipo:** schema Zod (ou equivalente) com `.refine()` para: se `project_type === 'template'` então `template_id` obrigatório; senão `template_id` null.
- **Extensibilidade:** novo tipo = novo branch no createProject + possível novo método em service; enum/const centralizado (ex.: `PROJECT_TYPES`).

### 2.3 Estado global do wizard

- **Onde:** estado em React (useState no `ProjectWizard`) ou Context (`ProjectWizardContext`) para evitar prop drilling.
- **Forma sugerida:**

```ts
interface WizardState {
  step: 1 | 2 | 3 | 4;
  projectType: 'simple' | 'areas' | 'advanced' | 'template' | null;
  templateId: string | null;
  basicConfig: {
    name: string;
    clientId: string | null;
    description: string;
    responsibleIds: string[];
    startDate: string | null;
    endDate: string | null;
  };
  specificConfig: {
    areas?: string[];
    createFirstVersion?: boolean;
    firstVersionName?: string;
    firstVersionDate?: string | null;
  };
}
```

- **Inicial:** step 1, projectType null, templateId null, basicConfig vazio, specificConfig vazio.
- **Persistência temporária (Fase 4):** ao mudar etapa/dados, gravar em `sessionStorage` sob chave `project_wizard_draft`; ao montar, ler e oferecer “Continuar rascunho” ou “Começar do zero”.
- **Extensibilidade:** novos campos em `basicConfig` ou `specificConfig` sem quebrar steps existentes.

### 2.4 Estratégia de clonagem de template

- **Quando:** `POST /api/projects` com `project_type: 'template'` e `template_id` preenchido.
- **Fluxo:**
  1. Validar tenant/user e permissão; carregar template (e áreas, stages, tasks do template).
  2. Iniciar transação.
  3. Inserir projeto com nome/descrição do body (ou do template), `project_type = 'template'`, `source_template_id = template_id`, `template_id = null` (ou conforme regra de negócio).
  4. Clonar `project_template_areas` → tabela de áreas do projeto (ex.: `project_areas`), se existir e template tiver áreas.
  5. Clonar `project_template_stages` → `project_lists` (listas/etapas do Kanban).
  6. Clonar `project_template_tasks` → `project_tasks` (mapeando stage_id antigo → list_id novo).
  7. Commit; em caso de erro, rollback.
- **Templates apenas estrutura:** não copiar lógica de negócio (ex.: regras, integrações); apenas estrutura (áreas, listas, tarefas modelo).
- **Futuro:** `project_template_versions` (Fase 3+) para clonar primeira versão em projeto avançado.

---

## 3️⃣ Impactos na modelagem

### 3.1 Tabela `projects` (alterações)

| Campo | Tipo | Nullable | Descrição |
|-------|------|----------|-----------|
| `project_type` | TEXT | NOT NULL | Valores: `'simple'`, `'areas'`, `'advanced'`, `'template'`. Default `'simple'`. |
| `template_id` | UUID | NULL | FK → `project_templates.id`. Preenchido apenas quando origem for template (auditoria de “qual template usei” pode ser só `source_template_id`). Plano: “template_id” na criação; após criar, projeto guarda `source_template_id`. |
| `source_template_id` | UUID | NULL | FK → `project_templates.id`. Preenchido quando o projeto foi criado a partir de um template. |

**Constraint sugerida:**  
- `CHECK (project_type IN ('simple','areas','advanced','template'))`.  
- Se desejado: “se project_type = 'template' então source_template_id NOT NULL” (aplicado após criação); durante criação quem vem na request é `template_id`.

**Migração:**  
- ADD COLUMN `project_type` DEFAULT `'simple'`.  
- ADD COLUMN `template_id` NULL (sem FK primeiro se preferir, depois ALTER para FK).  
- ADD COLUMN `source_template_id` NULL, FK → `project_templates(id)`.  
- UPDATE projetos existentes SET `project_type = 'simple'`.

### 3.2 Tabela `project_templates` (já existe — estender)

**Estrutura atual (resumo):** id, user_id, name, description, tags, created_at, updated_at.

**Colunas novas:**

| Campo | Tipo | Nullable | Descrição |
|-------|------|----------|-----------|
| `project_type` | TEXT | NOT NULL | `'simple'`, `'areas'`, `'advanced'`. Default `'simple'`. |
| `slug` | TEXT | NULL | Único por tenant/user para URLs/identificação. |
| `tenant_id` | UUID | NULL | FK → tenants(id). NULL = template do sistema; preenchido = template do tenant. |
| `is_system` | BOOLEAN | NOT NULL | Default false. true = template do sistema (Super Admin). |

**Constraint:**  
- `CHECK (project_type IN ('simple','areas','advanced'))`.  
- Índice UNIQUE (tenant_id, slug) onde tenant_id IS NOT NULL; para sistema (tenant_id NULL), slug único global ou por is_system.

**Compatibilidade:** templates existentes recebem `project_type = 'simple'`, `slug = null` ou gerado, `tenant_id = (tenant do user_id se existir)`, `is_system = false`.

### 3.3 Nova tabela `project_template_areas`

| Campo | Tipo | Nullable | Descrição |
|-------|------|----------|-----------|
| id | UUID | PK | gen_random_uuid(). |
| template_id | UUID | NOT NULL | FK → project_templates(id) ON DELETE CASCADE. |
| name | TEXT | NOT NULL | Nome da área. |
| sort_order | INTEGER | NOT NULL | Ordem de exibição. Default 0. |

Índice: `idx_project_template_areas_template_id` em `template_id`.

### 3.4 Tabela `project_template_versions` (futuro)

- Reservar nome; não criar na Fase 0. Documentar: “Para projeto avançado: versões/releases; implementação em fase posterior”.
- Quando existir: FK para `project_templates(id)`; campos como name, release_date, status.

### 3.5 Relacionamentos

- `projects.source_template_id` → `project_templates.id`.
- `projects.template_id`: plano usa para “qual template usei na criação”; pode ser só na request e persistir apenas `source_template_id` no projeto. Decisão: manter coluna `template_id` em projects só se houver uso (ex.: “editar como template”); caso contrário, só `source_template_id`.
- `project_templates.tenant_id` → `tenants.id` (opcional; aplicável se multi-tenant).
- `project_template_areas.template_id` → `project_templates.id`.

### 3.6 Tabela de áreas do projeto (para tipos areas/advanced)

Se ainda não existir no produto, será necessária para Fase 2/3:

- **project_areas:** id, project_id (FK projects), name, sort_order, created_at, updated_at.  
Criar na Fase 2 ou 3 quando for implementar `initial_areas`. Fase 0 pode apenas documentar.

---

## 4️⃣ Estratégia de compatibilidade

### 4.1 Manter criação atual funcionando

- **Formulário atual:** `NewProjectDialog` continua chamando `POST /api/projects` com os campos atuais (name, description, due_date, tags, kanban_stage, etc.).
- **Backend:**  
  - Sempre aceitar body sem `project_type` e sem `template_id`.  
  - Se `project_type` ausente → tratar como `'simple'`.  
  - Se `template_id` ausente → null.  
  - Inserir projeto com os mesmos campos de sempre + `project_type = 'simple'` (ou o enviado), `source_template_id = null`.  
- Assim, o fluxo antigo não envia `project_type` e continua funcionando igual.

### 4.2 Feature flag ou coexistência

- **Até Fase 5:** não é obrigatório feature flag. Dois fluxos coexistem:  
  - Botão “Novo projeto” pode continuar abrindo `NewProjectDialog` (formulário clássico).  
  - Link/rota “Criar projeto (wizard)” leva a `/projects/new` com o wizard.
- **Fase 5:** trocar o ponto de entrada principal para o wizard (`/projects/new`); opcional manter link “Formulário clássico” que abre o dialog com `project_type=simple` implícito.
- **Feature flag (opcional):** se quiser, ex.: `USE_PROJECT_WIZARD`: true → “Novo projeto” abre wizard; false → abre dialog. Configurável por tenant ou global.

### 4.3 Migração segura

- **Migrations:**  
  - Adicionar colunas novas com DEFAULT e NULL onde aplicável.  
  - Não remover colunas antigas.  
  - Projetos existentes: UPDATE SET project_type = 'simple', source_template_id = null.
- **API:**  
  - Não remover campos atuais do POST.  
  - Apenas adicionar campos opcionais e lógica condicional (por project_type e template_id).  
- **Frontend:**  
  - Não remover `NewProjectDialog` até Fase 5; na Fase 5, apenas trocar o ponto de entrada e, se desejado, esconder o link clássico.

---

## 5️⃣ Plano de execução da Fase 0 (passo a passo técnico)

Objetivo da Fase 0: introduzir `project_type`, `template_id`, `source_template_id` em `projects`; estender `project_templates`; criar `project_template_areas`; API aceitar e persistir novos campos sem alterar comportamento do formulário atual.

### Passo 5.1 — Migration: tabela `projects`

1. Criar arquivo de migration (ex.: `database/init/XX_projects_wizard_foundation.sql` ou em `supabase/migrations/` conforme padrão do projeto).
2. Conteúdo:
   - `ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'simple';`
   - `ALTER TABLE projects ADD COLUMN IF NOT EXISTS template_id UUID NULL REFERENCES project_templates(id) ON DELETE SET NULL;` (ou sem FK inicial se project_templates ainda for alterada na mesma migration)
   - `ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_template_id UUID NULL REFERENCES project_templates(id) ON DELETE SET NULL;`
   - `ALTER TABLE projects ADD CONSTRAINT chk_project_type CHECK (project_type IN ('simple','areas','advanced','template'));`
   - Comentários: `COMMENT ON COLUMN projects.project_type IS '...';` (e idem para template_id, source_template_id)
3. Garantir que projetos existentes fiquem com `project_type = 'simple'` (já garantido pelo DEFAULT).
4. Executar a migration no ambiente de desenvolvimento e validar.

### Passo 5.2 — Migration: tabela `project_templates`

1. No mesmo arquivo ou em outro:
   - `ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'simple';`
   - `ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS slug TEXT NULL;`
   - `ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES tenants(id) ON DELETE SET NULL;` (se existir tabela `tenants`)
   - `ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;`
   - `ALTER TABLE project_templates ADD CONSTRAINT chk_template_project_type CHECK (project_type IN ('simple','areas','advanced'));`
   - Comentários para cada coluna nova.
2. Executar e validar.

### Passo 5.3 — Migration: tabela `project_template_areas`

1. Criar tabela:
   - `CREATE TABLE IF NOT EXISTS project_template_areas ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), template_id UUID NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0 );`
   - `CREATE INDEX idx_project_template_areas_template_id ON project_template_areas(template_id);`
   - Trigger `updated_at` se a tabela tiver `updated_at`; senão, sem trigger.
2. Executar e validar.

### Passo 5.4 — Migration: placeholder `project_template_versions`

1. Adicionar comentário ou arquivo de documentação: “Tabela project_template_versions será criada em fase posterior para versões/releases de projeto avançado.”
2. Opcional: criar tabela vazia com estrutura mínima (id, template_id, name, ...) só para reservar nome; caso contrário, apenas documentar.

### Passo 5.5 — Backend: schema de validação (projects)

1. No controller de projetos (ex.: `projectsController.ts`), estender o schema Zod do POST:
   - `project_type`: z.enum(['simple','areas','advanced','template']).optional().default('simple').
   - `template_id`: z.string().uuid().optional().nullable().
   - Manter todos os campos atuais (name, description, status, due_date, tags, kanban_stage).
2. Regra de refinamento: se `project_type === 'template'`, então `template_id` deve estar preenchido; senão, `template_id` deve ser null/undefined (para não gravar template_id em projetos não-template).

### Passo 5.6 — Backend: INSERT em `projects`

1. No `createProject`, incluir na lista de colunas e valores:
   - `project_type` (validated.project_type ou 'simple'),
   - `template_id`: null no INSERT (uso na criação é apenas para clonagem; o projeto criado guarda origem em source_template_id),
   - `source_template_id`: preenchido apenas quando a criação for por clonagem de template (Fase 2); na Fase 0 pode ser sempre null.
2. SELECT/GET de projetos: incluir `project_type`, `template_id`, `source_template_id` no retorno para que o frontend possa exibir no futuro.

### Passo 5.7 — Backend: validação de template (quando template_id enviado)

1. Se `req.body.template_id` for enviado:
   - Buscar template por id; validar que pertence ao usuário (ou ao tenant do usuário) ou que é template do sistema (is_system = true).
   - Se não existir ou não permitido → 400.
2. Na Fase 0, ainda não implementar clonagem; apenas validar e, se quiser, criar o projeto com nome/descrição do body e `source_template_id = template_id` (projeto “vazio” a partir de template). Ou deixar a clonagem completa para a Fase 2 e na Fase 0 retornar 501 “Clonagem será implementada na Fase 2” quando template_id for enviado. **Recomendação:** na Fase 0, aceitar e persistir `project_type` e `template_id`/`source_template_id`; se `project_type === 'template'` e `template_id` presente, criar projeto com dados básicos do body e `source_template_id = template_id`, sem clonar estrutura (clonagem na Fase 2).

### Passo 5.8 — Documentação

1. Atualizar ou criar seção “Modelagem” no plano (PLANO-WIZARD-PROJETOS.md ou este doc) com:
   - Tabelas alteradas/criadas,
   - Constraints e relacionamentos,
   - Decisão de Fase 0 para criação com template (apenas source_template_id, sem clonagem ainda).
2. Registrar no changelog ou doc de versão que a Fase 0 foi concluída.

### Passo 5.9 — Testes manuais

1. Criar projeto pelo formulário atual (sem enviar project_type): deve criar com project_type = 'simple'.
2. Se houver cliente HTTP (Postman/Insomnia), POST com project_type = 'simple' e project_type = 'areas': deve persistir e retornar os novos campos.
3. (Opcional) POST com project_type = 'template' e template_id válido: deve criar projeto com source_template_id preenchido (e sem clonagem ainda).

### Checklist Fase 0

- [x] Migration projects: project_type, template_id, source_template_id; constraint; default para existentes.
- [x] Migration project_templates: project_type, slug, tenant_id, is_system; constraint.
- [x] Migration project_template_areas: tabela criada; FK e índice.
- [x] Placeholder/documentação project_template_versions.
- [x] projectsController: schema estendido; INSERT com novos campos; GET/PATCH retornam novos campos.
- [x] Validação de template_id quando enviado (existência e permissão user_id ou is_system).
- [x] Comportamento do formulário atual inalterado (POST sem project_type continua como simple).
- [x] Documentação atualizada.

---

**Fase 0 concluída.** Alterações: `database/init/44_projects_wizard_foundation.sql`, `packages/backend/src/controllers/projectsController.ts`. Clonagem completa de template fica para Fase 2; nesta fase apenas `source_template_id` é preenchido ao criar com `project_type: 'template'` e `template_id` válido.

**Fase 1 concluída.** Rota `/projects/new`, página `ProjectWizardPage`, componente `ProjectWizard` com estado local; `StepIndicator`; Etapa 1 com 4 cards (`Step1SelectModel`); placeholders para etapas 2–4; link "Continuar com formulário clássico" na etapa 1. Arquivos: `src/components/projects/wizard/` (types, StepIndicator, steps/Step1SelectModel, ProjectWizard), `src/pages/ProjectWizardPage.tsx`, rota em `App.tsx`. Botão principal "Novo Projeto" direciona para o assistente (wizard).

**Fase 2 concluída.** Etapa 2: formulário `Step2BasicConfig` (nome, cliente, descrição, responsáveis, datas); Etapa 4: `Step4Review` (resumo) e botão "Criar projeto" com chamada à API. Backend: migration `45_projects_wizard_phase2.sql` (client_id, start_date, end_date, responsible_ids); criação em transação com listas padrão para tipo simple e clonagem de template (stages + tasks) para tipo template. Serviço frontend estendido com project_type, template_id, client_id, start_date, end_date, responsible_ids.

**Fase 3 concluída.** Etapa 3 por tipo: `Step3Simple` (nada a configurar), `Step3Areas` (criar áreas agora/depois, lista de nomes), `Step3Advanced` (áreas + primeira versão opcional com nome e data), `Step3Template` (listagem de templates, preview, seleção). Backend: migration `46_project_areas_and_versions.sql` (project_areas, project_versions); API aceita initial_areas, create_first_version, first_version_name, first_version_date; criação de áreas e primeira versão na mesma transação. Revisão (Step4) exibe áreas e primeira versão; payload de criação inclui initial_areas e dados da versão.

**Fase 4 concluída.** Persistência em sessionStorage (`wizardStorage.ts`: save/load/clear draft); banner ao abrir wizard quando há rascunho ("Continuar rascunho" / "Começar do zero"); auto-save do estado ao alterar; botão "Salvar rascunho" e link "Começar do zero"; limpeza do rascunho após criar projeto. Validação inline no Step2 (nome obrigatório com mensagem e aria-invalid). Resumo das fases em `docs/WIZARD-PROJETOS-RESUMO-FASES.md`.

**Fase 5 concluída.** Formulário clássico: página Projetos abre o dialog quando URL tem `?create=classic`; botão "Formulário clássico" na listagem abre o dialog diretamente. Documentação de extensibilidade em `src/components/projects/wizard/EXTENSIBILIDADE.md` (novo step, novo project_type, templates do sistema). Comentários no código em `types.ts`, `ProjectWizard.tsx`, `Step3SpecificConfig.tsx`, `projectsController.ts`.
