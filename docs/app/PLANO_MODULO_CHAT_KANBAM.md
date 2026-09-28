# Investigação técnica e plano de implantação — módulo `/chat/kanbam`

**Data de referência (código):** repositório `painelcrm` (branch de trabalho atual).  
**Escopo deste documento:** investigação + plano — **sem implementação**, **sem migrations**, **sem alteração ao módulo `/chat` existente**.  
**Rota acordada (provisória):** `/chat/kanbam` (ortografia solicitada pelo produto).

---

## Sumário executivo

O CRM já possui **funil de vendas** (`sales_funnels` + `funnel_stages`) com **múltiplos funis por utilizador**, estágios ordenados e, na UI (`FunnelDetails.tsx`), **Kanban de clientes** com **arrastar e largar** (HTML5 DnD) persistindo `clients.funnel_stage` com o **UUID do estágio**.

O **chat** atual assenta em `chat_instances`, `chat_conversations`, `chat_messages`, com vínculos **`client_id` / `lead_id`**, estado de **atendimento** (Etapa 5) e **WebSocket** para atualizações de conversa e atendimento.

Para o novo módulo **comercial/operacional de conversas em Kanban**, a decisão central é: **reutilizar estágios do funil existente** vs **criar um modelo próprio de board/colunas** e **como** ligar cada **cartão** à entidade canónica (**`chat_conversations.id`** recomendado).

**Recomendação (ver §C):** arquitetura **híbrida** — colunas ligadas a `funnel_stages` (ou a um subconjunto configurável por board), posição do cartão na coluna e metadados operacionais em tabelas novas; conversa continua a ser a **fonte de verdade** do canal WhatsApp; sincronização com CRM (lead/cliente) **opcional e explícita** nas fases finais.

---

## A. Diagnóstico do estado atual

### A.1 Chat — modelo de dados (Postgres)

| Tabela | Papel |
|--------|--------|
| `chat_instances` | Instância WhatsApp (UazAPI); `user_id`; `metadata` JSONB (perfil ligado, sync, etc.); evolução com `connected_phone` / `phone_key` em scripts posteriores. |
| `chat_conversations` | Conversa; `user_id` (criador/dono lógico); `instance_id`; `external_chat_id`; `client_id`, `lead_id`; identidade canónica (`canonical_phone`, `display_name`, `avatar_url`, …); preview/atividade (`last_message_preview`, `last_message_at`, `unread_count`); **Etapa 5:** `attendance_status`, `assigned_to_user_id`, `assigned_team_id`, fila, histórico em `chat_conversation_assignment_history`. |
| `chat_messages` | Mensagens; FK `conversation_id`. |

**Tenant / RLS:** políticas em `97_rls_chat_app_actor_visibility.sql` e relacionadas — visibilidade por **tenant** (`users.tenant_id = app.current_tenant_id`) e/ou **`user_id = app.actor_user_id`** para cenários legíveis pelo backend autenticado.

**Implicação:** qualquer listagem do Kanban deve **respeitar as mesmas regras de visibilidade** que `getConversations` (hoje no `chatController` + filtros de inbox/atendimento).

### A.2 Chat — API e stack- Montagem: `app.use('/api/chat', chatRoutes)` em `packages/backend/src/index.ts`.
- Middleware: `tenantAuthCrm` + `requireFeature('chat')` em `chatRoutes.ts`.
- Endpoints relevantes para reaproveitamento: `GET /api/chat/conversations`, mensagens, link/unlink CRM, atendimento (`chatAttendanceController`), etc.

**Frontend:** página `src/pages/Chat.tsx`, serviço `src/services/chat.ts`, componentes em `src/components/chat/`. Rota única hoje: `/chat` em `App.tsx`.

### A.3 Chat — tempo real

Em `websocketService.ts`: emissão de `conversation_updated` para `user:{userId}`; `conversation_attendance_updated` para `tenant:{tenantId}` e dono. O Kanban futuro pode **subscrever** os mesmos eventos para refrescar cartões **sem** acoplar à UI do `/chat`.

### A.4 Funil CRM existente

