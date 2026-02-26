# Plano: Configurações Avançadas de Tarefas (Unificação)

## 1. Objetivo

Unificar as **configurações avançadas** em um único conceito e implementação:

- **Criação de tarefa** (NewTaskDialog): os campos avançados já existem na UI mas **não estão sendo enviados** na submissão (os dados “desaparecem” ao salvar). O accordion deve permanecer **fechado por padrão** ao iniciar a criação.
- **Edição / Visualização** (TaskSidePanel > Opções avançadas): deve ficar **exatamente igual** ao que já está em Configurações Avançadas na criação (NewTaskDialog). Não manter Seguimento do projeto (Cliente, Negócio, Responsável) como bloco separado.

Objetivos específicos:

1. Fazer os campos avançados da **criação** serem persistidos (ler do formulário e enviar na API).
2. Exibir e editar **as mesmas** configurações avançadas em **Tarefa aberta > Avançadas** (painel lateral), **idênticas** às da criação: Datas e tempo, Checklist, Anexos, Observadores, Visibilidade, Cobrável, Recorrência, Local/Link de Reunião, Severidade.
3. Um único bloco reutilizável para criação e painel; **não** incluir Seguimento do projeto nesse bloco.

---

## 2. Investigação: onde estão os campos hoje

### 2.1 NewTaskDialog (criação de tarefa de projeto)

**Arquivo:** `src/components/projects/NewTaskDialog.tsx`

O accordion **“Configurações Avançadas”** contém (na ordem da UI):

| Seção | Campos | Nome no form / FormData | API (createProjectTask) |
|-------|--------|--------------------------|-------------------------|
| **Datas e tempo** | Data de Início | `startDate` (state), format yyyy-MM-dd | `start_date` |
| | Data de Entrega | `dueDate` (state) | `due_date` |
| | Hora de Início | `startTime` (name) | `start_time` |
| | Hora de Término | `endTime` (name) | `end_time` |
| | Estimativa (horas) | `estimatedHours` (name) | `estimated_effort_hours` |
| | Story Points | `storyPoints` (name) | `estimated_story_points` |
| **Checklist / Subtarefas** | Lista de itens | `checklist` (state, JSON no FormData) | `checklist` |
| **Anexos** | Arquivos | `attachment_*` (files) | (backend pode receber multipart) |
| | Link externo | `externalLink` (name) | (custom_fields ou attachments URL) |
| **Observadores** | Watchers | `watchers` (state, JSON) | `watchers` |
| **Visibilidade** | Select | `visibility` (name, default "internal") | `visibility` |
| **Cobrável** | Switch + Taxa + Orçamento | `billable` (state), `hourlyRate`, `budgetCap` (name) | `billable`, `hourly_rate`, `budget_cap` |
| **Recorrência** | Switch + tipo | `hasRecurrence` (state), `recurrenceType` (name) | `recurrence_rule` |
| **Local/Link de Reunião** | 2 inputs | `meetingLocation`, `meetingLink` (name) | `meeting_location`, `meeting_link` |
| **Severidade** | Select | `severity` (name) | `severity` |

- O accordion é **collapsible** e **sem defaultValue**: as configurações avançadas começam **fechadas por padrão** (comportamento desejado ao iniciar a criação).
- No submit, o formulário envia apenas: `tags`, `checklist`, `watchers`, `dependencies`, `reminders`, `description`, `dueDate`, `startDate`, `attachment_*`.
- Os handlers **handleCreateTask** em **Projects.tsx** e **ProjectAreaPage.tsx** **não leem** a maior parte desses campos do FormData e enviam payload mínimo (title, description, priority, due_date, assignee_id, tags, checklist: []). Por isso os dados avançados “desaparecem” ao criar.

### 2.2 TaskSidePanel > Opções avançadas (edição/visualização)

**Arquivo:** `src/components/tasks/TaskSidePanel.tsx`

- **Slide “Opções avançadas”** deve ter **exatamente** as mesmas seções da criação (NewTaskDialog): Datas e tempo, Checklist/Subtarefas, Anexos, Observadores, Visibilidade, Cobrável, Recorrência, Local/Link de Reunião, Severidade.
- **Não** manter Seguimento do projeto (Cliente, Negócio, Responsável) no painel; a referência é só o conteúdo atual do accordion de criação.

### 2.3 API e tipos

