# PHASE10B_NORMALIZATION_REPORT — MB-063 / MB-064

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |

## Normalizadores inventariados

| Função | Arquivo | Papel | Calls |
|---|---|---|---|
| `normalizeConversation` | `services/chat.ts` | API/row → `ChatConversation` (idempotente `lead_id\|leadId`) | HTTP client, WS-patch legado, mappers |
| `adaptLegacyConversation` | `domain/adapters.ts` | **Alias** de `normalizeConversation` | mappers |
| `mapLegacyConversationToDomain` | `store/domainMappers.ts` | Conversation → Domain (+ 1× normalize) | inbox, upsert, events |
| `domainConversationToUi` | `store/domainToUi.ts` | Domain → UI (domain CRM wins) | selectors only |
| `mergeChatConversationRealtimePatch` | `ws-patch` + `chatPageHelpers` | merge parcial lista OFF | legado dual |
| `pickConversationPatch` | `eventAppliers.ts` | WS payload → domain | Bridge |

## Contagem

- **Normalizador canônico de row:** 1 (`normalizeConversation`)  
- **Mapper Store:** 1 pair (`mapLegacy` / `domainToUi`)  
- **Aliases:** `adaptLegacyConversation`  

## Double normalization — status

| Fluxo | Antes | Depois |
|---|---|---|
| HTTP link → upsert | normalize + map(normalize) — OK se idempotente | Mantido; idempotência Phase 10A |
| WS Bridge `pickConversationPatch` | `map(adapt(x))` = **2×** | **`map(x)` apenas** |
| Inbox load | normalize in service + map | 1× map após items já normalizados (idempotente) |

## Campos perdidos / sobrescritos (históricos)

| Campo | Problema | Mitigação |
|---|---|---|
| `leadId` | 2º normalize só lia `lead_id` | Idempotência + domain wins em `domainToUi` |
| `contactName` / phone | Camel vs snake | Fallbacks em normalize |
| Preview vs “sem mensagens” | lastMessageAt vs preview orphan | Mesma entidade Store; métrica divergence |

## Regra Phase 10B

> Conversation row: **normalize no máximo uma vez lógica** (segunda passagem deve ser **idempotente**).  
> Domain: **um** `mapLegacyConversationToDomain` por write.
