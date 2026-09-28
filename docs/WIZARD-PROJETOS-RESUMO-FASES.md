# Resumo das fases — Wizard de criação de projetos

Documento de referência rápida do que foi implementado em cada fase do [PLANO-WIZARD-PROJETOS.md](./PLANO-WIZARD-PROJETOS.md).

---

## Fase 0 — Fundação (modelagem e compatibilidade)

**Objetivo:** Introduzir `project_type` e estruturas de template sem alterar o fluxo atual.

| O que foi feito |
|-----------------|
| **Migration** `44_projects_wizard_foundation.sql`: colunas em `projects` (`project_type`, `template_id`, `source_template_id`); extensão de `project_templates` (`project_type`, `slug`, `tenant_id`, `is_system`); nova tabela `project_template_areas`; placeholder para `project_template_versions`. |
| **Backend** `projectsController`: schema Zod com `project_type` e `template_id`; validação de template (existência e permissão); GET/POST/PATCH retornam novos campos; criação aceita tipo e `source_template_id` (clonagem completa na Fase 2). |
| Formulário antigo continua funcionando (POST sem `project_type` = `simple`). |

---

## Fase 1 — Wizard: estrutura e Etapa 1 (seleção de modelo)

**Objetivo:** Nova rota e layout do wizard; apenas Etapa 1 com 4 cards; estado em memória.

| O que foi feito |
|-----------------|
| **Rota** `/projects/new` → página `ProjectWizardPage` com componente `ProjectWizard`. |
| **Estado** no wizard: `step`, `projectType`, `templateId`, `basicConfig`, `specificConfig`. |
| **StepIndicator:** indicador visual das 4 etapas (step atual e concluídos). |
| **Etapa 1** `Step1SelectModel`: 4 cards (Projeto simples, Projeto com áreas, Projeto avançado, Usar template); seleção e navegação Continuar/Voltar/Cancelar. |
| Placeholders para etapas 2–4; link "Continuar com formulário clássico". |
| **Entrada:** botão "Novo Projeto" na listagem passa a levar ao wizard (padrão de criação). |

---

## Fase 2 — Etapa 2 (configurações básicas) e Etapa 4 (revisão e criação)

**Objetivo:** Formulário básico, tela de revisão e criação real pelo wizard (simple e template).

| O que foi feito |
|-----------------|
| **Migration** `45_projects_wizard_phase2.sql`: em `projects` → `client_id`, `start_date`, `end_date`, `responsible_ids`. |
| **Backend** criação em **transação**: projeto + listas padrão (simple/areas/advanced) ou clonagem de template (stages + tasks). Schema com `client_id`, `start_date`, `end_date`, `responsible_ids`. |
| **Etapa 2** `Step2BasicConfig`: nome (obrigatório), cliente, descrição, responsáveis, datas início/fim. |
| **Etapa 4** `Step4Review`: resumo (tipo, nome, cliente, datas, descrição, responsáveis); botão "Criar projeto" chama API e redireciona. |
| **Serviço** `projectsService.createProject` estendido com `project_type`, `template_id`, `client_id`, datas, `responsible_ids`. |

---

## Fase 3 — Etapa 3 (configuração específica) e templates

**Objetivo:** Etapa 3 varia por tipo; áreas iniciais; primeira versão (advanced); seleção de template.

| O que foi feito |
|-----------------|
| **Migration** `46_project_areas_and_versions.sql`: tabelas `project_areas` e `project_versions`. |
| **Backend** aceita `initial_areas`, `create_first_version`, `first_version_name`, `first_version_date`; na mesma transação cria áreas e primeira versão quando aplicável. |
| **Etapa 3 por tipo:** `Step3Simple` (nada a configurar); `Step3Areas` (criar áreas agora/depois, lista de nomes); `Step3Advanced` (áreas + primeira versão opcional); `Step3Template` (listagem de templates, preview, seleção). |
| **Revisão** passa a exibir áreas iniciais e primeira versão; payload de criação inclui `initial_areas` e dados da versão. |