- **services/projects.ts**: `createProjectTask` e `updateProjectTask` já aceitam todos os campos listados acima (start_date, start_time, end_time, estimated_effort_hours, estimated_story_points, checklist, watchers, visibility, billable, hourly_rate, budget_cap, recurrence_rule, meeting_location, meeting_link, severity, etc.).
- **UnifiedTask** (`lib/taskUnified.ts`) já possui: startDate, startTime, endTime, estimatedEffortHours, estimatedStoryPoints, billable, hourlyRate, budgetCap, severity, meetingLink, meetingLocation, recurrenceRule. **Não** possui hoje `visibility` nem `watchers` (podem ser adicionados se a API retornar).
- **projectTaskToUnified** já mapeia a maioria dos campos avançados da API para UnifiedTask.

---

## 3. Causa raiz do problema

1. **Criação:** o payload de criação é montado só com campos básicos; os avançados existem no form mas não são lidos do FormData nem enviados.
2. **Accordion fechado por padrão** na criação é o comportamento desejado (permanece assim).
3. **Painel Avançadas:** deve replicar exatamente o conteúdo de Configurações Avançadas da criação; não usar Seguimento do projeto.

---

## 4. Estratégia de unificação

- **Referência única:** o conteúdo de “Configurações avançadas” é o que já está no **NewTaskDialog** hoje: Datas e tempo, Checklist/Subtarefas, Anexos, Observadores, Visibilidade, Cobrável, Recorrência, Local/Link de Reunião, Severidade. **Não** incluir Seguimento do projeto (Cliente, Negócio, Responsável).
- **Um único bloco reutilizável** com exatamente essas seções, usado em:
  - **NewTaskDialog:** dentro do accordion (o conteúdo atual da seção avançada).
  - **TaskSidePanel > Opções avançadas:** o mesmo bloco, mesma ordem, mesmos campos.
- **Um único contrato de dados** (objeto “advanced” ou campos nomeados) para criar/atualizar tarefa, evitando várias funções e estados duplicados.

---

## 5. Plano de implantação (passos)

### Checklist de implantação

- [x] **Fase 1** – Campos da criação lidos e enviados (Projects, ProjectAreaPage, NewTaskDialog)
- [x] **Fase 2** – Componente reutilizável TaskAdvancedFields
- [x] **Fase 3** – TaskAdvancedFields na criação (NewTaskDialog)
- [x] **Fase 4** – TaskAdvancedFields no painel (TaskSidePanel) e handleFullViewUpdate
- [x] **Fase 5** – Ajustes (anexos, testes, consistência)

---

### Fase 1: Fazer os campos da criação serem enviados (sem mudar UI)

**Objetivo:** Os campos que já existem no NewTaskDialog passam a ser lidos e enviados na criação.

1. **Projects.tsx – handleCreateTask**
   - Ler do FormData (ou do que o form já envia):  
     `startDate`, `startTime`, `endTime`, `estimatedHours`, `storyPoints`, `checklist` (JSON), `watchers` (JSON), `visibility`, `billable`, `hourlyRate`, `budgetCap`, `recurrenceType` / `hasRecurrence`, `meetingLocation`, `meetingLink`, `severity`.
   - Montar `recurrence_rule` a partir de `hasRecurrence` e `recurrenceType` (formato conforme backend).
   - Incluir no payload de `createProjectTask`:  
     `start_date`, `start_time`, `end_time`, `estimated_effort_hours`, `estimated_story_points`, `checklist`, `watchers`, `visibility`, `billable`, `hourly_rate`, `budget_cap`, `recurrence_rule`, `meeting_location`, `meeting_link`, `severity`.
   - Tratar anexos: se o backend aceitar multipart, enviar no mesmo request; senão, seguir fluxo atual e documentar passo futuro (upload separado).

2. **ProjectAreaPage.tsx – handleCreateTask**
   - Mesma lógica de leitura do FormData e mesmo payload de criação (incluindo `area_id` já existente).

3. **NewTaskDialog – garantir que os nomes batem**
   - Garantir que todos os campos avançados tenham `name` onde for usado no FormData (startTime, endTime, estimatedHours, storyPoints, visibility, hourlyRate, budgetCap, recurrenceType, meetingLocation, meetingLink, severity).
   - Checklist e watchers já vão como JSON no FormData; manter.

4. **Accordion fechado por padrão**
   - Manter o accordion “Configurações Avançadas” **fechado por padrão** ao abrir o dialog de nova tarefa (sem `defaultValue="advanced"`). O usuário expande se quiser preencher os campos avançados.

**Checklist Fase 1 (revisar após implementação):**
- [x] Projects.tsx: handleCreateTask lê todos os campos avançados do FormData e envia no createProjectTask
- [x] ProjectAreaPage.tsx: mesma lógica + area_id
- [x] NewTaskDialog: billable e hasRecurrence enviados no FormData (state não está no form)
- [x] Accordion permanece fechado por padrão
- [x] newTask no estado local reflete checklist e demais campos retornados pela API (Projects usa apiTask retornado; checklist já mapeado)

