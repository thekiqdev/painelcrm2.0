# Extensibilidade — Wizard de criação de projetos

Este documento descreve como estender o wizard com **novas etapas** e **novos tipos de projeto**. Fonte: [PLANO-WIZARD-PROJETOS.md](../../../docs/PLANO-WIZARD-PROJETOS.md) (Fase 5).

---

## 1. Adicionar um novo step (etapa)

O wizard tem 4 etapas fixas (1 = modelo, 2 = básico, 3 = específico, 4 = revisão). Para **alterar o conteúdo** de uma etapa existente, edite o componente correspondente em `steps/`.

Para **inserir uma etapa intermediária** (ex.: step 2.5), seria necessário:

1. **Tipos** (`types.ts`): alterar `step` para `1 | 2 | 3 | 4 | 5` e `WizardState.step`; adicionar label em `WIZARD_STEP_LABELS`.
2. **StepIndicator** (`StepIndicator.tsx`): incluir o novo número no array de steps e no `sr-only`.
3. **ProjectWizard** (`ProjectWizard.tsx`):
   - Adicionar um novo branch `state.step === X` que renderiza o novo componente.
   - Ajustar `handleNext` / `handleBack` para o novo total de steps.
   - Incluir validação em `canGoNext` para o novo step, se houver.
4. **Revisão (Step 4)**: se o novo step afetar o resumo, atualizar `Step4Review` e o payload em `handleCreate`.

**Onde está a decisão do step atual:**  
`ProjectWizard.tsx` — bloco `{state.step === 1 && ...}`, `{state.step === 2 && ...}`, etc.

**Validação por step:**  
`ProjectWizard.tsx` — função `canGoNext`; adicione condições para o novo step.

---

## 2. Adicionar um novo tipo de projeto (`project_type`)

### Backend

1. **Constante e schema** (`packages/backend/src/controllers/projectsController.ts`):
   - Incluir o novo valor em `PROJECT_TYPES`, ex.: `'custom'`.
   - O schema Zod usa `z.enum(PROJECT_TYPES)`; ao alterar a constante, a API passa a aceitar o novo tipo.
2. **Migration** (se o banco validar o enum):
   - `ALTER TABLE projects DROP CONSTRAINT chk_project_type;`
   - `ALTER TABLE projects ADD CONSTRAINT chk_project_type CHECK (project_type IN ('simple', 'areas', 'advanced', 'template', 'custom'));`
   - O mesmo para `project_templates` se o novo tipo puder ser usado em templates.
3. **Lógica de criação** (`createProject`):
   - Incluir um `if (projectType === 'custom')` com a criação específica (listas, áreas, etc.) dentro da mesma transação.

### Frontend

1. **Tipos** (`types.ts`):
   - Estender: `export type ProjectType = 'simple' | 'areas' | 'advanced' | 'template' | 'custom';`
2. **Etapa 1** (`steps/Step1SelectModel.tsx`):
   - Adicionar um novo objeto em `MODEL_OPTIONS` com `type: 'custom'`, `title`, `description`, `capabilities`, `icon`.
3. **Etapa 3** (`steps/Step3SpecificConfig.tsx`):
   - Incluir `if (projectType === 'custom') return <Step3Custom ... />` (criar `Step3Custom.tsx` com a configuração específica).
4. **Revisão e criação** (`Step4Review.tsx`, `ProjectWizard.tsx`):
   - Em `PROJECT_TYPE_LABELS`, adicionar `custom: 'Nome do tipo'`.
   - Em `handleCreate`, tratar `state.projectType === 'custom'` no payload se precisar enviar dados extras (ex.: `initial_areas`, etc.).

**Resumo:** Backend = `PROJECT_TYPES` + constraint + branch em `createProject`. Frontend = `ProjectType` + card em Step1 + branch em Step3 + label em Step4 + payload em `handleCreate`.

---

## 3. Templates do sistema

**Estratégia (futuro):**

- Templates com `tenant_id = null` e `is_system = true` na tabela `project_templates`.
- Listagem na Etapa 3 (tipo "template"): além dos templates do usuário (`user_id = currentUser`), incluir templates onde `is_system = true` (ex.: filtrar no backend ou em endpoint dedicado).
- Criação/edição de templates do sistema: apenas Super Admin (tela ou API restrita).

**Onde alterar hoje:**

- Backend: `getProjectTemplates` (ou equivalente) pode passar a retornar também registros com `is_system = true` para usuários autorizados.
- Frontend: `Step3Template` já lista os templates retornados pela API; quando o backend incluir templates do sistema, eles aparecerão na lista.

---

## 4. Arquivos de referência

| Objetivo              | Arquivo |
|-----------------------|--------|
| Estado e tipos do wizard | `types.ts` |
| Navegação e validação | `ProjectWizard.tsx` |
| Conteúdo por step     | `steps/Step1SelectModel.tsx`, `Step2BasicConfig.tsx`, `Step3SpecificConfig.tsx`, `Step4Review.tsx` |
| Tipos de projeto (backend) | `packages/backend/src/controllers/projectsController.ts` (`PROJECT_TYPES`, `createProject`) |
| Constraint no banco   | Migrations em `database/init/` (chk_project_type, chk_template_project_type) |
