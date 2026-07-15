# SPRINT PLAN — PHASE 0 — CRITICAL STABILIZATION

| Campo | Valor |
|---|---|
| Sprint ID | SPRINT_PHASE0_CRITICAL_STABILIZATION |
| Phase / Gate | Phase 0 — Critical Stabilization |
| Domínio principal | Runtime / Critical Stabilization (plataform risk removal) |
| Domínios secundários | FE+BE+DB **somente** para MB-003/039 (`wa_archived` isolation) e MB-004/033 (migrations) — estritamente necessários ao objetivo |
| Autor | Engineering Agent (Phase 0 execution) |
| Data | 2026-07-14 |
| Status | Approved / **CLOSED** (ver PHASE0_CLOSEOUT) |
| Autoridade | `MASTER_IMPLEMENTATION_PLAN.md` |

## 1 Objetivo

Estabilizar a plataforma removendo riscos críticos P0 do MASTER. Sem otimização de performance, sem refactors oportunistas, sem Phases 1–8.

## 2 Escopo

MB-001, MB-002, MB-003, MB-004, MB-005, MB-033, MB-039.

## 3 MB IDs

| ID | Título |
|---|---|
| MB-001 | Canário oficial Feature Flags Chat |
| MB-002 | Baselines reais (Network/Profiler/EXPLAIN docs) |
| MB-003 | Política `wa_archived` CRM-only + inbox isolation |
| MB-004 | Migrations registradas em `migrationOrder` |
| MB-005 | Runbook Canário Chat |
| MB-033 | CI/guard migrations fora do order |
| MB-039 | Groups ↔ Inbox ↔ Arquivadas parity |

## 4 Gate

IMPLEMENTATION GATES — Phase 0. Entrada: MASTER aprovado. Saída: PHASE0_CLOSEOUT + DoD.

## 5 Domínio

Principal: Critical Stabilization / Ops runtime.  
Secundários justificados: Chat FE/BE/DB apenas para isolation `wa_archived` e migration hygiene.

## 6 Dependências

MASTER_IMPLEMENTATION_PLAN; coluna `wa_archived` já presente no Postgres local (evidência `\d`).

## 7 Fora de Escopo

SQL reshape, React opt, Chat.tsx split, Workers, Socket, Redis, Store schema redesign, Repository/Commands architecture, legado removal, APIs public freeze, ADR-010 surfaces redesign, Phases 1–8.

## 8 Arquivos previstos

- `docs/architecture/sprints/*` (este plano, runbook, baselines, closeout)
- `database/init/291_*`, `292_*` + `migrationOrder.ts`
- `scripts/check-migration-order.*` (+ package script / CI hook)
- Backend: list/counts/SQL isolation, PATCH wa-archive, upsert não sync archive
- Frontend: filtros inbox/groups, chip Arquivadas, normalize, counts
- Extra observado (mínimo): action creators `upsert`/`remove` se já referenciados por consolidation (quebra TS/runtime) — documentar

## 9 Banco

Migrations IF NOT EXISTS + repair `wa_archived=false` where polluted. Sem mudanças de schema além da coluna já prevista.

## 10 Feature Flags

MB-001: **documentar** composição canário oficial. **Não** alterar defaults do catalog (permanecem OFF). Toggle operacional via Super Admin / runbook.

## 11 ADR necessários

Não (sem reabrir freeze). ADR-010 permanece intacto.

## 12 Plano Técnico

1. Docs sprint + runbook + canário composition  
2. Restore/wire `wa_archived` isolation end-to-end (DB column exists; app code missing)  
3. migrationOrder + guard script  
4. Baselines doc update (collect what is possible locally; mark live gaps)  
5. Closeout + MASTER backlog statuses  

## 13 Plano de QA

Login, Logout, Inbox, Arquivadas, Groups, Chat send/receive, Feature Flags doc, Migrations, Baselines artifacts.

## 14 Rollback

Reverter PRs/files da sprint; flags OFF; migration repair is additive IF NOT EXISTS.

## 15 Critérios de Aceite

Conforme pedido do usuário / Gate Phase 0 / ENGINEERING DEFINITION OF DONE.

## 16 Evidências

PHASE0_CLOSEOUT.md + baselines + SQL counts + script CI.

## 17 Release Notes

Estabilização Phase 0: isolation Arquivadas, migration guard, canário runbook, baselines.

## 18 Pós Implementação

KPIs: No KPI Changes esperados para perf (sprint não é otimização); registrar evidências de estabilidade.

## 19 Atualização MASTER

Atualizar status MB-001…005,033,039 → Ready/completed no MASTER BACKLOG; Gate Phase 0 Closed se DoD ok.

## 20 Phase Close-out

`docs/architecture/sprints/PHASE0_CLOSEOUT.md`
