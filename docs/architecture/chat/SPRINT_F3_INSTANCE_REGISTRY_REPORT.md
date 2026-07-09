# SPRINT F3 — Instance Registry + Unread Engine

| Campo | Valor |
|---|---|
| **Sprint** | F3 — Registry + contadores |
| **Data** | 2026-07-08 |
| **Status** | Implementada — **flags OFF por default** |
| **Master Plan** | [`CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md`](../CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md) §F3 |

---

## 1. Objetivo

Eliminar consultas redundantes de `listInstances` e `attendance-counts`, centralizando instâncias no **Instance Registry** e contadores no **Unread Engine**, com HTTP apenas em reconcile explícito.

---

## 2. Arquivos criados

| Módulo | Arquivos |
|---|---|
| `instance-registry/` | `registry.ts`, `helpers.ts`, `index.ts` |
| `unread-engine/` | `engine.ts`, `index.ts` |
| `reconcile/` | `types.ts`, `coordinator.ts`, `index.ts` |
| `runtime/` | `bootstrap.ts`, `index.ts` |
| Testes | `chat-core.f3.test.ts` |
| Docs | este relatório |

---

## 3. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `feature-flags.ts` | Sub-flags `CHAT_UNREAD_ENGINE`, `CHAT_ATTENDANCE_RECONCILE` |
| `index.ts` | Exports F3 / runtime |
| `FloatingChatProvider.tsx` | `ensureChatInstances` |
| `FloatingConversationWindow.tsx` | Registry em `connected-instances` |
| `MobileConversationOverlay.tsx` | Idem |
| `useChatNavUnreadCount.ts` | Unread Engine + sem HTTP por WS |
| `Chat.tsx` | Registry + reconcile attendance |
| `ClientProfile.tsx` | Registry |
| `Leads.tsx` | Registry |
| `EmbeddedLeadConversationPanel.tsx` | Registry |
| `entityQuickViewChat.ts` | Registry |
| `lib/chatPrefetch.ts` | Registry + `fetchChatAttendanceCounts` |
| `README.md` | Seção F3 |

---

## 4. Arquitetura — Instance Registry

```
Consumidores (Chat, Float, Nav, Lead, Client, prefetch)
        │
        ▼
 ensureChatInstances()  ──flag OFF──► chatService.listInstances() (legado)
        │
        │ flag ON
        ▼
┌───────────────────────────────┐
│ ChatInstanceRegistry (singleton)│
│ • cache TTL 2min                │
│ • dedupe in-flight              │
│ • WS: channel.status_changed    │
│ • WS: whatsapp.instance_removed │
│ • invalidate em session change  │
└───────────────────────────────┘
        │
        ▼
   HTTP GET /api/chat/instances (reconcile apenas)
```

---

## 5. Arquitetura — Unread Engine

```
WS message.created / conversation.updated
        │
        ▼
 applyChatUnread*()  ──incremental──► counts.unread (+ per-conversation map)
        │
        │ reconcile explícito
        ▼
┌───────────────────────────────┐
│ ChatUnreadEngine (singleton)    │
│ • queue / mine / team / unread  │
│ • periodic reconcile 120s       │
│   (ATTENDANCE_RECONCILE ON)     │
└───────────────────────────────┘
        │
        ▼
 HTTP GET attendance-counts (bootstrap | reconnect | periodic | dirty)
```

---

## 6. Componentes migrados

| Componente | Registry | Unread Engine |
|---|---|---|
| `FloatingChatProvider` | ✓ | — |
| `FloatingConversationWindow` | ✓ (`connected-instances`) | — |
| `MobileConversationOverlay` | ✓ | — |
| `useChatNavUnreadCount` (Sidebar nav) | ✓ | ✓ |
| `Chat.tsx` | ✓ | ✓ (attendance panel) |
| `ClientProfile.tsx` | ✓ | — |
| `Leads.tsx` | ✓ | — |
| `EmbeddedLeadConversationPanel` | ✓ | — |
| `entityQuickViewChat.ts` | ✓ | — |
| `lib/chatPrefetch.ts` | ✓ | ✓ |

---

## 7. Componentes ainda legados

| Componente | Motivo |
|---|---|
| `components/whatsapp/InstancesList.tsx` | Tela de gestão de instâncias — requer lista fresca pós-ações admin |
| `InstancesList` connect/disconnect | Mutação local + refresh explícito necessário |
| Kanban `refreshCards()` | Estado local do board — fora do escopo F3 |
| Buckets queue/mine/team sem reconcile | Incremental WS não traz agregados — depende `ATTENDANCE_RECONCILE` |

---

