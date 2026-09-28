# Legacy Cycle Recovery — Sprint 4.2B

## Problema

Assinaturas antigas em produção podem ter `subscription_cycles.status = cancelled` **sem invoice** e **sem evento oficial de cancelamento**. Na UI isso aparecia como competência **Cancelada** no Histórico, enquanto o Calendário já mostrava corretamente a competência futura.

## Regra oficial

| Condição | Ação |
|----------|------|
| `status = cancelled` + `invoice_id IS NULL` + sem cancelamento oficial | Reinterpretar como **Prevista** (`awaiting_generation`) |
| Assinatura `cancelled` | Manter **Cancelada** |
| `skipped_reason` com marcador oficial (`manual_cancel`, `billing.cancel_*`, etc.) | Manter **Cancelada** |

## Implementação

| Camada | Arquivo |
|--------|---------|
| Detecção/reparo DB | `packages/backend/src/services/legacyCancelledCycleRecovery.ts` |
| Timeline UX (API) | `packages/backend/src/services/subscriptionTimelineUx.ts` |
| Auditor produção | `packages/backend/src/billingPlatform/audit/legacy/legacyCancelledCycleAuditor.ts` |
| Normalização frontend | `src/lib/legacyCycleRecovery.ts` |
| Eventos financeiros | `src/lib/subscriptionFinancialEventBuilder.ts` |
| Botão Gerar | `src/lib/subscriptionRenewalRecovery.ts` |

## Reparo automático

Durante `npm run billing:production-validation` (sem `--dry-run`):

```sql
UPDATE subscription_cycles
SET status = 'pending', skipped_reason = NULL
WHERE status = 'cancelled' AND invoice_id IS NULL
  AND assinatura ativa AND sem cancelamento oficial
```

## Artefato

`storage/debug/billing-production/legacy-cycle-recovery.json`

## Navegação cliente

`FinancialHeader.tsx`:

- **Avatar** → Sidebar do cliente (`openClient` drawer)
- **Nome** → Perfil do cliente (`ClientEntityLink` route)

## Testes

```bash
cd packages/backend && npm test -- legacyCancelledCycleRecovery.test.ts
npm test -- legacyCycleRecovery.test.ts   # raiz do monorepo / vitest frontend
```

## Definition of Done

- [x] Ciclos legados inconsistentes deixam de aparecer como Cancelados
- [x] Histórico = Calendário (mesma fonte `FinancialEventStore`)
- [x] Botão **Gerar cobrança** via `generateRenewalNow()` no histórico
- [x] Cancelamentos legítimos preservados
- [x] Auditor + reparo na certificação de produção
- [x] Avatar/nome abrem perfil do cliente
- [x] Sem alteração em Billing Engine, Worker, Scheduler, Gateway, Runtime ou schema DB
