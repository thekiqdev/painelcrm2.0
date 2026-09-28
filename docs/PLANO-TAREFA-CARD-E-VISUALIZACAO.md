# Plano: Card de Tarefa Aprimorado e Visualização (Resumo + Completa)

**Objetivo:** Melhorar o card da tarefa, organizar a exibição de todas as informações e oferecer duas formas de abertura (resumo e janela completa), com **a mesma experiência** nas áreas **Tarefas** (módulo global) e **Projetos** (listas/áreas).

---

## 1. Situação atual

### 1.1 Onde a tarefa aparece

| Área | Onde | Componente atual | API |
|------|------|------------------|-----|
| **Projetos** | Board (etapas), Lista de tarefas, Área do projeto | `TaskCard`, `TaskListView` (cards inline), `TaskDetailDialog` | `GET/PATCH /api/projects/lists/:listId/tasks`, `GET/PATCH /api/projects/tasks/:taskId` |
| **Tarefas** | Lista por abas (Todas, Hoje, Próximas, Concluídas) | `TaskList` (Card por item, definido inline em `Tasks.tsx`) | `GET/PATCH /api/tasks` |

### 1.2 Modelo de dados

- **Tarefas de projeto (ProjectTask):** Campos ricos: título, descrição, status, prioridade, due_date, assignee_id, tags, checklist, start_date, start_time, end_time, estimated_effort_hours, estimated_story_points, attachments, recurrence_rule, task_type, severity, meeting_link, meeting_location, billable, hourly_rate, budget_cap, custom_fields, etc.
- **Tarefas globais (Task):** Campos mais simples: title, description, date, time, status, priority, client, deal, assignee, checklist.
- **Tipo UI (projects/types Task):** Usado no Board/ProjectArea: id, title, description, status, priority, dueDate, assignee, tags, labels, checklist.

### 1.3 Problemas atuais

- Card do projeto (`TaskCard`) mostra pouco: título, descrição curta, prioridade, checklist, tags, data, assignee. Falta: status visível, esforço, tipo, prazos de início/fim, link de reunião, anexos, etc.
- Em **Projetos com áreas**, ao abrir a tarefa só existe um fluxo: um clique abre o `TaskDetailDialog` (completo).
- Na página **Tarefas**, o card é outro (Card inline em `TaskList`), com visual e informações diferentes; o detalhe é um Dialog próprio, não reutiliza o de projetos.
- Não há “resumo rápido” (preview) nem opção explícita “abrir em janela completa”.

---

## 2. Objetivos e escopo

1. **Card único e mais rico:** Um único componente de card de tarefa, usado em Tarefas e em Projetos, exibindo de forma organizada: status, prioridade, datas (vencimento e, se houver, início/fim), responsável, checklist (resumo), tags, tipo, esforço (horas/pontos), e indicadores (anexos, reunião, recorrente).
2. **Todas as informações ao visualizar:** Ao abrir a tarefa (resumo ou completa), exibir de forma organizada todos os campos preenchidos (incl. descrição, checklist completo, anexos, reunião, custom_fields quando existirem).
3. **Dois modos de abertura:**
   - **1 – Resumo:** clique simples no card abre um **resumo** (popover ou painel lateral compacto): título, status, prioridade, datas, responsável, descrição (truncada), checklist (resumo) e botão “Abrir por completo”.
   - **2 – Completo:** ação explícita “Abrir por completo” (botão no resumo ou clique secundário/ícone no card) abre a **janela completa** (dialog ou drawer grande) com todas as seções editáveis.
4. **Mesma experiência em Tarefas e Projetos:** Usar os mesmos componentes de card, resumo e janela completa em ambas as áreas; onde o backend tiver menos campos (tarefas globais), os blocos opcionais simplesmente não aparecem ou ficam vazios.

---

## 3. Arquitetura de componentes (proposta)

### 3.1 Componentes compartilhados (pasta sugerida: `src/components/tasks/`)

| Componente | Responsabilidade |
|------------|------------------|
| **UnifiedTaskCard** | Card único para lista/board. Exibe resumo visual rico (status, prioridade, datas, assignee, checklist, tags, tipo, esforço, ícones anexo/reunião). Clique principal → abre Resumo. Prop para “onOpenSummary” e “onOpenFull”. |
| **TaskSummaryPopover** (ou TaskSummaryPanel) | Resumo rápido: título, status, prioridade, datas, responsável, descrição (1–2 linhas), checklist X/Y, tags; botão “Abrir por completo”. Pode ser Popover ancorado ao card ou painel deslizante. |
| **TaskFullView** | Janela completa (Dialog ou Drawer): todas as seções (cabeçalho, descrição, datas e horários, checklist, tags, anexos, reunião, esforço/orçamento, custom fields, etc.) em abas ou seções colapsáveis; modo leitura e modo edição. Reutiliza/estende a lógica atual do `TaskDetailDialog` de projetos. |

