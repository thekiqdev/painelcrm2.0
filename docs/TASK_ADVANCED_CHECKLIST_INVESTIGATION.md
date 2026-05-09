# Investigação — Configurações avançadas e checklist (projeto vs tarefa avulsa)

**Data:** 2026-05-08  
**Escopo:** mapeamento apenas (sem implementação neste documento).

---

## 1. Onde vive a UI de “Configurações avançadas” (projeto)

| Item | Detalhe |
|------|---------|
| **Componente principal** | `src/components/tasks/TaskAdvancedFields.tsx` |
| **Estado React** | Valor controlado `TaskAdvancedFormValue` (`value` / `onChange`), mais estado local `newChecklistItem` para o input de novo item |
| **Conversão para API** | `formValueToApiPayload(v)` no mesmo arquivo → objeto `snake_case` |
| **Uso na criação de projeto** | `src/components/tasks/TaskFormDialog.tsx`: accordion “Configurações avançadas (projeto)” + merge com campos básicos; chama `projectsService.createProjectTask` |
| **Legado** | `src/components/projects/NewTaskDialog.tsx` ainda existe no repo; fluxo antigo em `Projects` foi trocado por `TaskFormDialog`, mas o padrão de campos avançados é o mesmo `TaskAdvancedFields` |
| **Endpoint criação** | `POST /api/projects/lists/:listId/tasks` |
| **Endpoint atualização** | `PATCH /api/projects/tasks/:taskId` |
| **Endpoint leitura** | `GET /api/projects/lists/:listId/tasks`, `GET /api/projects/tasks/:taskId`, `GET /api/projects/:projectId/areas/:areaId/tasks` |
| **Tabela** | `public.project_tasks` |

### Campos exibidos na UI (`TaskAdvancedFields`)

- **Datas e tempo:** `startDate`, `dueDate`, `startTime`, `endTime`
- **Estimativa:** `estimatedEffortHours`, `estimatedStoryPoints`
- **Checklist / subtarefas:** lista local com checkbox, add/remove
- **Anexos:** upload de `File[]` + campo texto `externalLink` (comentário no código: persistência “em passo futuro”)
- **Watchers:** multi-select por `members` (IDs de usuário)
- **Visibilidade:** `internal` | `shared_with_client`
- **Cobrável:** `billable`, `hourlyRate`, `budgetCap`
- **Recorrência:** `hasRecurrence`, `recurrenceType`
- **Reunião:** `meetingLocation`, `meetingLink`
- **Severidade:** `severity` (select para bugs)

**Não há na UI atual:** dependências entre tarefas, lembretes (`reminders`), `milestone_id`, `parent_task_id`, `sprint_id`, edição de `custom_fields`, ordem manual no quadro (não há coluna de ordenação além de `created_at` na listagem).

**Tags e `task_type`:** no fluxo atual ficam na seção **básica** do `TaskFormDialog` (projeto), não dentro do accordion `TaskAdvancedFields`.

**Área (`area_id`):** não está dentro de `TaskAdvancedFields`; vem do `TaskFormContext` (`ProjectAreaPage` passa `areaId`).

---

## 2. Tabela campo a campo — projeto (`project_tasks` + API)

Legenda **“Funciona na prática?”** para dados: persiste no INSERT/UPDATE, volta no GET e pode ser verificado após reload. Para **lógica de negócio** (ex.: recorrência gerar novas tarefas): indicado à parte.