**Revisão Fase 1 (concluída):** Implementado. Projects.tsx e ProjectAreaPage.tsx leem do FormData: startDate, startTime, endTime, estimatedHours, storyPoints, checklist (JSON), watchers (JSON), visibility, billable, hourlyRate, budgetCap, hasRecurrence, recurrenceType, meetingLocation, meetingLink, severity; montam recurrence_rule quando hasRecurrence; enviam todo o payload em createProjectTask. NewTaskDialog envia billable e hasRecurrence no FormData. Accordion sem defaultValue (fechado por padrão). Anexos (arquivos) não enviados nesta fase — API atual recebe JSON; upload multipart fica para passo futuro.

Resultado: criar tarefa com configurações avançadas preenchidas passa a persistir tudo no backend.

---

### Fase 2: Componente reutilizável “TaskAdvancedFields”

**Objetivo:** Um único componente que renderiza e controla todos os campos avançados (exceto Seguimento, que permanece onde está).

1. **Criar tipo/interface de valor**
   - Ex.: `TaskAdvancedFormValue` com:  
     startDate, startTime, endTime, dueDate (se fizer parte do bloco), estimatedEffortHours, estimatedStoryPoints, checklist, watchers, visibility, billable, hourlyRate, budgetCap, recurrenceRule (ou hasRecurrence + type), meetingLocation, meetingLink, severity.  
   - Anexos podem ser lista de arquos + links; formato conforme backend.

2. **Criar componente `TaskAdvancedFields`**
   - **Arquivo sugerido:** `src/components/tasks/TaskAdvancedFields.tsx`.
   - Props: `value: TaskAdvancedFormValue`, `onChange: (v: TaskAdvancedFormValue) => void`, `members?: { id, name }[]` (para watchers), `mode?: 'create' | 'edit'` (para pequenas variações de label/placeholder se necessário).
   - Conteúdo **idêntico** ao accordion do NewTaskDialog (sem Seguimento):  
     Datas e tempo (início, entrega, hora início, hora término) → Estimativa (horas) e Story Points → Checklist / Subtarefas → Anexos (upload + link) → Observadores (Watchers) → Visibilidade → Cobrável (switch + taxa + orçamento) → Recorrência → Local/Link de Reunião → Severidade.
   - Sem lógica de API; apenas estado controlado por `value`/`onChange`.

3. **Mapeamentos**
   - `TaskAdvancedFormValue` ↔ payload da API (snake_case): funções em `lib/taskUnified.ts` ou em `TaskAdvancedFields` (ex.: `formValueToApiPayload`, `apiTaskToFormValue`).
   - UnifiedTask ↔ TaskAdvancedFormValue: para preencher o painel ao abrir e para montar o payload ao salvar.

**Checklist Fase 2 (revisar após implementação):**
- [x] Tipo `TaskAdvancedFormValue` e `TaskAdvancedChecklistItem` criados; `DEFAULT_TASK_ADVANCED_FORM_VALUE` exportado
- [x] Componente `TaskAdvancedFields` em `src/components/tasks/TaskAdvancedFields.tsx` com value/onChange, members, mode, idPrefix
- [x] Conteúdo idêntico ao accordion: Datas e tempo, Estimativa/Story Points, Checklist, Anexos, Observadores, Visibilidade, Cobrável, Recorrência, Local/Link de Reunião, Severidade
- [x] `formValueToApiPayload` e `unifiedTaskToFormValue` implementados e exportados
- [x] Export em `src/components/tasks/index.ts`

**Revisão Fase 2 (concluída):** Implementado. TaskAdvancedFields.tsx contém TaskAdvancedFormValue (com startDate, dueDate, startTime, endTime, estimatedEffortHours, estimatedStoryPoints, checklist, watchers, visibility, billable, hourlyRate, budgetCap, hasRecurrence, recurrenceType, meetingLocation, meetingLink, severity, attachments, externalLink), DEFAULT_TASK_ADVANCED_FORM_VALUE, formValueToApiPayload, unifiedTaskToFormValue e o componente TaskAdvancedFields com todas as seções na mesma ordem do NewTaskDialog. Sem lógica de API; apenas value/onChange. Watchers em UnifiedTask não expostos ainda — unifiedTaskToFormValue usa array vazio; pode ser estendido quando a API retornar.

Resultado: um único lugar que define labels, ordem e campos das configurações avançadas.

---

