# SPRINT F4a — Backend API Agregada de Conversas

| Campo | Valor |
|---|---|
| **Sprint** | F4a (backend only) |
| **Data** | 2026-07-08 |
| **Status** | Entregue — flag OFF por default; frontend inalterado |
| **Auditoria** | [`AUDIT_F4_AGGREGATED_CONVERSATIONS_API.md`](./AUDIT_F4_AGGREGATED_CONVERSATIONS_API.md) |

---

## 1. Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `packages/backend/src/controllers/chatController.ts` | Early return agregado (flag ON); hook shadow antes de `res.json` legado |
| `packages/backend/src/services/chatAggregatedConversations/featureFlags.ts` | **Novo** — flags env |
| `packages/backend/src/services/chatAggregatedConversations/types.ts` | **Novo** — contratos |
| `packages/backend/src/services/chatAggregatedConversations/request.ts` | **Novo** — parse query + shadow mapping |
| `packages/backend/src/services/chatAggregatedConversations/cursor.ts` | **Novo** — keyset cursor |
| `packages/backend/src/services/chatAggregatedConversations/queryBuilder.ts` | **Novo** — SQL agregado |
| `packages/backend/src/services/chatAggregatedConversations/rowMapper.ts` | **Novo** — `view=list` / `view=full` |
| `packages/backend/src/services/chatAggregatedConversations/listService.ts` | **Novo** — execução + tags batch |
| `packages/backend/src/services/chatAggregatedConversations/shadowMetrics.ts` | **Novo** — métricas comparativas |
| `packages/backend/src/services/chatAggregatedConversations/shadowCompare.ts` | **Novo** — shadow mode |
| `packages/backend/src/services/chatAggregatedConversations/index.ts` | **Novo** — exports |
| `packages/backend/src/services/chatAggregatedConversations/chatAggregatedConversations.test.ts` | **Novo** — 10 testes unitários |

**Não alterado:** frontend, Chat Core, React Query, providers, UX.

---

## 2. Consulta SQL final (resumo)

Módulo: `buildAggregatedConversationsQuery()` em `queryBuilder.ts`.

```sql
SELECT
  c.id, c.instance_id, c.provider, …,
  COALESCE(c.last_message_at, c.created_at) AS effective_last_message_at  -- view=list (rápido)
  -- view=full + parityMode: subquery MAX(chat_messages) igual legado
FROM chat_conversations c
LEFT JOIN chat_instances i ON …
LEFT JOIN whatsapp_official_accounts wa ON …
[LEFT JOIN clients, leads, LATERAL communication_contacts — view=full parity]
WHERE (owner OR tenant peers)
  AND official_visibility
  AND c.instance_id = ANY($instanceIds::uuid[])   -- multi-instância
  [attendanceFilter, search, status, dates, unreadOnly, tagIds, queue, team, assignee]
  [keyset cursor — sem OFFSET]
ORDER BY
  inbox_pinned DESC,                               -- fixados (metadata)
  CASE priority … END | unread_count DESC | SLA cols | last_message_at DESC,
  c.id DESC
LIMIT $limit + 1
```

**Pós-query:** batch tags `chat_kanban_tags` (1 SQL adicional, igual legado).

---

## 3. Arquitetura da nova API

```
GET /api/chat/conversations
  │
  ├─ CHAT_AGGREGATED_CONVERSATIONS=OFF (default)
  │     └─ fluxo legado 100% inalterado
  │
  ├─ CHAT_AGGREGATED_CONVERSATIONS=ON + instanceIds[] | apiVersion=2
  │     └─ listAggregatedConversations()
  │           ├─ view=list  → payload mínimo
  │           ├─ view=full  → paridade legado
  │           └─ apiVersion=2 → envelope { items, meta }
  │
  └─ CHAT_AGGREGATED_API_SHADOW=1 (qualquer tráfego legado com instanceId)
        └─ responde legado + runAggregatedShadowCompare() async
```

### Parâmetros novos (opt-in)

| Parâmetro | Descrição |
|---|---|
| `instanceIds` | CSV UUIDs — substitui N chamadas |
| `apiVersion=2` | Envelope com `meta` |
| `view=list` \| `full` | Tier de payload |
| `sort` | `last_message_at`, `priority`, `unread`, `sla`, `pinned` |
| `cursor` | Keyset base64url |
| `limit` | 1–200 (default 200) |
| `unreadOnly`, `tagIds`, `assignedToUserId`, `queueId`, `assignedTeamId` | Filtros adicionais |

---

## 4. Comparação legado × agregado

| Dimensão | Legado (por request) | Agregado F4a |
|---|---|---|
| HTTP (frontend N instâncias) | N | **1** (quando F4b ligar) |
| SQL listagem | 1 × N | **1** |
| SQL tags | 0–1 × N | **0–1** total |
| Merge | Frontend JS | Backend ORDER BY |
| Paginação | LIMIT 200 fixo | LIMIT + **cursor keyset** |
| Payload `view=list` | ~full sempre | **~20 campos** |

---

## 5. Shadow Mode

| Env | Efeito |
|---|---|
| `CHAT_AGGREGATED_API_SHADOW=1` | Após cada GET legado com `instanceId`, executa consulta agregada equivalente em background |