### 3.2 Tipo de dados para a UI (unificado)

- Criar um tipo **UnifiedTask** (ou estender o `Task` de `components/projects/types`) com todos os campos opcionais que existem em ProjectTask + campos de tarefa global (ex.: client, deal). Tarefas globais e de projeto são mapeadas para esse tipo; campos inexistentes ficam `undefined`.
- Assim, **UnifiedTaskCard**, **TaskSummaryPopover** e **TaskFullView** recebem `task: UnifiedTask` e opcionalmente `context: 'global' | 'project'` (para esconder “Etapa” em contexto global, por exemplo).

### 3.3 Onde usar

- **Módulo Tarefas (`Tasks.tsx`):** Substituir o Card atual do `TaskList` por **UnifiedTaskCard**; ao clicar no card, abrir **TaskSummaryPopover**; no resumo, “Abrir por completo” abre **TaskFullView** (com API de tarefas globais).
- **Projetos – Board e Lista:** Substituir `TaskCard` por **UnifiedTaskCard**; mesmo fluxo: clique → resumo; “Abrir por completo” → **TaskFullView** (com API de tarefas de projeto e props como listId, lists para mover etapa).
- **Projetos – Área (`ProjectAreaPage`):** Mesmo **UnifiedTaskCard** + resumo + **TaskFullView**, mantendo integração com listas/área.

---

## 4. Conteúdo do card (UnifiedTaskCard)

- **Sempre:** Título, status (badge ou pill), prioridade (cor + texto), data de vencimento, responsável (avatar + nome).
- **Se houver:** Descrição (1 linha truncada), checklist (X/Y + barra de progresso), tags (até 3–5 + “+N”), data/hora início e fim, esforço (horas ou story points), tipo de tarefa (badge), ícones pequenos: anexos, link de reunião, recorrente.
- **Visual:** Borda lateral ou badge de prioridade; estado “concluída” com opacidade/risco no título; layout compacto mas legível.

---

## 5. Conteúdo do resumo (TaskSummaryPopover / Panel)

- Título (completo).
- Status, prioridade, datas (vencimento; início/fim se houver).
- Responsável.
- Descrição (2–3 linhas, truncada com “ver mais” no completo).
- Checklist: “X de Y itens” + barra; lista dos itens (só leitura).
- Tags; tipo; esforço (se houver).
- Botão principal: **“Abrir por completo”** (abre TaskFullView).

---

## 6. Conteúdo da janela completa (TaskFullView)

- **Cabeçalho:** Título (editável), status (toggle/select), prioridade, checkbox concluída.
- **Seções (agrupadas e organizadas):**
  - Informações básicas: descrição, tipo, severidade, datas (vencimento, início, fim), horários.
  - Checklist (lista completa, adicionar/remover/marcar).
  - Responsável, tags, etiquetas.
  - Para projetos: etapa/lista (mover tarefa).
  - Esforço e orçamento: horas estimadas, story points, billable, hourly_rate, budget_cap (se existirem).
  - Anexos (lista + link para abrir).
  - Reunião: meeting_link, meeting_location (se existirem).
  - Recorrência (se existir).
  - Custom fields (se existirem).
- **Ações:** Salvar, excluir, “Fechar”. Em contexto projeto: mover de etapa.

---

## 7. Formas de abrir (UX)

1. **Clique simples no card** → abre o **resumo** (popover ou painel ao lado do card).
2. **No resumo** → botão **“Abrir por completo”** → abre a **janela completa** (dialog/drawer).
3. **Ação alternativa no card** (opcional): ícone “expandir” ou clique secundário (menu de contexto) com opção **“Abrir por completo”** → abre direto a janela completa, sem passar pelo resumo.

Assim, “1 – abrir resumo” e “2 – abrir por completo (janela separada)” ficam claros e implementados.

### 7.1 Acessibilidade, teclado e responsividade (Etapa 7)

