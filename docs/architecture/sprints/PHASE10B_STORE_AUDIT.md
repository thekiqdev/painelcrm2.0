# PHASE10B_STORE_AUDIT — MB-062 / MB-065–067

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |

## Inventário de campos → fonte (Store ON)

| Campo | Fonte canônica | Consumidores UI |
|---|---|---|
| `id` | Store | Chat, Floating list, CRM |
| `instance_id` / instanceId | Store | filtros, envio |
| `external_chat_id` | Store.raw | perfil, grupos |
| `phoneNumber` | Store | composer, CRM |
| `leadId` | Store (domain + raw sync) | CRM actions, badges |
| `client_id` | Store | CRM, fatura |
| `tags` | Store.raw / UI tags state (kanban tags conversa) | perfil |
| `wa_archived` | Store | filtro archived |
| `attendance_*` / assignee | Store | badges, transfer |
| `lastMessagePreview` | Store | lista preview |
| `lastMessageAt` | Store | ordenação / “sem recentes” |
| `unreadCount` | Store + unread engine | badges |
| `avatarUrl` / name | Store.raw + identity helpers | header/avatar |
| Kanban `conv_*` | **Kanban API** (DUPLICATE SOURCE residual) | board cards |

## Fontes duplicadas classificadas

| Local | Classe | Ação 10B |
|---|---|---|
| Chat `useState(conversations)` com SoT ON | DUPLICATE (era no-op write) | Writes reencaminhados à Store |
| Floating RQ lista com Store ON | Off (query disabled) | Keep |
| Floating `conversation-meta` RQ | DUPLICATE read (header) | Write CRM → Store; read meta residual |
| Chat bumps só `setConversations` | DUPLICATE dead | Fix via bridge |
| Kanban `conv_*` | DUPLICATE projection | Documentado; fora Conversation Store |

## Selectors (MB-067)

| Selector / hook | Lê Store? |
|---|---|
| `useChatConversationList` | Sim (ON) |
| `useChatSelection` | Sim |
| `useFloatingConversationListData` | Sim (ON) |
| Floating meta `useQuery` | RQ (residual) |
| Kanban cards state | Local board DTO |

## Escrita única (Store ON)

Permitido alterar Conversation:

- `loadInboxCommand` / clear  
- `applyStoreConversationUpsert` / `PartialPatch` / `Remove` / `UiUpdate`  
- Socket → `syncStoreFromSocketEvent`  

Proibido (e corrigido quando possível): UI setState local de lista / RQ list patch como SoT.