| Tabela | Papel |
|--------|--------|
| `sales_funnels` | Funil; `user_id`; `name`, `type`, `is_default`, etc. **Múltiplos funis por utilizador** (não há “um funil global” no schema base). |
| `funnel_stages` | Estágios; `funnel_id`; `name`, `color`, `order_position`. |

**Propostas/contratos:** `proposals` tem `stage_id` → `funnel_stages` (FK real).

**Clientes:** em `04_create_leads_and_clients.sql`, `clients.funnel_stage` é **TEXT**; na prática o funil de clientes grava o **UUID do estágio** via `PATCH /api/clients/:id` com `{ funnel_stage: stageId }` (`src/services/funnels.ts` → `clientsController`).

**Leads:** `leads.funnel_stage` existe como **TEXT** no init — integração com estágios tipados é **menos madura** que em clientes.

### A.5 Kanban / drag-and-drop já existente

- `src/pages/FunnelDetails.tsx`: aba Kanban para funil tipo **clients**; **HTML5** `onDragStart` / `onDrop`; persistência com `updateClientStage`.
- Reordenação de colunas: `updateStage` com `order_position`.

**Não há** (no inventário rápido de `database/init`) tabela `deals` / `opportunities` — o “card” de negócio no funil atual, para clientes, é o **próprio cliente** num estágio.

### A.6 Navegação e permissões (frontend)

- `AppLayout.tsx`: entrada única **Chat** → `/chat`, grupo “Atendimento”.
- `RequireModuleView.tsx`: qualquer path que comece com `/chat` mapeia módulo **`chat`** — `/chat/kanbam` **herdará** a mesma permissão de visualização, salvo decisão futura de sub-módulo.

---

## B. Opções de arquitetura

### B.1 Opção 1 — Reaproveitar 100% o funil existente (cartão = cliente ou lead)

**Ideia:** cada coluna é um `funnel_stages.id` de um `sales_funnels` escolhido; o cartão no board de chat é o **registo CRM** (cliente/lead); abrir “conversa” resolve `chat_conversations` por `client_id` / `lead_id` / telefone.

| Prós | Contras |
|------|--------|
| Uma só hierarquia de estágios; relatórios por funil alinhados. | Conversas **sem** cliente/lead ficam **fora** do board ou exigem regra artificial. |
| Menos tabelas novas. | Arrastar cartão **move o cliente no funil** — impacto direto no CRM; pode conflitar com “visão só comercial” vs “atendimento”. |
| Reutiliza padrão `updateClientStage`. | Lead com `funnel_stage` TEXT fraco; inconsistência cliente vs lead. |

**Veredicto:** viável só se o produto aceitar que **todo** cartão é entidade CRM — não cobre bem “inbox de conversas ainda não qualificadas”.

### B.2 Opção 2 — Módulo Kanban próprio (colunas e cartões só de chat)

**Ideia:** novas tabelas `chat_kanban_boards`, `chat_kanban_columns`, `chat_kanban_cards` (ou equivalente) com `conversation_id` obrigatório; estágios **independentes** do funil.

| Prós | Contras |
|------|--------|
| Liberdade total; não altera funil ao mover card. | **Duplicação conceptual** com funil (“Novo lead” em dois sítios). |
| Cobre 100% das conversas. | Sincronização manual ou integrações ad-hoc com CRM. |
| Menor risco de efeitos secundários em `clients.funnel_stage`. | Mais manutenção e relatórios cruzados mais trabalhosos. |

**Veredicto:** bom para MVP **puro operacional**, fraco se o objetivo é “**um** pipeline comercial de verdade”.

### B.3 Opção 3 — Híbrida (recomendada para análise)

**Ideia:**

- **Cartão** = sempre **`chat_conversations`** (identidade do canal).
- **Board** = entidade nova por tenant (ou por `user_id` alinhado ao padrão atual do funil): vários boards.
- **Coluna** = referência **opcional** a `funnel_stages.id` **ou** coluna “livre” só do board (tipo `column_kind: crm_stage | custom`).
- **Posição** na coluna: `position` numérico + `updated_at` (e opcionalmente `card_metadata` JSONB).
- **Sincronização com CRM:** ao mover para coluna mapeada a um estágio do funil de **clientes**, **opcionalmente** atualizar `clients.funnel_stage` **se** `client_id` existir; caso contrário apenas estado do board.

