# Billing 2.0 — Sprint 6 Closeout

| Campo | Valor |
|-------|-------|
| **Sprint** | 6 — Dashboard Financeiro |
| **Data** | 2026-07-27 |
| **Status** | Implementada — aguardando aprovação |

## Entregáveis

| Item | Status |
|------|--------|
| MRR contratado (`subscriptions` active+past_due) | ✅ |
| MRR catálogo preservado (fallback) | ✅ |
| Flag `dashboard_mrr_contracted` (default OFF) | ✅ |
| ARR = MRR × 12 | ✅ |
| Cards: assinaturas SaaS, renovações 30d, valor em risco | ✅ |
| Tooltips / definições PRD §12 | ✅ |
| Alertas: jobs failed + past_due | ✅ |
| Hub Financeiro → Dashboard | ✅ |
| LTV/churn / Pix Auto KPIs | ❌ fora |

## Critérios de aceite

- [x] Cálculo MRR amostra unitária (10 assinaturas + mista)
- [x] Tooltip explica contratado vs catálogo
- [x] Flag OFF = KPI principal continua catálogo (sem surpresa em prod)
- [ ] Validação Financeiro em staging com amostra real
- [ ] Opcional: ligar flag em staging e comparar catálogo vs contratado

## Rollback

1. Super Admin → `billing2.dashboard_mrr_contracted` = OFF  
2. `mrr_cents` volta ao catálogo; campos `mrr_contracted_cents` / `mrr_catalog_cents` continuam no payload  

## Notas

- Default da flag permanece **OFF** para não alterar o número do painel em produção sem comunicação.
- Bloco “Receita SaaS” (commercial analytics) permanece; indicadores principais agora alinhados ao plano S6.

## Arquivos

- `packages/backend/src/services/billing2/dashboardMrr.ts`
- `packages/backend/src/services/superadminDashboardService.ts`
- `src/pages/superadmin/SuperAdminDashboard.tsx`
- `src/layouts/superadminHubConfig.ts`
