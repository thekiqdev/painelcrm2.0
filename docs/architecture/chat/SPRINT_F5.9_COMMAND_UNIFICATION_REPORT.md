# Sprint F5.9 — Command Unification (Único Pipeline do Chat)

| Campo | Valor |
|---|---|
| **Sprint** | F5.9 |
| **Nome** | Command Unification |
| **Data** | 2026-07-09 |
| **Objetivo** | Eliminar múltiplos loaders/orquestradores de inbox e consolidar um único pipeline |
| **Feature Flag** | `CHAT_CORE_STORE` (mantida) |
| **Impacto funcional** | Nenhum (refatoração arquitetural) |
| **Rollback** | `CHAT_CORE_STORE=OFF` restaura fluxo legado |

---

## Resumo executivo

Consolidado o carregamento de inbox em **um único command**: `loadInboxCommand` (exposto também como `chatCore.commands.loadInbox` / `chatCore.loadInbox()`).

Antes existiam pipelines paralelos (Chat `loadConversations` → `applyStoreConversationList`, Floating `loadInboxCommand` + `syncStoreFromCommandResult`, Bootstrap `repositorySync`). Todos convergiam em `conversations/set` com parâmetros e filtros diferentes, causando concorrência e sobrescritas.

Após F5.9:

```
Repository → loadInboxCommand → Domain Store → selectors → hooks → UI
```

Nenhuma superfície de UI escreve diretamente no Store para inbox.

---

## Arquitetura entregue

```
                Repository (listChatConversations)
                     │
                     ▼
              loadInboxCommand
         (generation guard + dedupe)
                     │
                     ▼
    applyStoreConversationListInternal
                     │
                     ▼
              Domain Store
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
    Chat         Floating        Bootstrap
```

### Escrita permitida (inbox)

| API | Papel |
|---|---|
| `loadInboxCommand(params)` | Único loader oficial |
| `clearInboxCommand()` | Limpa inbox + invalida generation |

### Escrita proibida na UI

| API | Status F5.9 |
|---|---|
| `applyStoreConversationList()` | Removido de `store/public.ts`; `@deprecated`, só testes internos |
| `syncStoreFromCommandResult('listConversations')` | No-op com warn em DEV |
| `dispatch(conversations/set)` direto | Proibido fora do Core |

---

## Arquivos principais

| Arquivo | Mudança |
|---|---|
| `core/loadInbox.ts` | **Novo** — command único, generation guard, empty-wipe guard |
| `core/inboxFetch.ts` | **Novo** — fetch HTTP sem escrita no store |
| `core/commands.ts` | Re-exporta `loadInboxCommand`; `chatCoreCommands.loadInbox` |
| `core/chatCore.ts` | `loadInbox()` delega ao command; phase `F5.9` |
| `store/consolidation.ts` | `applyStoreConversationListInternal()` (interno) |
| `store/public.ts` | Sem export de `applyStoreConversationList` |
| `store/integration.ts` | Bootstrap usa `loadInboxCommand`; listConversations sync obsoleto |
| `pages/Chat.tsx` | `loadConversations` → `loadInboxCommand({ surface: 'chat', ... })` |
| `store/hooks/useFloatingConversationListData.ts` | Mesmo command com `surface: 'float'` |
| `index.ts` | Export público de `loadInboxCommand`, `clearInboxCommand` |

---

## Guards implementados

1. **Generation** — loads concorrentes; apenas o último `loadInboxGeneration` grava no store (`stale: true` nos descartados).
2. **In-flight dedupe** — mesma chave de parâmetros reutiliza a Promise em voo.
3. **Empty wipe** — fetch vazio **não** limpa o store se já há conversas (salvo `allowEmpty: true`). Evita Float ok → Chat zera.
4. **Flag rollback** — com `CHAT_CORE_STORE=OFF`, command retorna dados mas `applied: false`.

---

## Migração por superfície

| Superfície | Antes | Depois |
|---|---|---|
| `/chat` | `loadConversations` + fetch + `applyStoreConversationList` | `loadInboxCommand({ surface: 'chat', ...filtros })` |
| Floating | `loadInboxCommand` + `syncStoreFromCommandResult` | `loadInboxCommand({ surface: 'float', ... })` |
| Bootstrap | `syncStoreFromRepositoryResponse('listConversations')` | `loadInboxCommand({ surface: 'bootstrap', ... })` |
| Refresh | Vários caminhos | Mesmo `loadInboxCommand` |
| Guards vazios | `applyStoreConversationList([])` | `clearInboxCommand()` |

---

## Testes

Arquivo: `store/store.f5.9.command-unification.test.ts` (7 casos)

| Caso | Valida |
|---|---|
| Chat surface | Store hidratado via command |
| Floating surface | Mesmo command |
| Concorrência | Última generation vence |
| Empty fetch | Não apaga store existente |
| `clearInboxCommand` | Limpa store + invalida generation |
| Paridade | Mesmo contexto → mesmo `orderedIds` |
| Rollback | `CHAT_CORE_STORE=OFF` → `applied: false`, store vazio |

Suite `src/features/chat-core/store/`: **95 testes passando**.

---

## Critérios de aceite

| Critério | Status |
|---|---|
| Apenas um pipeline de carregamento | ✅ |
| Apenas uma porta de escrita (inbox) | ✅ |
| Chat e Floating usam o mesmo command | ✅ |
| Bootstrap usa o mesmo command | ✅ |
| Nenhuma superfície escreve diretamente no Store (inbox) | ✅ |
| Guards anti-overwrite (generation + empty) | ✅ |
| Testes verdes | ✅ |
| Rollback via flag | ✅ |
| UX inalterada | ✅ (refatoração) |

---

## Validação manual recomendada

1. Ativar `CHAT_CORE_STORE` no painel Super Admin.
2. Abrir `/chat` — lista lateral deve exibir conversas.
3. Abrir Floating — mesma lista (mesmo tenant/instâncias/filtros).
4. Opcional: `VITE_CHAT_LIST_DIAG=1` — log `[ChatListDiag] loadInboxCommand` com `applied`, `stale`, `count`.
5. Rollback: desligar flag — fluxo legado (`useState` + React Query) intacto.

---

## Fora de escopo (F5.9)

- Backend / API agregada
- WebSocket / patches realtime na lista (`bumpConversationListRow` em `useState` legado)
- Mensagens outbound (`applyStoreMessages` permanece)
- Sidebar, CRM, Kanban
- Remoção física de código legado (tracker F7)

---

## Próximos passos sugeridos

- **F6** — Cursor, load more, virtualização sobre o pipeline unificado
- Migrar patches realtime de lista para upsert no Domain Store
- Novas superfícies (Sidebar, Mobile) devem consumir **somente** `loadInboxCommand` / hooks do store
