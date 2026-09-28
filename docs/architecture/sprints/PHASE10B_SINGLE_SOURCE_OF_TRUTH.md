# PHASE10B_SINGLE_SOURCE_OF_TRUTH — MB-075

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **SoT oficial (flag ON)** | Chat Domain Store — fatia `conversations` |

---

## Quem pode **alterar** Conversation?

| Ator | API |
|---|---|
| Inbox hydrate | `loadInboxCommand` / `clearInboxCommand` |
| CRM / archive / bumps UI | `applyStoreConversationUpsert` · `PartialPatch` · `UiUpdate` · `Remove` |
| Realtime | Socket Bridge → `syncStoreFromSocketEvent` → upsert/remove |

Ninguém mais (Chat page, Floating, Kanban picker) deve manter SoT própria com flag ON.

## Quem pode **ler**?

| Superfície | Mecanismo |
|---|---|
| Chat lista / seleção | `useChatConversationList` / `useChatSelection` |
| Floating lista | `useFloatingConversationListData` |
| CRM panel Chat | `selectedConversation` derivado da Store |
| Floating header meta | RQ `conversation-meta` (**read cache auxiliar**; writes CRM vão à Store) |

## Quem pode **criar** / **remover**?

| Operação | Path |
|---|---|
| Criar (primeira vez na Store) | hydrate inbox / upsert se inexistente |
| Remover | `applyStoreConversationRemove` / evento deleted |

## Quem pode **normalizar**?

Somente `normalizeConversation` (`@/services/chat`) — única função canônica de row.

## Quem pode **mapear** Domain ↔ UI?

| Direção | Função |
|---|---|
| API → Domain | `mapLegacyConversationToDomain` |
| Domain → UI | `domainConversationToUi` (selectors) |

## Diagrama oficial

```
HTTP / Socket
      │
      ▼
normalizeConversation
      │
      ▼
Conversation Domain Store
      │
      ▼
Selectors
      │
┌─────┼─────┐
▼     ▼     ▼
Chat  Float Kanban-picker*
      │
      ▼
CRM / Profile

* Board Kanban permanece projeção `listCards` (não Conversation Store).
```

## Regra de ouro

> Com `CHAT_CORE_STORE` ON, **qualquer UI de Conversation do Chat/Floating deriva da Store**.  
> Cópias locais de lista são no máximo buffer legado (Store OFF) ou picker efêmero.
