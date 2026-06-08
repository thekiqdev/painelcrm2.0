# Sprint P0-A — Estabilização Ops Kanban

## Objetivo

Restaurar confiabilidade do Kanban Operacional (tenant virtual, seed, cards de lead, retomada de cadastro) **sem** alterar Sprint O1, phase2 ou workflow runtime.

## Entregas

| # | Entrega | Implementação |
|---|---------|---------------|
| 1 | Anti-duplicação de boards | `pg_advisory_xact_lock`, mutex in-process, índice único `264_ops_kanban_canonical_board_guard.sql`, `ON CONFLICT` via catch `23505` |
| 2 | Board canônico | `findCanonicalOpsBoardIdByName` (`ORDER BY created_at ASC`); UI filtra por `listCanonicalOpsBoardIds()` |
| 3 | Tenant OPS obrigatório | `assertSuperadminOpsTenantExists()` — log CRITICAL + `ops_tenant_missing` (HTTP 503) |
| 4 | Recuperação de leads | `recoverAcquisitionLeadsWithoutOpsCard()` — idempotente via `syncAcquisitionLeadToOpsKanban` |
| 5 | Retomada de cadastro | `resolveAcquisitionResume()` — mensagem “Continuando…” só com `canContinueWhereLeftOff` |
| 6 | Testes | `acquisitionResumeService.test.ts`, `superadminOpsKanbanFoundation.test.ts`, `superadminOpsKanbanSeedService.p0a.test.ts` |

## Arquivos principais

- `packages/backend/src/services/superadminOpsKanbanFoundation.ts`
- `packages/backend/src/services/superadminOpsKanbanSeedService.ts`
- `packages/backend/src/controllers/superadminOpsKanbanBootstrapController.ts`
- `packages/backend/src/acquisition/acquisitionResumeService.ts`
- `packages/backend/src/acquisition/acquisitionContactIntelligenceService.ts`
- `src/pages/AcquisitionSignupFlow.tsx`
- `database/init/264_ops_kanban_canonical_board_guard.sql`

## Operação

1. Rodar migrate (inclui `264`).
2. `POST /api/superadmin/ops/kanban/bootstrap` com `{ "backfill": true }` para recuperar leads em lote.
3. Listagem de boards no Super Admin passa a exibir **apenas** os 5 canônicos (duplicatas históricas permanecem no banco).

## Testes

```bash
cd packages/backend && npm test -- acquisitionResumeService superadminOpsKanbanFoundation superadminOpsKanbanSeedService.p0a
```
