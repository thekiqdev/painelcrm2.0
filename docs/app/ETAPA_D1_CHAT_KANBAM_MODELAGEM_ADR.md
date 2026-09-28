# Etapa D.1 — Modelagem + ADR — módulo `/chat/kanbam`

**Status:** concluída (somente documentação).  
**Não inclui:** migrations, código, alterações a `/chat` ou `Chat.tsx`.  
**Política comercial/CRM:** **P1** — mover card **não** altera funil (`clients.funnel_stage`, leads, oportunidades).

---

## A. Modelagem proposta

### A.1 Entidades e nomes de tabelas (Postgres)

| Entidade conceitual | Tabela proposta | Descrição |
|---------------------|-----------------|-----------|
| Board (Kanban) | `chat_kanban_boards` | Um quadro por tenant; vários boards por tenant. |
| Coluna | `chat_kanban_columns` | Estágio visual dentro do board; ordem explícita. |
| Card (posição da conversa) | `chat_kanban_cards` | Vínculo **conversa ↔ coluna**, com ordenação na coluna. |

**Entidade central do card:** sempre `conversation_id` → `chat_conversations.id` (obrigatório, FK).

### A.2 `chat_kanban_boards`

| Campo | Tipo | Obrig. | Notas |
|-------|------|--------|--------|
| `id` | UUID | PK | `gen_random_uuid()` |
| `tenant_id` | UUID | sim | FK → `tenants(id)` ON DELETE CASCADE (ou RESTRICT, alinhar ao padrão do projeto na D.2) |
| `name` | TEXT | sim | Nome exibido do Kanban |
| `description` | TEXT | não | Texto auxiliar |
| `sort_order` | INTEGER | não | Ordem na lista de boards (default 0); útil quando houver selector de board |
| `archived_at` | TIMESTAMPTZ | não | Soft-delete do board; boards arquivados não entram no MVP de listagem default |
| `created_by_user_id` | UUID | sim | FK → `users(id)` — quem criou (auditoria, permissões futuras) |
| `updated_by_user_id` | UUID | não | FK → `users(id)` — última edição de metadados do board |
| `linked_sales_funnel_id` | UUID | não | **Reservado (futuro)** — FK → `sales_funnels(id)` ON DELETE SET NULL; **sem uso na D.2** além de coluna nullable |
| `created_at` | TIMESTAMPTZ | sim | default `now()` |
| `updated_at` | TIMESTAMPTZ | sim | trigger padrão do projeto |

**Índices sugeridos (D.2):** `(tenant_id)`, `(tenant_id, archived_at)`, `(tenant_id, sort_order)`.

**Escopo:** um board pertence a **exatamente um** `tenant_id`. Não há `owner_user_id` obrigatório no MVP: o **tenant** é o isolamento principal; `created_by_user_id` cobre auditoria e evolução de RBAC (“só criador edita” pode vir depois).

### A.3 `chat_kanban_columns`

| Campo | Tipo | Obrig. | Notas |
|-------|------|--------|--------|
| `id` | UUID | PK | |
| `board_id` | UUID | sim | FK → `chat_kanban_boards(id)` ON DELETE CASCADE |
| `tenant_id` | UUID | sim | **Denormalizado** de `chat_kanban_boards.tenant_id` na escrita — simplifica RLS e validações sem join obrigatório em políticas |
| `name` | TEXT | sim | Rótulo da coluna (ex.: “Novo lead”) |
| `color` | TEXT | não | Cor/token para UI (ex.: classe Tailwind ou hex) |
| `position` | INTEGER | sim | Ordem da coluna no board (0, 1, 2, …); único **por board** |
| `funnel_stage_id` | UUID | não | **Reservado (futuro)** — FK → `funnel_stages(id)` ON DELETE SET NULL; **sem sync automático (P1)** |
| `metadata` | JSONB | não | default `{}` — flags futuras (ex.: “coluna terminal”) sem migration imediata |
| `created_at` / `updated_at` | TIMESTAMPTZ | sim | |

**Unicidade:** `UNIQUE (board_id, position)` — evita duas colunas na mesma ordem; ajustes de ordem na D.2+ via transação.

**Índices:** `(board_id)`, `(tenant_id)`, `(board_id, position)`.

