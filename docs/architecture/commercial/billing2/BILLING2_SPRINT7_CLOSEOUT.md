# Billing 2.0 — Sprint 7 Closeout

| Campo | Valor |
|-------|-------|
| **Sprint** | 7 — Logs + Webhooks Health |
| **Data** | 2026-07-27 |
| **Status** | Implementada — aguardando aprovação |

## Entregáveis

| Item | Status |
|------|--------|
| API `GET /billing/audit-events` (filtros) | ✅ |
| API `GET /billing/audit-events/export.csv` | ✅ |
| UI Logs | ✅ |
| API `GET /billing/webhooks/health` | ✅ |
| UI Webhooks + taxa OK / failed | ✅ |
| Reprocess seguro (failed + payload) | ✅ |
| Audit `tenant.suspended` no executor | ✅ |
| Runbook webhook failed | ✅ |
| SIEM / retenção multi-ano | ❌ fora |

## Critérios de aceite

- [x] Suspensão (engine) gera audit com reason (`tenant.suspended`)
- [x] Export CSV com janela (default 90d no export se omitir `from`)
- [x] Token inválido permanece 401 (sem mudança no handler Asaas)
- [ ] Smoke staging filtros + export 1 tenant
- [ ] Smoke reprocess de 1 failed com payload

## Rollback

1. Esconder/reverter páginas Logs e Webhooks  
2. Tabelas e writer permanecem  

## APIs

- `GET /api/superadmin/billing/audit-events`
- `GET /api/superadmin/billing/audit-events/export.csv`
- `GET /api/superadmin/billing/webhooks/health`
- `POST /api/superadmin/billing/webhooks/:eventId/reprocess`

## Docs

- [`BILLING2_WEBHOOK_FAILED_RUNBOOK.md`](./BILLING2_WEBHOOK_FAILED_RUNBOOK.md)