| Prós | Contras |
|------|--------|
| Evita duplicar “conversa”; alinha com WebSocket e APIs atuais. | Modelo mais rico; exige desenho claro de migrações e UI de configuração. |
| Integra com funil sem obrigar conversa = cliente. | Requer regras de produto para “move coluna X → atualiza CRM sim/não”. |
| Permite múltiplos boards (comercial, suporte, por equipa). | Concorrência e auditoria devem ser definidas cedo (ver §F). |

---

## C. Recomendação

1. **Rota e produto:** manter **`/chat/kanbam`** como **área nova**; **não** alterar `Chat.tsx` para embutir o board; nova página (ex.: `ChatKanbanPage.tsx`) + rota filha em `App.tsx`.
2. **Menu:** segundo item sob **Atendimento**, abaixo de **Chat**, mesma feature flag `chat` (ou sub-flag `chat_kanban` quando quiserem rollout gradual).
3. **Modelo de dados:** **Opção 3 (híbrida)** — tabelas novas para boards/colunas/posição de conversa; colunas podem **apontar** para `funnel_stages` para **espelhar** o funil existente sem substituí-lo.
4. **Entidade do card:** `conversation_id` + **denormalização leve** (nome, telefone, última mensagem) para performance de lista, com invalidação via WebSocket / polling incremental.
5. **Funil:** não forçar `conversation → opportunity` (não há oportunidade canónica na BD hoje); usar **`conversation → client | lead`** já existente e, no futuro, ligação a propostas se fizer sentido.
6. **Múltiplos Kanbans por tenant:** campo `tenant_id` ou, no padrão actual, **scoping via `user_id` dos recursos** + RLS; alinhar com como `sales_funnels` identifica dono (`user_id`) e como o backend resolve tenant.

---

## D. Plano de implantação (etapas pequenas e seguras)

Ordem sugerida com **mínimo risco** para o `/chat` existente:

| Etapa | Entrega | Notas |
|-------|---------|--------|
| **D.1** | **Modelagem + ADR curto** | **Concluído** — ver `docs/app/ETAPA_D1_CHAT_KANBAM_MODELAGEM_ADR.md` (entidades, campos, P1, ADR-001, escopo D.2). |
| **D.2** | **Migrations** | Criar tabelas board/column/card (ou `conversation_kanban_state`); índices por `tenant`/`board`/`column`/`position`; **sem** triggers que alterem `chat_conversations` além do necessário. |
| **D.3** | **Backend CRUD de boards/colunas** | Rotas novas (ex.: `/api/chat/kanban/...`) **ou** `/api/kanban/...` com mesmo middleware de auth + feature; **não** alterar rotas atuais de conversas. |
| **D.4** | **Backend listagem de cards** | `GET` que junta `chat_conversations` + dados de preview + permissões; paginação por coluna ou cursor. |
| **D.5** | **Mover card (API)** | `PATCH` posição/coluna; transacção; validação de permissão; **opcional** hook para atualizar CRM. |
| **D.6** | **Frontend: rota + shell** | `/chat/kanbam`, layout próprio, selector de board, colunas vazias. |
| **D.7** | **Frontend: cards + drawer/modal** | Componente de conversa **reutilizando** `chatService` / bubbles existentes **sem** importar a página `Chat` inteira. |
| **D.8** | **Drag-and-drop** | Preferir biblioteca consistente (ex. `@dnd-kit`) **ou** HTML5 como `FunnelDetails`; debounce + optimistic UI + rollback. |
| **D.9** | **Integração funil** | Mapeamento coluna ↔ `funnel_stages`; ação “sincronizar estágio do cliente” condicionada a `client_id`. |
| **D.10** | **Realtime** | Ouvir `conversation_updated` / attendance; invalidar queries React Query (se aplicável). |
| **D.11** | **Auditoria** | Tabela `chat_kanban_card_events` ou reutilizar padrão de `chat_conversation_assignment_history`. |
| **D.12** | **Permissões finas** | Se necessário: permissão `chat_kanban` ou roles (quem cria board, quem move todos vs só “os meus”). |

**Rollback:** feature flag desliga menu + rota; tabelas novas podem ficar vazias sem impacto no chat legado.

