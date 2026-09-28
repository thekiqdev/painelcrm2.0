# Billing 2.0 — Sprint 8 Closeout

| Campo | Valor |
|-------|-------|
| **Sprint** | 8 — Reconciliação L2 + Recovery / Dunning |
| **Data** | 2026-07-27 |
| **Status** | Implementada — aguardando aprovação |
| **MVP** | **Fecha MVP Billing 2.0** (Sprints 0–8) |

## Entregáveis

| Item | Status |
|------|--------|
| Serviço L2 `getPayment` + dry-run / apply | ✅ |
| API `GET …/reconciliation-l2/divergences` | ✅ |
| API `POST …/reconciliation-l2/run` | ✅ |
| UI Ops — tabela divergências + dry-run/apply | ✅ |
| Job script `billing:reconciliation-l2` (+ L1 se `reconciliation_auto`) | ✅ |
| Dunning cycle sob `dunning_enabled` | ✅ |
| API `POST …/dunning/run` + script `billing:dunning` | ✅ |
| UI Ops — dry-run / emit dunning | ✅ |
| KPI proxy Receita recuperada 30d no dashboard | ✅ |
| Testes unitários flag OFF / paid-remote | ✅ |
| Flags default OFF (L2 apply / dunning emit) | ✅ |

## Critérios de aceite

- [x] Dry-run L2 lista divergência `paid_remote_pending_local` sem mutar
- [x] Apply L2 exige `reconciliation_l2_enabled`
- [x] Emit dunning exige `dunning_enabled`; suspend/cancel continuam atrás de engine + policy + `auto_*`
- [ ] Smoke staging: divergência real Asaas ↔ pending local
- [ ] Staging: suspend ON → suspende após N dias → reativa no paid
- [ ] Demo MVP PRD §19 (checklist produto)

## Rollback

1. `billing2.reconciliation_l2_enabled` = OFF  
2. `billing2.dunning_enabled` = OFF  
3. Manter `auto_suspend` / `auto_cancel` / `collection_policy_engine_enabled` OFF em prod  
4. Scripts/API permanecem; apply/emit viram no-op  

## APIs

- `GET /api/superadmin/billing/reconciliation-l2/divergences`
- `POST /api/superadmin/billing/reconciliation-l2/run` `{ dry_run?, limit? }`
- `POST /api/superadmin/billing/dunning/run` `{ dry_run?, limit? }`

## Scripts

```bash
npm run billing:reconciliation-l2          # dry-run (default)
npm run billing:reconciliation-l2 -- --apply
npm run billing:dunning
npm run billing:dunning -- --apply
```

## Declaração MVP

Com a Sprint 8, o **MVP Billing 2.0 Super Admin** (S0–S8) está **implementado em código**, atrás de Feature Flags com defaults seguros:

| Capacidade | Flag / gate |
|------------|-------------|
| Collection Policy Engine | `collection_policy_engine_enabled` OFF |
| Writer `past_due` | `past_due_writer_enabled` OFF |
| MRR contratado no dashboard | `dashboard_mrr_contracted` OFF |
| L2 apply | `reconciliation_l2_enabled` OFF |
| Dunning emit | `dunning_enabled` OFF |
| Suspend / cancel automáticos | `auto_suspend` / `auto_cancel` OFF |

**Produção com defaults = comportamento legado.** Ativação gradual só em staging → canário → prod, com QA do gate abaixo.

S9+ (token cartão, Pix Automático, multi-gateway, hardening) **não iniciam** sem aprovação explícita pós-MVP.

## Arquivos

- `packages/backend/src/services/billingReconciliationL2Service.ts`
- `packages/backend/src/services/billingDunningJobService.ts`
- `packages/backend/src/scripts/runReconciliationL2.ts`
- `packages/backend/src/scripts/runBillingDunning.ts`
- `src/pages/superadmin/SuperAdminBillingOperations.tsx`
- `src/services/superadminBillingOps.ts`