---

## Fase 4 — UX, persistência temporária e validações

**Objetivo:** Refinar UX; sessionStorage para rascunho; validações inline; botão "Salvar rascunho".

| O que foi feito |
|-----------------|
| **Persistência** `wizardStorage.ts`: `saveWizardDraft`, `loadWizardDraft`, `clearWizardDraft`, `hasWizardDraft` (chave `project_wizard_draft`). |
| **Auto-save:** estado do wizard gravado no sessionStorage ao alterar (quando há dados: step > 1 ou tipo selecionado). |
| **Ao abrir o wizard:** se existir rascunho, banner "Você tem um rascunho" com botões **Continuar rascunho** e **Começar do zero**. |
| **Botão "Salvar rascunho"** na barra de ações; **"Começar do zero"** (link) limpa o rascunho e reinicia o estado. |
| **Limpeza do rascunho** após criação bem-sucedida do projeto. |
| **Validação inline** em Step2: campo nome com borda e mensagem "Nome é obrigatório" quando vazio (`showNameError`); `aria-invalid` e `aria-describedby` para acessibilidade. |
| Erros de API na Etapa 4 continuam exibidos na tela de revisão. |

---

## Fase 5 — Integração e extensibilidade

**Objetivo:** Wizard como fluxo principal; formulário clássico acessível; documentação para novos steps e tipos.

| O que foi feito |
|-----------------|
| **Ponto de entrada:** "Novo projeto" já abre o wizard (Fase 1). Na listagem, botão secundário **"Formulário clássico"** abre o dialog de criação rápida. |
| **Query `?create=classic`:** em `/projects?create=classic` a página Projetos abre o dialog do formulário clássico ao montar e remove o parâmetro da URL. O link "Continuar com formulário clássico" na etapa 1 do wizard usa essa URL. |
| **Documentação de extensibilidade:** `src/components/projects/wizard/EXTENSIBILIDADE.md` com: como adicionar novo step; como adicionar novo `project_type` (backend + frontend); estratégia de templates do sistema. |
| **Comentários no código:** referências em `types.ts` (ProjectType), `ProjectWizard.tsx` (steps), `Step3SpecificConfig.tsx` (branch por tipo), `projectsController.ts` (PROJECT_TYPES). |

---

## Ordem de execução e dependências

```
Fase 0 (backend) → Fase 1 (frontend) → Fase 2 (backend + frontend) → Fase 3 → Fase 4 → Fase 5
```

Nenhuma fase deve pular dependências. Migrations: 44 → 45 → 46 (rodar na ordem).

---

## Arquivos principais por fase

| Fase | Backend | Frontend |
|------|---------|----------|
| 0 | `database/init/44_*.sql`, `projectsController.ts` | — |
| 1 | — | `wizard/types.ts`, `StepIndicator.tsx`, `steps/Step1SelectModel.tsx`, `ProjectWizard.tsx`, `ProjectWizardPage.tsx`, rota e link em `Projects.tsx` |
| 2 | `database/init/45_*.sql`, `projectsController.ts` (transação, listas, clonagem) | `steps/Step2BasicConfig.tsx`, `Step4Review.tsx`, `projects.ts` (service) |
| 3 | `database/init/46_*.sql`, `projectsController.ts` (initial_areas, first_version) | `steps/Step3*.tsx`, `Step3SpecificConfig.tsx`, `Step4Review` (áreas/versão) |
| 4 | — | `wizardStorage.ts`, `ProjectWizard.tsx` (banner, salvar/começar do zero), `Step2BasicConfig` (showNameError) |
| 5 | — | `Projects.tsx` (useSearchParams ?create=classic, botão "Formulário clássico"), `wizard/EXTENSIBILIDADE.md`, comentários em types, ProjectWizard, Step3SpecificConfig, projectsController |
