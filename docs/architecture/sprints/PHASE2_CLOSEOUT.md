# PHASE2_CLOSEOUT — HTTP Dedup

| Campo | Valor |
|---|---|
| **Phase** | 2 — HTTP Dedup |
| **Sprint** | SPRINT_PHASE2_HTTP_DEDUP |
| **Data** | 2026-07-14 |
| **Gate status** | **CLOSED** |
| **Pré-requisito** | Phase 1 CLOSED |

---

## Resumo executivo

Deduplicação HTTP no Frontend: `listInstances` single-flight+TTL, clients/leads fora do mount do Chat, company Brand∥Settings shared cache. **chat-core não foi modificado** (ADR-010). Contratos HTTP preservados.

## MB executados

| MB | Resultado | Evidência |
|---|---|---|
| MB-008 | **Done** | `chatInstancesHttpCache` + `chatService.listInstances` |
| MB-009 | **Done** | `Chat.tsx` — load só com `linkDialogOpen` |
| MB-010 | **Done** (confirmado necessário) | `tenantCompanyHttpCache` + `getMyTenantCompany` |

## MB não executados

Nenhum autorizado Incomplete. Nenhum outro MB iniciado.

## Arquivos alterados

| Arquivo | MB | Motivo | Impacto |
|---|---|---|---|
| `docs/architecture/sprints/SPRINT_PHASE2_HTTP_DEDUP_PLAN.md` | — | Plano | Docs |
| `docs/architecture/sprints/PHASE2_METRICS_MB008_010.md` | — | Métricas | Docs |
| `docs/architecture/sprints/PHASE2_CLOSEOUT.md` | — | Closeout | Docs |
| `docs/architecture/MASTER_IMPLEMENTATION_PLAN.md` | Gate | Status | Docs |
| `src/services/chatInstancesHttpCache.ts` (+test) | MB-008 | Single-flight instances | HTTP |
| `src/services/chat.ts` | MB-008 | Wire listInstances + invalidate mutations | HTTP |
| `src/pages/Chat.tsx` | MB-009 | Lazy clients/leads | Chat mount loads only |
| `src/services/tenantCompanyTypes.ts` | MB-010 | Tipos sem ciclo | Types |
| `src/services/tenantCompanyHttpCache.ts` (+test) | MB-010 | Single-flight company | HTTP |
| `src/services/tenantCompany.ts` | MB-010 | Wire get/put + seed | HTTP |
| `src/lib/queryClient.ts` | 008/010 | Reset caches no logout | Auth/session |

## Evidências

- Vitest: `chatInstancesHttpCache.test` **4 passed**
- Vitest: `tenantCompanyHttpCache.test` **3 passed**
- Vitest: `chat-core.f3.test` **6 passed** (sem regressão registry)

## QA

| Caso | Resultado |
|---|---|
| Unit MB-008/010 | ✓ |
| F3 registry tests | ✓ |
| Login/Logout/Dashboard/Chat/Float/Unread/Company/Clients/Leads/CRM/Settings | Smoke browser **pendente** (API offline); lógica preservada |

## Métricas Before/After

Ver `PHASE2_METRICS_MB008_010.md`. Típico cold: **−5 HTTP** sob condições documentadas.

## Requests eliminadas

- Instances parallel: −2  
- Chat mount clients+leads: −2  
- Company parallel: −1  

## Rollback

Reverter arquivos da tabela. Rollback **não** executado — testes verdes; comportamento funcional equivalente (listas CRM sob demanda no Vincular).

## Pendências

1. Smoke Network live (instances=1 no ciclo Unread+Float+Chat).  
2. Preencher HAR ⚠.  
3. Não iniciar Phase 3 até aceite deste Gate.

## Observações (fora de escopo — NÃO implementado)

| Achado | Ação |
|---|---|
| Com F3 registry ON, cache interno do registry ainda é camada separada | Documentado; HTTP layer cobre F3 OFF (default) e dedupe abaixo do registry |
| `clientGroups` ainda no mount Chat | Fora de MB-009 (não é clients/leads list) |

## Gate Phase 2

**PHASE 2 → CLOSED**

Phase 3 **não** autorizada até Sprint Plan Phase 3 aprovado.
