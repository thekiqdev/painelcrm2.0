# Sprint OS-S7 — Hardening / go-live — Notas

| Campo | Valor |
|-------|-------|
| **Status** | **FEITO** |
| **Data** | 2026-10-29 |

## Entregas

| Item | Status |
|------|--------|
| `service_orders` em `FEATURE_KEYS` | ✅ |
| RolePermissions extras OS | ✅ |
| Asserts send / signature / cancel / invoice | ✅ |
| ClientProfile tab + nav + overview count | ✅ |
| i18n `serviceOrders` (pt-BR / en / es) | ✅ |
| Empty states lista (vazio vs filtro) | ✅ |
| Testes unit (conversion items, token crypto, catalog, features) | ✅ |
| Rate limit público | ✅ (já S4) |
| Runbook | ✅ [`RUNBOOK_SERVICE_ORDERS.md`](./RUNBOOK_SERVICE_ORDERS.md) |

## Go-live

1. Ligar flag no plano piloto  
2. Conferir permissões granulares nos perfis  
3. Smoke end-to-end (criar → PDF → assinar → fatura → visita)  
4. Expandir planos  

## Fora / backlog

- Cobertura e2e HTTP com DB  
- Múltiplas visitas, estoque, `pdf_signature` upload  
