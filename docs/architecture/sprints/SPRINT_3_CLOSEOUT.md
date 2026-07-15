# SPRINT_3_CLOSEOUT — Phase 10G · Selection & Open Pipeline Hardening

| Campo | Valor |
|---|---|
| **Sprint** | 3 |
| **Phase** | 10G |
| **Gate** | **CLOSED** |
| **Data** | 2026-07-15 |
| **Tipo** | Frontend Runtime Hardening |
| **Backend / SQL / Redis / Socket / Workers / Flags / ADR** | **Não alterados** |

---

## Veredito

Open de conversa Store ON segue pipeline único com **coalesce in-flight** (Chat + Float não disparam writes concorrentes da mesma page), **generation supersede** com `force`, e abort métricas se a seleção mudou durante o fetch. Selection permanece UI local.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `loadMessagesCommand` | In-flight map por `conversationId` + modo latest/all; `force` supersede |
| Métricas | `openConversationPipelineMetrics.ts` |
| `Chat.tsx` | Store ON: sem warm IndexedDB → `setMessages` local; re-check seleção pós-await + `recordOpenPipelineStaleAbort` |
| Testes | `loadMessages.phase10g.test.ts`; F5.10 concurrency atualizado |

### Ordem oficial

```
select → loadMessagesCommand → Message Store → Preview sync (10D) → selectors → UI
```

### Critério de aceite

| Critério | Status |
|---|---|
| Open paralelo Chat/Float same id coalescido | **Pass** |
| Generation mismatch não aplica stale write | **Pass** |
| Selection UI local | **Pass** |
| Sem Backend/Flags | **Pass** |

---

## Observações (não corrigidas)

1. **Float `loadGenerationRef` local + command in-flight**  
   Coexistem; command é a autoridade de write. Hook generation só evita setState de fetching stale — OK, não unificado em um único token de UI.

2. **Modo `latestPage: false` (dump Float env)** vs Chat `latest`  
   Não coalescem entre si (keys diferentes de modo). Se dump e latest correrem juntos, force-like supersede pode ocorrer — raro (env rollback).

3. **Scroll preservation / virtualização**  
   Não alterados nesta sprint (comportamento existente). Flicker residual de scroll ao trocar rápido de conversa = observação, não fix.

4. **CRM detail ownership**  
   Sprint 4.

5. **RQ invalidate residual Provider (Sprint 2 obs.)**  
   Continua.

---

## Próximo

```
ok sprint 4
```

→ Phase 10H · CRM Detail Ownership
