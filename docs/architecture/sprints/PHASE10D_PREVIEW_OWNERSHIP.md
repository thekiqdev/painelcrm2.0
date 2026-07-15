# PHASE10D_PREVIEW_OWNERSHIP — MB-081

| Campo | Valor |
|---|---|
| **Data** | 2026-07-15 |
| **Investigation + wiring** | Phase 10D |

## Quem escreve Preview (antes → depois)

| Writer | Antes | Depois (Store ON) |
|---|---|---|
| Inbox HTTP `loadInboxCommand` | lastMessage* na row | Mantém até thread hydrated |
| Socket `conversation.updated` | upsert preview | Se thread hydrated → **Messages vencem** |
| Socket `message.created` | só appendMessage (preview órfão) | append → **sync Preview** |
| Chat `new_message` + setConversations | preview via UI bridge | Também; Store append sincroniza |
| WS-patch RQ Float (OFF / legado) | `buildPreviewFromMessage` em lists | Inalterado (flag OFF) |
| Optimistic send | appendMessage | append → sync Preview |
| `loadMessagesCommand` / setMessages | não tocava preview | hydrate → **rebuild Preview** |
| `applyStoreConversationUpsert` / PartialPatch | podia setar preview CRM | Upsert com thread → Messages vencem preview fields |

## Quem lê

| Leitor | Campo |
|---|---|
| Lista Chat / Float | `lastMessagePreview` / `lastMessageAt` via selectors |
| `selectConversationPreview` | mesmos campos |
| domainToUi | domain + raw (raw também patchado no sync) |

## Quem sobrescreve

Após hydrate / append: **somente** `syncConversationPreviewFromMessages`.

## Quem deriva

`derivePreviewTextFromDomainMessage` + `pickLastDomainMessage` em `previewFromMessages.ts`.