## 8. Chamadas `listInstances` eliminadas (flags ON)

Por sessão típica (antes → depois):

| Fluxo | Antes | Depois (registry ON) |
|---|---|---|
| Float Provider + Window + Overlay | 3+ GET | **1** GET (cache 2min) |
| Nav unread refresh | 1 GET + attendance | **0** GET instância (cache) |
| Chat loadInstances | 1 GET | **0** se cache quente |
| Client Profile + Lead embed | 2 GET | **0** se cache quente |
| Prefetch idle | 1 GET | compartilha cache registry |

---

## 9. Chamadas `attendance-counts` eliminadas (flags ON)

| Gatilho | Antes | Depois (UNREAD + RECONCILE ON) |
|---|---|---|
| Cada `message.created` (nav) | HTTP debounced | **0** — incremental |
| Cada `conversation.updated` | HTTP debounced | **0** — `unread_count` no payload |
| `conversation_attendance_updated` | HTTP imediato | **debounced reconcile** (2s) |
| Poll 120s | HTTP | **1** reconcile periódico |
| Bootstrap / login / F5 | HTTP | **1** reconcile |

---

## 10. Comparação HTTP (estimativa sessão 30min, usuário ativo)

| Métrica | Pré-F3 | F3 flags ON |
|---|---|---|
| `listInstances` | 15–40 | 1–3 |
| `attendance-counts` | 50–200+ | 3–8 |
| HTTP por mensagem recebida | 1–2 | **0** |

---

## 11. Estratégia de reconcile

HTTP permitido **somente** quando `requestChatReconcile` dispara com motivo:

| Motivo | Escopo |
|---|---|
| `bootstrap` / `login` / `prefetch` | instances + attendance |
| `cache_expired` | ambos (TTL registry 2min; unread 120s) |
| `network_online` / `tab_visible` | ambos |
| `attendance_ws_dirty` | attendance (debounce 2s) |
| `inconsistency` | ambos (ex.: instance_removed) |

**Nunca** por mensagem recebida diretamente.

---

## 12. Estratégia de rollback

| Flag | Rollback |
|---|---|
| `VITE_CHAT_FF_INSTANCE_REGISTRY=0` | `ensureChatInstances` → `chatService.listInstances` direto |
| `VITE_CHAT_FF_UNREAD_ENGINE=0` | Nav/Chat voltam a HTTP em eventos WS |
| `VITE_CHAT_FF_ATTENDANCE_RECONCILE=0` | Poll legado 120s no nav unread |

Flags independentes — rollback parcial suportado.

---

## 13. Riscos encontrados

| Risco | Mitigação |
|---|---|
| Buckets queue/mine/team sem payload WS | Reconcile periódico + `attendance_ws_dirty` |
| Registry stale após connect QR fora do Chat | `channel.status_changed` + invalidate |
| UNREAD sem RECONCILE — só unread global incremental | Documentado; ligar RECONCILE para buckets |
| `InstancesList` admin não migrado | Intencional — fallback legado |

---

## 15. Métricas de performance (F3)

Instrumentação comparativa em `metrics/baseline.ts` — sem alteração funcional.

| Métrica | Origem |
|---|---|
| `listInstances` evitadas / executadas | Instance Registry (cache TTL, dedupe in-flight) |
| `attendance-counts` evitadas / executadas | Unread Engine (cache, WS incremental, `ws_unread_count`) |
| Percentual de redução HTTP | Agregado por endpoint e overall |
| Reconciles executados / evitados | Registry + Unread (cache, in-flight dedupe, debounce) |
| Tempo médio entre reconciles | Timestamps de `recordChatF3ReconcileExecuted` |

**API:** `getChatF3PerformanceStatistics()` — incluído em `getChatBaselineSnapshot().f3PerformanceStatistics`.

**Logs:** somente com `VITE_CHAT_CORE_METRICS=1` (prefixo `[chat-core-metrics] f3_perf`).

---

## 16. Aprovação para início da F4

| Critério | Status |
|---|---|
| Registry singleton implementado | ✓ |
| Unread Engine implementado | ✓ |
| Flags OFF default | ✓ |
| Consumidores principais migrados | ✓ |
| Fallback legado preservado | ✓ |
| 24 testes chat-core passando | ✓ |
| Métricas F3 (`getChatF3PerformanceStatistics`) | ✓ |
| Canário F3 em staging | **Pendente** |

**F4 (API lista agregada)** pode ser **planejada** em paralelo. **Implementação F4** recomendada após canário F3 com as três flags validadas em staging.

---

*SPRINT F3 — deduplicação de instâncias e contadores. Sem alteração de UX, API ou WebSocket.*