**Papel:** coluna **própria** do board no MVP; `funnel_stage_id` existe só para **evolução** (mapeamento opcional, sem comportamento).

### A.4 `chat_kanban_cards`

| Campo | Tipo | Obrig. | Notas |
|-------|------|--------|--------|
| `id` | UUID | PK | |
| `board_id` | UUID | sim | FK → `chat_kanban_boards(id)` ON DELETE CASCADE — **denormalizado** para unicidade e índices |
| `column_id` | UUID | sim | FK → `chat_kanban_columns(id)` ON DELETE **RESTRICT** ou **SET NULL** — ver nota D.2 |
| `tenant_id` | UUID | sim | Denormalizado do board na escrita |
| `conversation_id` | UUID | sim | FK → `chat_conversations(id)` ON DELETE **CASCADE** — apaga card se conversa for removida |
| `position` | DOUBLE PRECISION | sim | Ordenação **dentro da coluna**; permite “fractional indexing” (reordenar sem renumberar tudo) ou usar INTEGER com gaps — decisão de tipo na D.2 |
| `metadata` | JSONB | não | default `{}` — notas operacionais, pin, cor, SLA leve, etc., **sem** duplicar CRM |
| `archived_at` | TIMESTAMPTZ | não | Ocultar card do board ativo sem apagar histórico (opcional MVP) |
| `created_by_user_id` | UUID | não | Quem colocou a conversa no board |
| `updated_by_user_id` | UUID | não | Registo do último movimento relevante (opcional) |
| `created_at` / `updated_at` | TIMESTAMPTZ | sim | |

**Unicidade (regra de negócio):**  
`UNIQUE (board_id, conversation_id)` — **no mesmo board**, cada conversa aparece **no máximo uma vez**.

**Índices:** `(board_id, column_id, position)`, `(conversation_id)`, `(tenant_id, board_id)`.

**Consistência `column_id` ↔ `board_id`:** garantir na aplicação (e opcionalmente CHECK na D.2 via trigger) que `chat_kanban_columns.board_id = chat_kanban_cards.board_id`.

### A.5 Histórico (preparação, não obrigatório na primeira migration)

Para auditoria e “histórico futuro” citado no briefing, reservar **conceito** (tabela na D.3+ ou mesma release se quiser):

- Nome sugerido: `chat_kanban_card_events`  
- Campos típicos: `id`, `tenant_id`, `card_id`, `conversation_id`, `from_column_id`, `to_column_id`, `from_position`, `to_position`, `actor_user_id`, `created_at`, `payload JSONB`.

**D.1:** apenas registado no plano; **D.2** pode criar só as três tabelas base.

### A.6 Relação com `chat_conversations` e isolamento tenant

- **Fonte de verdade** do WhatsApp: `chat_conversations` (inalterada nesta etapa).
- **Inserção de card:** o backend deve validar que a `conversation_id` é **visível** para o utilizador/tenant corrente (mesma lógica que `getConversations` / RLS: dono da conversa com `users.tenant_id` alinhado ao board, ou regra `app.actor_user_id` quando aplicável).
- **Denormalização `tenant_id` em columns/cards:** reduz custo de policy e evita erros ao mover card entre colunas do mesmo board.

**Dúvida eliminada:** o board **deve** ter `tenant_id`; **não** basta só `created_by_user_id` para isolamento multi-tenant.

---

## B. Regras iniciais do módulo (MVP + P1)

| Tema | Decisão |
|------|---------|
| **Uma conversa em vários boards?** | **Sim.** A unicidade é `(board_id, conversation_id)`, não global. |
| **Uma conversa mais de uma vez no mesmo board?** | **Não.** Violaria `UNIQUE (board_id, conversation_id)`. |
| **Cliente/lead obrigatório?** | **Não.** Card aponta só para `conversation_id`; `client_id`/`lead_id` podem ser nulos na conversa. |
| **Mover coluna altera CRM?** | **Não (P1).** Não atualiza `clients.funnel_stage`, não cria oportunidade, não força vínculo. |
| **Conversa com atendimento encerrado (`attendance_status = closed`)?** | Card **permanece** no board no MVP; filtros na UI podem ocultar (futuro). Não há remoção automática na D.1/D.2. |
| **Conversa apagada (hard delete)?** | `ON DELETE CASCADE` em `chat_kanban_cards` remove o card. |
| **Board arquivado** | `archived_at` preenchido → não listar por defeito; cards permanecem até política de purge (futuro). |
| **Coluna removida com cards** | **Decisão para D.2:** ou bloquear delete com cards, ou mover para coluna “Caixa de entrada” / primeira coluna em transação — a implementação escolhe uma estratégia e documenta na migration. |