- **UnifiedTaskCard:** `role="button"`, `tabIndex={0}`, `aria-label` com título, status e prioridade; Enter/Espaço disparam o clique (abrir resumo).
- **TaskSummaryPopover:** Trigger com `aria-haspopup="dialog"`, `aria-expanded`, `aria-label`; conteúdo do popover com `aria-label`; **Escape** fecha o resumo (Radix); conteúdo com `max-h-[70vh] overflow-y-auto` em telas pequenas.
- **TaskFullView:** `DialogDescription` com texto para leitores de tela (incl. "Escape para fechar"); **Escape** fecha a janela (Radix); `w-[95vw] sm:w-full max-w-2xl` e `overflow-hidden` para responsividade.
- **Botão "Abrir por completo":** `aria-label` descritivo.

---

## 8. Etapas de implementação sugeridas

| Etapa | Descrição | Entregável |
|-------|-----------|------------|
| **1** | Definir tipo **UnifiedTask** e mapeamentos: ProjectTask → UnifiedTask e Task (global) → UnifiedTask. | Tipo + funções de mapeamento em `src/components/tasks/` ou `src/lib/taskUnified.ts`. |
| **2** | Criar **UnifiedTaskCard** com layout enriquecido (status, prioridade, datas, assignee, checklist, tags, tipo, esforço, ícones), sem alterar ainda as páginas. | Componente UnifiedTaskCard utilizável com `task: UnifiedTask`. |
| **3** | Criar **TaskSummaryPopover** (ou TaskSummaryPanel) com conteúdo do resumo e botão “Abrir por completo”. | Popover/Panel reutilizável. |
| **4** | Criar **TaskFullView** (dialog ou drawer) com todas as seções organizadas; suportar props para contexto projeto (listId, lists, onMove) e contexto global (sem etapa). Integrar com lógica atual de TaskDetailDialog onde fizer sentido. | TaskFullView usado por projetos. |
| **5** | Integrar em **Projetos:** BoardView e TaskListView usam UnifiedTaskCard; clique abre resumo; “Abrir por completo” abre TaskFullView; manter compatibilidade com ProjectAreaPage. | Projetos usando card + resumo + full view. |
| **6** | Integrar em **Tarefas:** TaskList usa UnifiedTaskCard; mapear tarefas globais para UnifiedTask; mesmo fluxo resumo → full view; TaskFullView chama API `/api/tasks`. | Módulo Tarefas com mesma UX. |
| **7** | Ajustes finos: acessibilidade (ARIA, foco), teclado (Escape fecha resumo/full), responsividade, e testes em ambas as áreas. | Documentação breve de uso e verificação em Tarefas e Projetos. |

### Verificação rápida (Tarefas e Projetos)

- **Módulo Tarefas:** Lista (Todas / Hoje / Próximas / Concluídas) → card unificado → clique abre resumo → "Abrir por completo" abre TaskFullView; editar/excluir/concluir persiste em `/api/tasks`; Escape fecha resumo e janela completa.
- **Projetos (Board e Lista):** Card unificado nas etapas/listas → mesmo fluxo resumo → full view; mover etapa, editar, excluir via API de projetos; ProjectAreaPage com mesma UX.
- **Acessibilidade:** Navegação por teclado (Tab, Enter, Espaço, Escape); leitores de tela com rótulos nos cards, no resumo e no botão "Abrir por completo".
- **Responsividade:** Resumo com scroll em altura reduzida; janela completa com largura 95vw em mobile e max-width em desktop.

---

## 9. Compatibilidade e não regressão

- **Projetos:** Manter suporte a listId, lists, área (areaId); criar/editar/mover tarefas via API de projetos; não remover funcionalidades atuais (mover etapa, excluir, etc.).
- **Tarefas globais:** Manter filtros por data/status/cliente; criar/editar via `/api/tasks`; campos que não existem no backend (ex.: story points) não são enviados, só exibidos em branco no card/full quando vierem do projeto.
- **TaskDetailDialog:** Pode ser refatorado para ser o conteúdo interno do **TaskFullView** em contexto projeto, ou substituído gradualmente pelo TaskFullView para evitar duplicação.

---

## 10. Resumo

- **Card:** Um único card rico (**UnifiedTaskCard**) com todas as informações relevantes visíveis de forma organizada.
- **Visualização:** Duas aberturas — (1) **Resumo** no clique do card; (2) **Completa** em janela separada (dialog/drawer), acessível pelo botão no resumo ou por ação alternativa no card.
- **Unificação:** Mesmos componentes e mesma UX nas áreas **Tarefas** e **Projetos** (incl. áreas do projeto), com tipo unificado e mapeamento por contexto de API.

Quando quiser, podemos começar pela **Etapa 1** (tipo UnifiedTask e mapeamentos) e em seguida a **Etapa 2** (UnifiedTaskCard).