| Campo | UI existe? | Payload (create) envia? | Backend recebe? (Zod) | INSERT/UPDATE | SELECT (`TASK_SELECT`) | Funciona persistência? | Observação |
|-------|------------|-------------------------|------------------------|---------------|------------------------|-------------------------|------------|
| `title` | Sim (form básico) | Sim | Sim | Sim | Sim | Sim | — |
| `description` | Sim | Sim | Sim | Sim | Sim | Sim | — |
| `status` | Form básico (fixo `todo` na criação via `TaskFormDialog`) | Sim | Sim | Sim | Sim | Sim | — |
| `priority` | Sim | Sim | Sim | Sim | Sim | Sim | — |
| `due_date` | Sim (form básico **e** duplicado em avançado como “Data de Entrega”) | Sim (merge `dueYmd` ou `adv.due_date`) | Sim | Sim | Sim | Sim | Duplicidade de UX: duas fontes para prazo |
| `assignee_id` | Sim | Sim | Sim | Sim | Sim | Sim | — |
| `tags` | Sim (fora do accordion) | Sim | Sim | Sim | Sim | Sim | `jsonb` |
| `task_type` | Sim (fora do accordion) | Sim | Sim | Sim | Sim | Sim | — |
| `area_id` | Contexto (área) | Sim | Sim | Sim | Sim | Sim | Só faz sentido em projetos com áreas |
| `list_id` | Implícito na URL | N/A no body create | N/A | INSERT usa rota | Sim | Sim | UPDATE pode mudar `list_id` com validação |
| `start_date` | Sim (avançado) | Sim (via `formValueToApiPayload`) | Sim | Sim | Sim | Sim | — |
| `start_time` / `end_time` | Sim | Sim | Sim | Sim | Sim | Sim | — |
| `estimated_effort_hours` / `estimated_story_points` | Sim | Sim | Sim | Sim | Sim | Sim | — |
| `checklist` | Sim (dentro do avançado no projeto) | Sim | Sim | Sim | Sim | Sim | Também há checklist no accordion; form básico do projeto não duplica checklist fora |
| `attachments` | Sim (ficheiros) | **Não** (payload `TaskFormDialog` não inclui; API default `[]`) | Sim (default []) | Grava `[]` | Sim | **Parcial** | Ficheiros escolhidos na UI **não** são enviados no JSON atual |
| `dependencies` | **Não** | Default `[]` | Sim | Sim | Sim | Vazio | Sem UI |
| `watchers` | Sim | Sim | Sim | Sim | Sim | Sim | — |
| `reminders` | **Não** | Default `[]` | Sim | Sim | Sim | Vazio | Sem UI |
| `recurrence_rule` | Sim (switch + tipo) | Sim | Sim | Sim | Sim | **Persistência sim; automação ?** | Valor guardado; não auditado aqui se há job que cria instâncias |
| `milestone_id` / `parent_task_id` / `sprint_id` | **Não** | Não enviado (null) | Opcional no schema | Sim | Sim | Null na criação atual | — |
| `visibility` | Sim | Sim | Sim | Sim | Sim | Sim | — |
| `billable` / `hourly_rate` / `budget_cap` | Sim | Sim | Sim | Sim | Sim | Sim | — |
| `custom_fields` | **Não** | Default `{}` | Sim | Sim | Sim | Objeto vazio | — |
| `severity` | Sim | Sim | Sim | Sim | Sim | Sim | — |
| `meeting_location` / `meeting_link` | Sim | Sim | Sim | Sim | Sim | Sim | — |
| `externalLink` (UI) | Sim | **Não** | Não está no `formValueToApiPayload` | — | — | **Não** | **Bug / lacuna:** campo na UI nunca vai para a API |
| `user_id` (criador) | — | — | — | INSERT preenche com user autenticado | Sim | Sim | — |

### Bugs / lacunas confirmadas (projeto)

1. **`externalLink`:** existe no estado `TaskAdvancedFormValue` e na UI, mas **não** entra em `formValueToApiPayload` → nunca grava.
2. **Anexos (`File`):** a API espera JSON em `attachments`; o formulário atual **não** envia ficheiros nem metadados no `TaskFormDialog` → grava sempre lista vazia (comportamento igual ao fluxo antigo baseado em JSON, sem multipart).
3. **`dependencies` / `reminders`:** colunas existem; sem UI na criação → permanecem `[]`.

---

## 3. Tarefas avulsas (`tasks`)

### Colunas atuais (`database/init/11_create_tasks.sql`)

`id`, `user_id`, `title`, `description`, `due_date`, `due_time`, `status`, `priority`, `client_id`, `client_name`, `deal`, `assignee_id`, `assignee_name`, `checklist` (JSONB), `created_at`, `updated_at`.

### API (`tasksController.ts`)

- **POST /api/tasks:** INSERT apenas nas colunas acima (`checklist` incluído).
- **PATCH /api/tasks/:id:** apenas esses campos (incl. `checklist`).
- **GET:** devolve as mesmas colunas (+ formatação legada `date`/`time`/etc.).

### Comparação com campos avançados de `project_tasks`

| Conceito (projeto) | Já existe em `tasks`? | Migration necessária? | Notas |
|--------------------|------------------------|-------------------------|-------|
| Checklist | **Sim** (`checklist` jsonb) | Não | Já usado na UI `/tasks` |
| Tags | **Não** | Sim (ex.: `tags jsonb`) ou JSON metadata | — |
| Anexos | **Não** | Sim ou serviço à parte | Preferência produto |
| Dependências | **Não** | Não faz sentido igual projeto sem grafo | Específico projeto |
| Watchers | **Não** | Sim (ex.: `watchers jsonb`) | — |
| Estimativa (h / SP) | **Não** | Sim (2 colunas ou metadata) | — |
| Datas início + horas | Parcial (`due_date`/`due_time` só vencimento) | Sim se quiser paridade | — |
| Recorrência | **Não** | Sim (`recurrence_rule jsonb`) | Lógica extra |
| Visibilidade / billable / taxas | **Não** | Sim | Nem sempre relevante para avulsa |
| Tipo / severidade / reunião | **Não** | Sim ou metadata única | — |
| `list_id` / `area_id` | **Não** | **Não** (específico projeto) | — |

**Preferência indicada no pedido:** campos comuns na tabela `tasks`; específicos de projeto só em `project_tasks`; alternativa **metadata JSONB** em `tasks` para evitar explosão de colunas (ex.: `task_metadata jsonb` com tags, watchers, estimativas).

---

## 4. Classificação por decisão

### Campos comuns — candidatos a existir também em tarefa avulsa

- Checklist (**já existe**)
- Tags
- Estimativa (horas / story points) — se produto quiser paridade
- Watchers (observadores)
- Tipo de tarefa / severidade — se fizer sentido fora de projeto
- Prazo estendido (início + fim) — hoje avulsa só tem `due_date`/`due_time`
- Descrição, prioridade, responsável — **já existem**

