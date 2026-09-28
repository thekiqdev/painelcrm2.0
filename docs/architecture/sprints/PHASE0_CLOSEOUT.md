# PHASE0_CLOSEOUT — Critical Stabilization

| Campo | Valor |
|---|---|
| **Phase** | 0 — Critical Stabilization |
| **Sprint** | SPRINT_PHASE0_CRITICAL_STABILIZATION |
| **Data** | 2026-07-14 |
| **Gate status** | **CLOSED** |
| **Definition of Done** | Itens críticos atendidos; gaps live documentados (baselines Network/Profiler) |

---

## Itens executados (MB)

| MB | Resultado | Evidência |
|---|---|---|
| MB-001 | **Done** (ops doc; defaults catalog OFF) | `CHAT_CANARY_COMPOSITION_MB001.md` |
| MB-002 | **Done** (doc baselines; live gaps ⚠) | `PHASE0_BASELINES_MB002.md` |
| MB-003 | **Done** | Isolation BE+FE+CRM PATCH; sync não grava `wa_archived` |
| MB-004 | **Done** | `291`/`292` em `migrationOrder`; migrate OK |
| MB-005 | **Done** | `CHAT_CANARY_RUNBOOK_MB005.md` |
| MB-033 | **Done** | `npm run check:migration-order` (enforce ≥291) |
| MB-039 | **Done** | Mesma regra groups+inbox+Arquivadas (SQL + FE filter) |

## MB não concluídos

Nenhum dos autorizados ficou Incomplete.  
Live baselines Network/Profiler restantes são **documentados como ⚠** (não bloqueiam isolation/migrations/canário docs).

## Evidências testes

| Caso | Resultado |
|---|---|
| Migrations 291/292 | migrate:tsx OK |
| check:migration-order | OK (WARN histórico 183_*) |
| chat-core.f3.test | 6 passed |
| SQL counts | `archived=0`, `active=527` (Docker local) |
| Login/Logout/Send/Receive UI | Requer smoke manual staging pós-restart backend (runbook) |

## Evidências baselines

Ver `PHASE0_BASELINES_MB002.md`. **No KPI Changes** (sprint não é perf).

## Validação

- Inbox exclui `wa_archived=true` (legacy + aggregated + FE merge + UI view).  
- Filtro `wa_archived` / chip Arquivadas lista só arquivadas.  
- Groups sobe mesmo predicado `conversationFilter=groups` + isolamento archive.  
- CRM `PATCH /wa-archive` + botão Arquivar/Desarquivar.  
- Canário: composição + runbook (sem ligar defaults).  

## Rollback

| Camada | Como |
|---|---|
| Código | Reverter commits/PRs Phase 0 |
| Flags | Permanecem OFF por default |
| DB | Coluna `wa_archived` permanece (IF NOT EXISTS); repair não destrói dados ativos |

Rollback **não** executado (entrega estável). Justificado: mudanças aditivas + testes verdes.

## Problemas encontrados (fora de escopo — NÃO implementados além do mínimo)

| Achado | Ação |
|---|---|
| Código `wa_archived` ausente no tree enquanto coluna existia no Postgres | Restaurado como MB-003/039 (estabilização) |
| Orphans históricos SQL <291 fora do order | WARN no guard; cleanup → Future / Phase B não |
| `183_appointment_availability_settings.sql` missing on disk | WARN; não bloqueia ≥291 |
| Baselines live Network/Profiler | Documentado ⚠; completar no smoke canário |

## Pendências

- Captura HAR + Profiler em staging (ops, com runbook).  
- Restart do Backend local para carregar `chatController` / rotas novas.  
- Ativar canário **somente** via painel (MB-001 ops).

## Arquivos alterados / criados (resumo)

**Docs:** `docs/architecture/sprints/*` (plan, closeout, canary, runbook, baselines)  
**DB:** `291_*`, `292_*`, supabase repair, `migrationOrder.ts`  
**Scripts:** `scripts/check-migration-order.mjs`, `package.json` script  
**BE:** list/counts isolation, `chatWaArchiveController`, route, uazapi.archiveChat, queryBuilder/rowMapper, realtime payload  
**FE:** fetch/repository filters, chat service, Chat.tsx filter+toggle, sidebar Arquivadas, domain types/mappers/domainToUi, action upsert/remove, unread EMPTY_COUNTS, public export UI update  

## Gate Phase 0

**PHASE 0 → CLOSED**

Phase 1 **não** autorizada até novo Sprint Plan Phase 1 aprovado sob MASTER gates.
