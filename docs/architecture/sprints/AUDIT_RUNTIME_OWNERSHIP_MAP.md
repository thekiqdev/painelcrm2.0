# AUDIT_RUNTIME_OWNERSHIP_MAP — AUD-101

| Campo | Valor |
|---|---|
| **Auditoria** | Phase 10C — Runtime Ownership Unification |
| **Data** | 2026-07-14 |
| **Tipo** | Investigation only — código não alterado |

Contexto de flags (defaults catalog OFF / ambiente DEP): ownership “oficial” declarado na doc ≠ ownership real de leitura/escrita na UI.

---

## Instance

| Dimensão | Valor real |
|---|---|
| **Owner oficial declarado** | Instance Registry (flag `CHAT_INSTANCE_REGISTRY`) + HTTP cache |
| **Quem escreve** | `ensureChatInstances` / `reconcileChatInstances` → `chatService.listInstances` → `listInstancesSingleFlight`; mutações `patchInstance` invalidam HTTP cache; Chat `setInstances`; Floating `setInstanceIds` |
| **Quem lê (UI)** | Chat: `useState(instances)` + `enabledInstanceIds`; Floating: `instanceIds` no Provider; Window picker: RQ `connected-instances`; Store slice `instances` = **sombra** (pouco lido pela UI) |
| **Normaliza** | Resposta API instance (serviço chat) |
| **Sincroniza** | Login reconcile; patch instance; remoção WS → invalidate registry |
| **Invalida** | `invalidateChatInstanceRegistry`, reset HTTP cache no logout |
| **Cache** | `chatInstancesHttpCache` (TTL sessão 24h); Registry TTL ~2 min |
| **Estado próprio** | **Sim** — Chat local + Float local + Registry + HTTP cache + Store shadow |

---

## Conversation

| Dimensão | Valor real |
|---|---|
| **Owner oficial (Store ON)** | Domain Store `conversations` |
| **Quem escreve** | `loadInboxCommand`; `applyStoreConversationUpsert` / PartialPatch / UiUpdate / Remove; Socket Bridge → upsert |
| **Quem lê** | Chat/Float **lista**: selectors Store; Floating **header**: RQ `conversation-meta` (**paralelo**); Store OFF: Chat `useState` + Float RQ lists |
| **Normaliza** | `normalizeConversation` → `mapLegacyConversationToDomain` |
| **Sincroniza** | Inbox HTTP; Socket `conversation.*`; CRM link/archive |
| **Invalida** | clearInbox; delete; filter remap via loadInbox |
| **Cache** | Store in-memory; RQ Float meta/lists (OFF ou meta ON); page cache IndexedDB (warm, não SoT) |
| **Estado próprio** | Meta Float RQ; Chat local OFF; Kanban `conv_*` DTO |

---

## Messages

| Dimensão | Valor real |
|---|---|
| **Owner oficial (Store ON)** | Domain Store `messages` |
| **Quem escreve** | `loadMessagesCommand` → `applyStoreMessagesInternal`; Socket `appendMessage`; optimistic outbound |
| **Quem lê** | Chat: `useChatMessages` / `messagesView`; Floating: `useFloatingConversationMessages` (Store ON / RQ OFF) |
| **Normaliza** | `normalizeChatMessage` / `mapLegacyMessageToDomain` |
| **Sincroniza** | Open thread hydrate (latest page); Socket message.created; syncConversationMessages |
| **Invalida** | Generation race em loadMessages; RQ invalidate só Store OFF |
| **Cache** | Store; RQ `['floating-chat','messages',id]` (OFF); page cache Chat |
| **Estado próprio** | Chat `useState(messages)` OFF; RQ Float OFF |

---

## Selection

| Dimensão | Valor real |
|---|---|
| **Owner** | `selectedConversationId` = **React local** (`useState` Chat; panels Float) |
| **Store** | `selection.selectedConversationId` espelhado por `useChatSelection` effect |
| **Estado próprio** | **Sim** — ID de seleção é UI local |

---

## Preview (`lastMessagePreview` / `lastMessageAt`)

| Dimensão | Valor real |
|---|---|
| **Owner** | **Conversation row**, não Messages slice |
| **Quem escreve** | Inbox hydrate; Socket `conversation.updated` upsert; outbound bump; WS-patch listas OFF; message.created float OFF lista |
| **Quem lê** | Lista Chat/Float (conversation fields) |
| **Nota** | `messages/append` **não** atualiza preview no reducer |

---

## Header

| Superfície | Owner real |
|---|---|
| Chat | `selectedConversation` (Store/selection) + identity CRM (`currentLead`/`currentClient` local) |
| Floating Window | RQ `conversation-meta` + `useFloatingConversationIdentity` + CRM profile RQ |

---

## CRM (lead/client link)

| Dimensão | Valor real |
|---|---|
| **Escrita Store ON** | Upsert / PartialPatch Conversation |
| **Leitura perfil detalhe** | GET profile → `currentLead`/`currentClient` **local** (Chat) |
| **Float** | Meta RQ + Store patch coexistente |

---

## Unread

| Dimensão | Valor real |
|---|---|
| **Owner** | Unread engine (F3) ± Conversation.unreadCount ± attendance counts HTTP |
| **UI nav** | `useChatNavUnreadCount` → engine |

---

## Attendance

| Dimensão | Valor real |
|---|---|
| **Owner campos conversa** | Conversation Store (attendance_*, assignee_*) |
| **Counts agregados** | Unread engine / `fetchChatAttendanceCounts` (HTTP pontual) |
| **Kanban** | Socket → `listCards` refresh (GET board) |

---

## Resumo owners

| Entidade | Único owner real? |
|---|---|
| Instance | **Não** |
| Conversation | **Quase** (Store ON lista); header Float meta = paralelo |
| Messages | **Quase** (Store ON thread) |
| Selection | **Não** (ID local) |
| Preview | Conversation row (não Messages) |
| Header Float | RQ meta |
| Unread | Engine (+ campos conversa) |