### Específicos de projeto — manter só em `project_tasks`

- `list_id`, `area_id`
- `dependencies` (grafo no contexto do projeto)
- `milestone_id`, `parent_task_id`, `sprint_id` (estrutura de projeto)
- Ordem no quadro (hoje implícita por `created_at` na API de lista)

### Futuro / sem backend útil hoje

- Anexos reais (precisa upload + armazenamento ou URLs persistidas)
- `externalLink` até entrar no payload ou coluna dedicada
- Automação de recorrência (além de guardar JSON)

---

## 5. Checklist — UX desejada (proposta)

**Problema hoje:** no projeto o checklist está **dentro** do accordion “Configurações avançadas”, pouco visível. Na avulsa, o checklist já é secção própria no `TaskFormDialog`, mas pode ganhar hierarquia visual.

**Proposta:**

1. **Secção fixa “Checklist”** (fora do accordion), tanto em **projeto** quanto em **avulsa**, com:
   - Título + subtítulo opcional (“Itens antes de concluir”)
   - Input “Adicionar item” + botão **+**
   - Lista: checkbox, texto, remover
   - Contador **“x/y concluídos”** sempre visível
2. **Reordenar:** drag-and-drop simples (ex.: `@dnd-kit` ou botões ↑↓) se custo baixo; senão fase 2.
3. **Fonte única de verdade no submit:** no projeto, evitar checklist duplicado entre secção nova e `TaskAdvancedFields` (sincronizar estado ou remover checklist de dentro do avançado).
4. **Edição:** reutilizar o mesmo bloco ao editar tarefa (telas de detalhe já manipulam checklist em vários fluxos).

---

## 6. `TaskFormDialog` — `supportedAdvancedFields` (proposta)

Objetivo: um único formulário com capacidades por contexto, sem mostrar campos que não gravam.

**Opção A — prop explícita:**

```ts
supportedAdvancedFields: {
  checklist: boolean;
  tags: boolean;
  attachments: boolean;
  dependencies: boolean;
  watchers: boolean;
  estimate: boolean;
  taskType: boolean;
  area: boolean; // só leitura/contexto; área vem do contexto, não do form
  recurrence: boolean;
  billing: boolean;
  meeting: boolean;
  severity: boolean;
  visibility: boolean;
};
```

**Opção B — derivar de `context`:**

| Contexto | Checklist (secção visível) | Accordion avançado | Notas |
|----------|----------------------------|--------------------|-------|
| `standalone` | Sim (já) | Expandir com campos que **tiverem coluna/API** após migrations | Hoje só checklist + básicos gravam |
| `project` | Sim (mover para fora do accordion) | Manter restantes; corrigir `externalLink` / anexos ou esconder até haver API |
| `client` / `lead` | Sim (quando API tiver checklist) | Mínimo | Hoje `client_tasks` / `lead_tasks` sem checklist na BD |
| `chat` | Igual `standalone` | Igual | — |

Recomendação: **Opção B** para defaults + **override opcional** (Opção A) para feature flags.

---

## 7. Testes obrigatórios (checklist de QA)

### Projeto

- [ ] Criar tarefa com vários itens de checklist → reload projeto → itens iguais.
- [ ] Marcar item concluído → PATCH → reload → estado mantém.
- [ ] Preencher cada campo avançado que **deve** gravar (estimativa, watchers, recorrência, billable, meeting, severity) → GET por id → valores iguais.
- [ ] Tentar `externalLink` e ficheiros → **esperado hoje:** não persistem (registar como bug até correção).
- [ ] Duas datas de entrega (básico vs avançado) → confirmar qual prevalece no código (`dueYmd` vs `adv.due_date`).

### Avulsa (`/tasks`)

- [ ] Criar com checklist → reload `/tasks` → checklist igual.
- [ ] Editar tarefa (modal/detalhe) → alterar checklist → reload → igual.
- [ ] Após futura paridade: tags/watchers/etc. com migration e PATCH.

---

## 8. Resumo executivo

| Pergunta | Resposta curta |
|----------|------------------|
| O que a UI chama de “avançado” no projeto? | `TaskAdvancedFields.tsx` + tags/tipo/`area_id` no `TaskFormDialog`. |
| A maior parte grava? | **Sim**, para campos incluídos no payload de `createProjectTask` e no `taskSchema` do backend. |
| O que não grava ou está incompleto? | **`externalLink`**, **anexos reais**, campos sem UI (`dependencies`, `reminders`, …). |
| `tasks` suporta o mesmo? | **Só checklist + campos básicos**; resto exige **migration** ou **`metadata` jsonb**. |
| Próximo passo seguro? | (1) Checklist sempre visível + contador + uma fonte de estado; (2) corrigir ou ocultar `externalLink`/anexos; (3) decidir schema para tags/watchers/estimativa em `tasks`; (4) só então expandir `TaskFormDialog` standalone. |

---

*Fim do relatório. Implementação deliberadamente fora do escopo deste ficheiro.*