**Garantias:**

- Resposta ao cliente = **sempre legado**
- Divergências registradas em `shadow_divergence` (DEV log)
- Amostras em memória: `getChatAggregatedShadowSamples()`

---

## 6. Shadow Metrics

Registradas por `recordShadowCompareSample()`:

| Métrica | Legado | Agregado | Δ% |
|---|---|---|---|
| Tempo total | `totalMs` | `totalMs` | `totalMsReductionPercent` |
| Tempo consulta SQL | `sqlQueryMs` | `sqlQueryMs` | `sqlQueryMsReductionPercent` |
| Quantidade SQL | `sqlCount` | `sqlCount` | `sqlCountReductionPercent` |
| Payload | `payloadBytes` | `payloadBytes` | `payloadReductionPercent` |
| Serialização | `serializeMs` | `serializeMs` | `serializeMsReductionPercent` |
| Tempo resposta | `responseMs` | `responseMs` | `responseMsReductionPercent` |
| Memória | — | `memoryBytesDelta` | `memoryReductionPercent` |
| CPU | — | `cpuMs` | `cpuReductionPercent` |

Schema: ver §19 da auditoria F4.

---

## 7. Tempo médio

| Métrica | Staging (preencher pós-canário) |
|---|---|
| Legado p50 totalMs | _pendente_ |
| Agregado p50 totalMs | _pendente_ |
| Legado p95 totalMs | _pendente_ |
| Agregado p95 totalMs | _pendente_ |
| Δ% p95 | _pendente_ |

**Gate:** agregado p95 ≤ legado p95 (mesmo escopo).

---

## 8. Payload médio

| view | Estimativa | Medição staging |
|---|---|---|
| `full` | ~2–4 KB/row | _pendente_ |
| `list` | ~0.5–1 KB/row | _pendente_ |
| Redução `list` vs `full` | ~50–75% | _pendente_ |

---

## 9. Compatibilidade

| Critério | Status |
|---|---|
| `instanceId` singular (legado) | ✓ inalterado |
| Resposta array JSON sem `apiVersion` | ✓ inalterado |
| Flag OFF (default) | ✓ zero mudança de comportamento |
| Ordenação legado (`effective_last_message_at`) | ✓ parityMode em shadow/full |
| Filtros attendance/channel/groups | ✓ paridade SQL |
| Frontend / Chat / Float | ✓ não tocados |

---

## 10. Rollback

| Ação | Efeito imediato |
|---|---|
| `CHAT_AGGREGATED_CONVERSATIONS=0` ou unset | Só legado |
| `CHAT_AGGREGATED_API_SHADOW=0` | Desliga comparação |
| Deploy revert | Restaura controller sem early return |

Sem migration. Sem alteração de contrato v1.

---

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Query única mais lenta que N pequenas | Shadow metrics; índices (auditoria §12); `view=list` |
| Divergência row order/ids | Shadow bloqueia cutover; parityMode |
| LIMIT global 200 vs 200×N | Documentado; F6 cursor |
| Flag ON acidental em prod | Default OFF; só `instanceIds`/`apiVersion=2` |

---

## 12. Aprovação para iniciar F4b

| Critério | Status |
|---|---|
| Módulo agregado implementado | ✓ |
| Flag OFF default | ✓ |
| Shadow Mode | ✓ |
| Shadow Metrics | ✓ |
| Cursor keyset (sem OFFSET) | ✓ |
| `view=list` / `view=full` | ✓ |
| 10 testes unitários passando | ✓ |
| Frontend inalterado | ✓ |
| Canário shadow 7 dias staging | **Pendente** |
| p95 shadow ≤ legado | **Pendente** |

**F4b (frontend + `CHAT_AGGREGATED_CONVERSATIONS` no Chat Core)** pode iniciar após canário shadow em staging com gates verdes.

---

## Ativação (somente staging / dev)

```bash
# API agregada (testes manuais — não usada pela UI em F4a)
CHAT_AGGREGATED_CONVERSATIONS=1

# Shadow comparativo (resposta continua legado)
CHAT_AGGREGATED_API_SHADOW=1

# Logs (DEV ou explícito)
CHAT_AGGREGATED_DEV_LOG=1
```

Exemplo:

```
GET /api/chat/conversations?instanceIds=uuid1,uuid2&apiVersion=2&view=list&inboxScope=tenant&limit=50
```

---

*SPRINT F4a — backend agregado. Nenhum consumidor frontend alterado. Divergências shadow nunca chegam ao cliente.*

---

## Addendum F4.1 (2026-07-08)

Ver [`SPRINT_F4_1_AGGREGATED_API_HOTFIX_REPORT.md`](./SPRINT_F4_1_AGGREGATED_API_HOTFIX_REPORT.md).

- API agregada F4.1 suporta **somente UazAPI** (`provider=uazapi`, `meta.provider`).
- `includeWhatsAppOfficial` **deprecated** no caminho agregado — ignorado no SQL; legado GET inalterado.
- WhatsApp Oficial agregado: sprint futura com `channelOrigin=official` / multi-provider.