### Fase 3: Usar TaskAdvancedFields na criação

1. **NewTaskDialog**
   - Substituir o conteúdo atual do accordion “Configurações Avançadas” por `<TaskAdvancedFields value={...} onChange={...} members={members} mode="create" />`.
   - Estado local do dialog passa a manter um objeto `advancedFormValue` (ou equivalente) em vez de dezenas de useStates separados; no submit, converter para FormData e/ou passar ao pai (conforme combinação escolhida).
   - Se o pai continuar recebendo FormData, o dialog monta o FormData a partir de `advancedFormValue` (e demais campos básicos). Assim handleCreateTask continua podendo ler tudo de um FormData consistente, ou o pai pode passar a receber um objeto estruturado (ex.: `onAddTask(data: { title, description, ..., advanced: TaskAdvancedFormValue })`).

2. **Projects.tsx / ProjectAreaPage.tsx**
   - Se mantiver FormData: garantir que os nomes e o formato (JSON para checklist/watchers) continuem sendo preenchidos pelo NewTaskDialog a partir de `TaskAdvancedFields`.
   - Se migrar para objeto: handleCreateTask recebe o objeto e chama `createProjectTask` com o payload já montado (incluindo campos avançados).

**Checklist Fase 3 (revisar após implementação):**
- [x] NewTaskDialog: estado avançado unificado em `advancedFormValue` (DEFAULT_TASK_ADVANCED_FORM_VALUE)
- [x] Conteúdo do accordion substituído por `<TaskAdvancedFields value={...} onChange={...} members={...} mode="create" />`
- [x] handleSubmit monta FormData a partir de advancedFormValue (dueDate, startDate, startTime, endTime, estimatedHours, storyPoints, checklist, watchers, visibility, billable, hasRecurrence, recurrenceType, meetingLocation, meetingLink, severity, hourlyRate, budgetCap, attachments)
- [x] resetForm reinicia advancedFormValue para DEFAULT_TASK_ADVANCED_FORM_VALUE
- [x] Projects/ProjectAreaPage continuam recebendo FormData; handleCreateTask inalterado (Fase 1)

**Revisão Fase 3 (concluída):** Implementado. NewTaskDialog usa apenas `advancedFormValue` para todos os campos do accordion; conteúdo do accordion é TaskAdvancedFields. No submit, o FormData é preenchido a partir de advancedFormValue com as mesmas chaves que handleCreateTask espera (Fase 1). Dependencies e reminders mantidos em estado local e enviados em JSON. Accordion permanece fechado por padrão.

Resultado: criação usa o mesmo bloco de campos e os dados continuam sendo salvos (Fase 1 já garantiu o envio).

---

### Fase 4: Usar TaskAdvancedFields no painel (Tarefa > Avançadas)

1. **TaskSidePanel – slide Opções avançadas**
   - **Não** manter Seguimento do projeto; o conteúdo do slide é **só** o mesmo do accordion de criação.
   - Renderizar `<TaskAdvancedFields value={...} onChange={...} members={members} mode="edit" />` como conteúdo do slide.
   - Valor inicial: derivar de `task` (UnifiedTask) para `TaskAdvancedFormValue` (usar apiTaskToFormValue ou equivalente a partir dos dados já mapeados em UnifiedTask).
   - Ao alterar: atualizar estado local; ao clicar “Salvar” (ou salvar por seção), chamar `onUpdate(task.id, payload)` com o payload construído a partir de `TaskAdvancedFormValue` (formValueToApiPayload). O `handleFullViewUpdate` em Projects/ProjectAreaPage já deve repassar esses campos para `updateProjectTask` (verificar e, se faltar, adicionar no handler os campos avançados no payload).

2. **UnifiedTask / projectTaskToUnified**
   - Se a API retornar `visibility` e `watchers`, estender UnifiedTask e projectTaskToUnified para incluí-los, e refletir em TaskAdvancedFormValue.

3. **handleFullViewUpdate (Projects e ProjectAreaPage)**
   - Incluir no payload de `updateProjectTask`: start_date, start_time, end_time, estimated_effort_hours, estimated_story_points, checklist, watchers, visibility, billable, hourly_rate, budget_cap, recurrence_rule, meeting_location, meeting_link, severity (e qualquer outro que TaskAdvancedFields produza).
   - Atualizar o estado local da tarefa (fullViewTask) com os novos valores após sucesso, para a UI do painel refletir sem recarregar.