---

## E. Áreas afetadas (checklist)

| Área | Impacto esperado |
|------|------------------|
| **BD** | Novas tabelas; possíveis índices em `chat_conversations` para listagens por board. |
| **Migrations** | Scripts em `database/init/` ou `supabase/migrations/` (processo do projeto). |
| **Backend** | Novo router/controller; **zero** mudança obrigatória em `getConversations` se a listagem Kanban for endpoint dedicado. |
| **Rotas** | `App.tsx`: `<Route path="/chat/kanbam" ...>`; lazy load. |
| **Páginas** | Nova página Kanban; **não** `Chat.tsx`. |
| **Componentes** | Board, coluna, card, drawer de conversa (podem viver em `src/components/chat-kanban/`). |
| **Serviços FE** | `src/services/chatKanban.ts` (nome ilustrativo). |
| **WebSocket** | Consumo adicional; opcionalmente emissão de evento `kanban_card_moved` (nice-to-have). |
| **Menus** | `AppLayout.tsx` — entrada “Kanban” / “Chat Kanban” com `NavLink` para `/chat/kanbam`. |
| **Permissões** | `RequireModuleView` — hoje `/chat/*` → `chat`; avaliar sub-módulo no `permissionEngine` / `role_module_permissions`. |
| **Funil existente** | Leitura de `sales_funnels` / `funnel_stages`; **escrita** condicional em `clients.funnel_stage` apenas na etapa de integração. |

---

## F. Riscos e cuidados

| Risco | Mitigação |
|-------|-----------|
| **Duplicação funil vs Kanban** | Documentar “estágio CRM” vs “coluna operacional”; usar mapeamento explícito; evitar dois nomes para o mesmo conceito sem regra. |
| **Quebrar atendimento atual** | Não alterar `Chat.tsx` nem contratos de `getConversations`; novo código atrás de flag. |
| **UX confusa** | `/chat` = fila/lista tradicional; `/chat/kanbam` = visão pipeline; textos claros; mesmo módulo de permissão ou tooltip de ajuda. |
| **Performance** | Boards com centenas de conversas: paginar por coluna, virtualizar lista, limitar payload do card. |
| **Concorrência** | Dois utilizadores movem o mesmo card: **last write wins** ou locking otimista (`version` no card); mostrar toast em conflito. |
| **Realtime** | Ordem dos eventos; debounce de refetch; não assumir estado só local após DnD sem confirmar API. |
| **Segurança** | Mesmo isolamento tenant que chat; validar que `conversation_id` pertence ao tenant antes de mover. |
| **Manutenção** | ADR + testes de API em movimentação e em RLS; evitar lógica duplicada de “quem vê qual conversa” — centralizar num serviço backend. |
| **Leads vs clientes** | Lead sem estágio UUID estável: integração com funil pode ser **fase 2** ou só para clientes. |

---

## Apêndice — Relação conversa ↔ funil (perguntas do briefing)

| Pergunta | Resposta orientada pelo código atual |
|----------|--------------------------------------|
| Reaproveitar funil existente? | **Parcialmente** — colunas podem referenciar `funnel_stages`; cartão deve ser **conversa**, não substituir o modelo de cliente. |
| Conversa vira oportunidade? | **Não há** entidade oportunidade na BD analisada; usar **client/lead** + propostas se necessário. |
| Vincular a oportunidade existente? | **N/A** hoje; futuro: link opcional. |
| Melhor modelo de ligação | **`conversation_id`** + `client_id`/`lead_id` já na conversa; board guarda **em que coluna** a conversa está operacionalmente. |

---

## Próxima decisão de produto (gate antes de D.9)

Definir **uma** política explícita:

- **(P1)** Mover coluna no Kanban **nunca** altera o funil CRM automaticamente.  
- **(P2)** Altera **só** se a coluna estiver mapeada e existir `client_id`.  
- **(P3)** Altera e **cria** lead/cliente — fora de escopo inicial (alto risco).

A recomendação técnica é começar por **(P1)** e evoluir para **(P2)** com toggle por board ou por tenant.

---

*Documento gerado para suportar decisão de arquitetura; implementação apenas após aprovação do modelo híbrido (ou variante) e da política (P1–P3).*