---

## C. ADR curto

### ADR-001 — Módulo Kanban de conversas em `/chat/kanbam`

**Status:** Aceite (Etapa D.1).  
**Data:** 2026-04-08.

#### Contexto

- O produto precisa de uma **visão Kanban operacional/comercial** sobre conversas WhatsApp, **separada** da lista tradicional em `/chat`.
- O CRM já tem funil (`sales_funnels` / `funnel_stages`), mas **não** se pretende, nesta fase, que mover um card altere o estado do funil ou do cliente.
- A conversa já é a unidade correta para mensagens, atendimento e identidade do canal.

#### Decisão

1. **Novo módulo** com rota **`/chat/kanbam`** (UI e API dedicadas mais tarde), **sem** alterar `Chat.tsx` nem embutir Kanban na experiência atual de `/chat`.
2. **Arquitetura híbrida:** camada nova (`chat_kanban_*`) com **card = `chat_conversations.id`**; colunas são do board; **opcionalmente** no futuro `funnel_stage_id` / `linked_sales_funnel_id` para mapeamento, **sem comportamento** ligado ao CRM nesta fase.
3. **Política P1:** movimentação de cards **não** dispara atualização automática de funil, leads ou clientes.
4. **Multi-tenant:** boards (e colunas/cards com `tenant_id` denormalizado) isolados por `tenant_id`; validação cruzada com visibilidade de `chat_conversations`.
5. **Múltiplos boards** por tenant; ordenação de colunas e de cards dentro da coluna com campos explícitos.

#### Consequências

- **Positivas:** clareza conceitual, sem duplicar “cliente como card”; alinhamento com WebSocket e APIs de conversa existentes; evolução futura para sync opcional com funil sem reboco no modelo P1.
- **Negativas / custo:** três tabelas novas + RLS + endpoints; denormalização `tenant_id`/`board_id` exige disciplina na escrita; exclusão de colunas com cards precisa regra explícita na D.2.

#### Fora de escopo desta etapa (e das entregas imediatas seguintes até decisão explícita)

- Migrations aplicadas, rotas, UI, drag-and-drop, integração automática com funil, WebSocket específico de Kanban, permissões finas além do módulo `chat`.

#### Próxima etapa

- Ver **§ D** abaixo (Etapa D.2).

---

## D. O que entra na Etapa D.2 (executável, ainda não implementar aqui)

1. **Migrations SQL** criando `chat_kanban_boards`, `chat_kanban_columns`, `chat_kanban_cards` com FKs, `UNIQUE (board_id, conversation_id)`, `UNIQUE (board_id, position)` em colunas, índices listados em A.2–A.4.
2. **RLS** nas três tabelas, alinhado a `app.current_tenant_id()` (e padrões do projeto para `users.tenant_id`); políticas separadas SELECT/INSERT/UPDATE/DELETE conforme `97_rls_chat_app_actor_visibility.sql` / `57_rls_tenant_isolation.sql`.
3. **Backend — CRUD mínimo** (novo router ou prefixo sob `/api/chat/kanban` ou `/api/chat-kanban`, a decidir na D.2): criar/editar/arquivar board; criar/editar/reordenar colunas; criar/remover card; mover card entre colunas (atualizar `column_id` + `position`) — **sem** DnD na UI ainda, apenas API testável.
4. **Validação servidor:** ao criar/mover card, garantir `column.board_id = card.board_id`, `board.tenant_id` coerente, e `conversation_id` acessível ao tenant (mesma regra conceitual que listagem de conversas).
5. **Nenhuma** alteração a `clients`, `leads`, `sales_funnels`, `funnel_stages`, `Chat.tsx`, ou contratos existentes de listagem de chat além do necessário para importar validações compartilhadas (se houver helper).

---

## Referência cruzada

- Plano macro: `docs/app/PLANO_MODULO_CHAT_KANBAM.md`  
- Esta entrega fecha **D.1** e define o alvo de **D.2**.