**Checklist Fase 4 (revisar após implementação):**
- [x] TaskSidePanel: prop `members` opcional; estado `advancedFormValue` sincronizado com `unifiedTaskToFormValue(task)` ao mudar task
- [x] Slide Opções avançadas: conteúdo = TaskAdvancedFields + botão Salvar que chama `onUpdate(task.id, formValueToApiPayload(advancedFormValue))`
- [x] Projects e ProjectAreaPage: passam `members` ao TaskSidePanel
- [x] handleFullViewUpdate (ambos): repassam campos avançados para updateProjectTask; setFullViewTask atualizado com camelCase

**Revisão Fase 4 (concluída):** TaskSidePanel recebe `members`, mantém `advancedFormValue`; slide avançado usa TaskAdvancedFields e Salvar com formValueToApiPayload. handleFullViewUpdate inclui todos os campos avançados e atualiza fullViewTask.

Resultado: ao abrir uma tarefa e ir em “Avançadas”, o usuário vê e edita **exatamente** as mesmas configurações avançadas que na criação (sem Seguimento do projeto).

---

### Fase 5: Ajustes e consistência

1. **TaskFullView (tarefas globais)**
   - Se tarefas globais também tiverem algum subconjunto desses campos (ex.: datas, estimativa), considerar usar TaskAdvancedFields lá também, com `mode="edit"` e valor mapeado do task global; caso contrário, manter como está e documentar diferença (global vs projeto).

2. **Anexos**
   - Se o backend já suportar upload na criação/atualização, integrar no mesmo fluxo (TaskAdvancedFields pode receber `onAttachmentsChange` ou incluir anexos em `TaskAdvancedFormValue`); senão, deixar placeholder “em breve” ou implementar chamada de upload separada em um passo posterior.

3. **Testes**
   - Criar tarefa com cada campo avançado preenchido e verificar no backend/UI que persiste.
   - Abrir tarefa > Avançadas, alterar campos, Salvar e reabrir: valores devem estar corretos.
   - Conferir que o painel Avançadas mostra as mesmas seções da criação (sem Seguimento do projeto).

**Checklist Fase 5 (revisar após implementação):**
- [x] TaskFullView: mantido como está para tarefas globais (Seguimento: Cliente, Negócio, Responsável); diferença documentada em comentário e neste plano (global vs projeto).
- [x] Anexos: upload de arquivos presente no TaskAdvancedFields mas não enviado na API atual (createProjectTask/updateProjectTask recebem JSON). Documentado; upload multipart ou endpoint dedicado fica para passo futuro.
- [x] Testes manuais: checklist acima para validar criação, edição no painel e consistência das seções.

**Revisão Fase 5 (concluída):** TaskFullView documentado (tarefas globais = Seguimento; tarefas de projeto = TaskSidePanel + TaskAdvancedFields). Anexos: UI presente, persistência em passo futuro. Testes manuais descritos no checklist. Plano de configurações avançadas concluído (Fases 1 a 5).

---

## 6. Resumo dos arquivos envolvidos

| Arquivo | Ação |
|---------|------|
| `src/components/projects/NewTaskDialog.tsx` | Usar TaskAdvancedFields; garantir names/FormData; accordion permanece fechado por padrão |
| `src/components/tasks/TaskSidePanel.tsx` | Incluir TaskAdvancedFields no slide Opções avançadas (após Seguimento) |
| `src/components/tasks/TaskAdvancedFields.tsx` | **Novo:** componente reutilizável com todos os campos avançados |
| `src/pages/Projects.tsx` | handleCreateTask: ler e enviar todos os campos avançados; handleFullViewUpdate: enviar campos avançados no update |
| `src/pages/ProjectAreaPage.tsx` | Idem |
| `src/lib/taskUnified.ts` | Opcional: helpers formValueToApiPayload / apiTaskToFormValue; estender UnifiedTask com visibility/watchers se a API tiver |
| `src/services/projects.ts` | Já suporta os campos; sem alteração obrigatória |

---

## 7. Ordem recomendada

1. **Fase 1** – Corrigir envio na criação (accordion continua fechado por padrão).  
2. **Fase 2** – Criar TaskAdvancedFields e mapeamentos.  
3. **Fase 3** – Integrar TaskAdvancedFields no NewTaskDialog.  
4. **Fase 4** – Integrar TaskAdvancedFields no TaskSidePanel > Opções avançadas e em handleFullViewUpdate.  
5. **Fase 5** – Ajustes (TaskFullView, anexos, testes).

Assim, as configurações avançadas passam a existir em um único lugar (TaskAdvancedFields), idênticas na criação e no painel (Datas e tempo, Checklist, Anexos, Observadores, Visibilidade, Cobrável, Recorrência, Local/Link de Reunião, Severidade), sem Seguimento do projeto.
