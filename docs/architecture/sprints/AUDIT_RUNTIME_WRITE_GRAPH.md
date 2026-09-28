# AUDIT_RUNTIME_WRITE_GRAPH — AUD-103

| Campo | Valor |
|---|---|
| **Auditoria** | Phase 10C |
| **Data** | 2026-07-14 |

Para cada escrita: origem → normalize/mapper → Store? → selector → UI

---

## Inventory

| Write | Origem | Normalize / mapper | Store | UI |
|---|---|---|---|---|
| Inbox hydrate | HTTP GET conversations | normalize + mapLegacy | `loadInboxCommand` → setConversations | Lista Chat/Float |
| Open thread | HTTP messages page | mapLegacyMessage | `loadMessagesCommand` | Thread |
| Socket `message.created` | WS Bridge | message mapper | **appendMessage only** | Thread (se aberto/hydrated) |
| Socket `conversation.updated` | WS Bridge | mapLegacy (1×) | conversations upsert | Lista preview/CRM fields |
| Socket attendance | WS Bridge / Chat handler | patch fields | upsert / UiUpdate | Badges |
| CRM link / lead / client | HTTP link | normalize (idempotente) | Upsert / PartialPatch | Lista + CRM |
| Archive | HTTP | upsert patched | Upsert / UiUpdate | Filtro archived |
| Transfer | HTTP bridge | (muitas vezes reload inbox) | via attendance events / loadInbox | Lista |
| Sync conversa | HTTP sync | upsert conversation se retornada | Upsert | Lista + thread reload messages |
| Delete | HTTP + event | remove | Remove | Lista |
| Tags | HTTP | patch tags on row | Upsert / UiUpdate | Perfil |
| Unread mark-read | HTTP | unread 0 patch | Upsert / engine | Badges |
| Outbound send | HTTP send + optimistic | append + bump preview | Store messages + UiUpdate lista | Thread + preview |
| Instance patch | HTTP | — | HTTP cache invalidade; Chat setState; Registry | Sidebar instances |
| Floating CRM | HTTP link | PartialPatch + RQ meta setQueryData | Store + **RQ meta** | Header Float |
| Kanban attendance WS | Socket | — | **Não Store** → GET `listCards` | Board |

---

## Writes que **não** passam pela Conversation/Message Store

| Write | Path paralelo |
|---|---|
| Float header CRM patch (parte) | RQ `setQueryData` meta |
| Kanban board refresh | HTTP listCards |
| Chat CRM profile detail | `currentLead`/`currentClient` setState |
| Instance UI | Chat/Float local state |
| Store OFF tudo | Local / RQ |

---

## Socket write completeness (Store ON)

| Evento | Conversation | Messages | Preview |
|---|---|---|---|
| `message.created` | Não (só messages append) | **Sim** append | **Não** no mesmo reducer |
| `conversation.updated` | **Sim** upsert | Não | **Sim** se payload trouxer |
| attendance updated | **Sim** campos | Não | Não |

**Implicação:** Preview pode avançar via `conversation.updated` sem thread hydrate; thread pode receber append sem atualizar preview até outro evento.
