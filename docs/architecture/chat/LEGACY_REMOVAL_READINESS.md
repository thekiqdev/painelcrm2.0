# LEGACY_REMOVAL_READINESS — Pós F6.7

| Campo | Valor |
|---|---|
| **Documento** | LEGACY_REMOVAL_READINESS |
| **Data** | 2026-07-13 |
| **Inventário mestre** | [`LEGACY_REMOVAL_TRACKER.md`](./LEGACY_REMOVAL_TRACKER.md) |
| **Certificação F6** | [`AUDIT_F6_PERFORMANCE_CERTIFICATION.md`](./AUDIT_F6_PERFORMANCE_CERTIFICATION.md) |
| **Código removido nesta sprint** | **Nenhum** (audit-only) |

---

## Veredito

### **Pronto para plano de remoção pós-canário — não para delete imediato**

O legado remanescente está **mapeado**, majoritariamente em status **Migrado** (substituto atrás de flag), e serve exclusivamente a **rollback**. A certificação F6 confirma que, com `CHAT_CORE_STORE=ON`, o caminho novo é a SoT nas superfícies Chat + Floating principais.

| Métrica (tracker) | Valor |
|---|---|
| Itens rastreados | 50 |
| **Migrado** | 29 |
| **Ativo** | 21 |
| **Removido** | **0** |

---

## 1. Legado ainda utilizado (por razão)

### A — Rollback estrutural (manter até canário F6+ estável)

| Área | Path legado | Substituto (flag ON) |
|---|---|---|
| Chat list/messages state | `useState` em `Chat.tsx` | `useChatConversationList` / `useChatMessages` |
| Floating list/messages | React Query | hooks store Floating |
| Message virtualization | `@tanstack/react-virtual` (`mode: legacy`) | Message Virtual Engine (`mode: core`) |
| WS patch / invalidate | `tryApplyChatWsPatch` + RQ invalidate | Bridge → `syncStoreFromSocketEvent` |
| Full dump messages | `loadMessagesCommand(..., { latestPage: false })` (Floating) | Latest page + Load More (Chat) |

### B — Ainda Ativo (fora do núcleo Chat SoT ou prep F7)

| ID (tracker) | Tema | Remover em |
|---|---|---|
| L-FF-13 | `CHAT_INBOX_CURSOR` (stub; F6 usa store flag) | Pós-consolidação flags |
| L-FF-14 | `CHAT_REDIS_WS` | **F7** |
| L-RT-06 | Eventos WS legacy | **F7+** |
| L-RT-08 | Redis adapter ausente | **F7** |
| L-HTTP-07/08/09… | Satélites Kanban/Lead/Admin | F5+/Manter conforme tracker |
| Sort/merge client residual | Agregado OFF | Pós-F4b canário |

### C — Explicitamente fora de remoção

`chatService` HTTP genérico, UI state Floating (painéis), settings/instances QR, Notifications socket, CRM financeiro — ver tracker §11.

---

## 2. Feature flags restantes

| Flag | Papel pós-F6 | Remoção física |
|---|---|---|
| `CHAT_CORE_STORE` | SoT F5–F6 | Pós-F6 canário longo |
| `CHAT_CORE_METRICS` | Observabilidade DEV | Manter (dev) |
| `CHAT_SINGLE_SOCKET` | F1 Bridge | Pós-F1 prod estável |
| `CHAT_WS_PATCH_*` | Bypass se store ON | Pós-F2 |
| `CHAT_AGGREGATED_*` | HTTP agregado | Pós-F4b unificar |
| `CHAT_INSTANCE_REGISTRY` / unread / attendance | F3 | Pós-F3 |
| `CHAT_REDIS_WS` | **F7** (sempre false hoje) | Após F7 |
| `CHAT_INBOX_CURSOR` | Stub não usado | Consolidar docs/flags |

---

## 3. Rollback validado (estático)

| Cenário | Resultado |
|---|---|
| `CHAT_CORE_STORE=OFF` | Hooks store no-op / RQ+useState; warm window no-op; virt chat → TanStack se limiar; commands não escrevem store |
| `CHAT_SINGLE_SOCKET=OFF` | Window listeners + sockets dedicados possíveis (legado F1) |
| Aggregated OFF | N+1 merge paths (F4b fallback) |
| Suite | 202 testes cobrem paths store; rollback OFF coberto em sprints F5/F6 |

**Validação operacional:** checklist UX §12 com flag OFF permanece recomendada antes de remoção física.

---

## 4. Dependências do legado (grafo)

```text
Chat.tsx useState  ←── rollback OFF
       ↑
React Query Floating ←── rollback OFF / float residual dump
       ↑
TanStack virtual ←── Floating sempre; Chat se store OFF
       ↑
WS patch RQ ←── store OFF
       ↑
chatPageCache / persist RQ ←── hidratação offline legada
       ↑
Sockets dedicados ←── SINGLE_SOCKET OFF
```

Remover um bloco exige canário do substituto **e** da fase anterior estável (ordem tracker §10).

---

## 5. Ordem recomendada pós-F6.7

| # | Bloco | Pré-requisito |
|---|---|---|
| 1 | Shadow / N+1 HTTP F4 | Aggregated ON prod |
| 2 | Sockets F1 + patches F2 | Flags ON prod |
| 3 | Unread/registry F3 | Flags ON prod |
| 4 | `useState` Chat + RQ float SoT | Canário `CHAT_CORE_STORE` |
| 5 | TanStack só Float → avaliar dump→pages no Float | Sprint dedicada |
| 6 | Eventos WS legacy + Redis | **F7** |

---

## 6. Critérios “legado pronto para remoção”

| Critério | Status |
|---|---|
| Inventário atualizado | ✅ |
| Dual path só para rollback | ✅ superfícies principais |
| Sem remoção sem canário | ✅ política tracker |
| F6 certificado | ✅ GO condicionado |
| Safe to delete now? | ❌ **Não** — `Removido` permanece 0 até PRs dedicados pós-canário |

---

## Conclusão

**Readiness = YES for planned cleanup.**  
**Readiness = NO for immediate mass delete.**

F7 pode iniciar em paralelo ao canário de remoção F4–F6 (Redis WS não depende de apagar o legado de UI primeiro).

**F6.8:** classificação ACTIVE / ROLLBACK / DEPRECATED / REMOVE_READY consolidada em [`LEGACY_REMOVAL_TRACKER.md`](./LEGACY_REMOVAL_TRACKER.md) §0. **Nenhum** item REMOVE_READY promovido; freeze ADR-010.
