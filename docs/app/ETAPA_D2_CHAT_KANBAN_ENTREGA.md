# Etapa D.2 — Entrega: migrations + RLS + backend base (`/chat/kanbam`)

**Escopo:** apenas backend e SQL; sem UI, sem `Chat.tsx`, sem sync com funil (P1).

## 1. Migrations

**Ficheiro:** `database/init/99_chat_kanban_etapa_d2.sql`

- Tabelas: `chat_kanban_boards`, `chat_kanban_columns`, `chat_kanban_cards`
- FKs: `tenant_id` → `tenants`; `board_id` / `column_id` / `conversation_id` conforme D.1
- `chat_kanban_cards.column_id` → `ON DELETE RESTRICT` (**bloqueia** apagar coluna com cards)
- `UNIQUE (board_id, position)` em colunas; `UNIQUE (board_id, conversation_id)` em cards
- Triggers `updated_at` (função existente `update_updated_at_column`)
- RLS nas três tabelas: políticas separadas SELECT / INSERT / UPDATE / DELETE com `app_tenant_visible` / `app_current_tenant_id` / `app_can_bypass_rls`

**Aplicar:** executar o script no Postgres da mesma forma que os outros ficheiros em `database/init/` (processo do projeto).

## 2. Backend

| Ficheiro | Função |
|----------|--------|
| `packages/backend/src/controllers/chatKanbanController.ts` | CRUD + validações + `conversationVisibleToTenantUser` (alinhado a inbox tenant do chat) |
| `packages/backend/src/routes/chatKanbanRoutes.ts` | Rotas montadas com `tenantAuthCrm` + `requireFeature('chat')` |
| `packages/backend/src/index.ts` | `app.use('/api/chat/kanban', chatKanbanRoutes)` |
| `packages/backend/src/utils/tenantSecurity.ts` | Inclusão das três tabelas na lista tenant-scoped (warnings dev) |

## 3. Prefixo das rotas

**Base:** ` /api/chat/kanban`

Exemplos:

- `GET /api/chat/kanban/boards` — `?includeArchived=true` opcional
- `POST /api/chat/kanban/boards`
- `GET /api/chat/kanban/boards/:boardId`
- `PATCH /api/chat/kanban/boards/:boardId` — arquivar: body `{ "archived_at": "2026-04-08T12:00:00.000Z" }` ou `null` para reativar
- `GET /api/chat/kanban/boards/:boardId/columns`
- `POST /api/chat/kanban/boards/:boardId/columns`
- `PATCH /api/chat/kanban/columns/:columnId`
- `DELETE /api/chat/kanban/columns/:columnId` — **409** se existir card na coluna
- `POST /api/chat/kanban/boards/:boardId/columns/reorder` — body `{ "column_ids": ["uuid", ...] }` (permutação completa)
- `GET /api/chat/kanban/boards/:boardId/cards` — `?includeArchived=true` opcional
- `POST /api/chat/kanban/boards/:boardId/cards` — body `{ "conversation_id", "column_id", "position?" }`
- `PATCH /api/chat/kanban/cards/:cardId` — mover/reordenar: `{ "column_id?", "position?", "metadata?", "archived_at?" }`
- `DELETE /api/chat/kanban/cards/:cardId`

**Auth:** mesmo JWT e cadeia que `/api/chat` (tenant + plano + feature `chat`).

## 4. Estratégia de `position`

- **Colunas:** `INTEGER` com `UNIQUE (board_id, position)` — simples e previsível.
- **Cards:** `DOUBLE PRECISION` — **fractional indexing**: novos cards recebem `MAX(position)+1` na coluna; permite inserir valores entre dois no futuro sem renumerar toda a coluna.

## 5. Regra de exclusão de coluna

- Contagem de `chat_kanban_cards` por `column_id`; se **> 0**, resposta **409** e mensagem explícita.
- À base de dados: `ON DELETE RESTRICT` na FK `cards.column_id` como segunda linha de defesa.

## 6. Checklist de validação manual

1. Aplicar `99_chat_kanban_etapa_d2.sql` na BD de desenvolvimento.
2. Obter token de um utilizador com `tenant_id` e feature `chat`.
3. `POST /api/chat/kanban/boards` com `{ "name": "Teste" }` → 201.
4. `POST .../boards/:id/columns` com `{ "name": "Novo" }` → 201.
5. `POST .../boards/:id/cards` com `conversation_id` de conversa **do mesmo tenant** (visível na regra tenant) → 201.
6. Repetir o mesmo `conversation_id` no mesmo board → **409**.
7. `PATCH .../cards/:id` com `column_id` de **outro** board → **400**.
8. `DELETE .../columns/:id` com card na coluna → **409**; apagar card; depois `DELETE` coluna → **204**.
9. `PATCH .../boards/:id` com `archived_at` ISO → board deixa de aparecer em `GET /boards` sem `includeArchived`.

## 7. O que não foi feito (conforme pedido)

- Frontend, rota React `/chat/kanbam`, DnD, WebSocket Kanban, `chat_kanban_card_events`, permissões finas, alterações a `getConversations` / funil / `Chat.tsx`.
