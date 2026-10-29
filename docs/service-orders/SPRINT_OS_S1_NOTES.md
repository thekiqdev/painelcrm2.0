# Sprint OS-S1 — Schema + API CRUD — **FEITO**

| Campo | Valor |
|-------|-------|
| **Status** | **Concluído** |
| **Data** | 2026-10-28 |
| **Plano-mãe** | [`../PLANO_SPRINTS_ORDEM_DE_SERVICO.md`](../PLANO_SPRINTS_ORDEM_DE_SERVICO.md) |
| **ADR** | [`ADR_OS_S0_DECISOES.md`](./ADR_OS_S0_DECISOES.md) |
| **Anterior** | [S0](./SPRINT_OS_S0_NOTES.md) |
| **Próximo** | **ok sprint 2** → UI listagem / criação / detalhe |

---

## Objetivo

Persistência multi-tenant + API autenticada mínima + módulo de permissões + client tipado no frontend. **Sem** menu/páginas SPA (S2).

---

## Entregas

| Peça | Path |
|------|------|
| Migration | `database/init/360_service_orders_module.sql` |
| Ordem migrate | `packages/backend/src/startup/migrationOrder.ts` |
| Service | `packages/backend/src/services/serviceOrdersService.ts` |
| Controller | `packages/backend/src/controllers/serviceOrdersController.ts` |
| Routes | `packages/backend/src/routes/serviceOrdersRoutes.ts` → `/api/service-orders` |
| Auth chain | `serviceOrdersAuth` + `requireFeature('service_orders')` |
| MODULE_IDS | `service_orders` em `modulePermissionsService` + `permissionTypes` |
| Permission catalog | chaves `service_orders.*` (BE + FE) |
| FE client | `src/services/serviceOrders.ts`, `src/types/serviceOrders.ts` |
| Teste totais | `serviceOrdersService.totals.test.ts` |

### API

| Método | Path | Permissão |
|--------|------|-----------|
| `GET` | `/api/service-orders` | `view` |
| `POST` | `/api/service-orders` | `create` |
| `GET` | `/api/service-orders/:id` | `view` (+ items + events) |
| `PATCH` | `/api/service-orders/:id` | `edit` (own/assignee) |
| `DELETE` | `/api/service-orders/:id` | `delete` (só draft/cancelled) |

Query listagem: `status`, `client_id`, `responsible_user_id`, `created_by`, `q`, `limit`, `offset`.

### Schema

- `service_orders` + `service_order_items` + `service_order_events`
- `service_order_number_sequences` (numeração por tenant)
- Feature `service_orders` em `system_features` + `plan_features` (**enabled** para API)
- Seeds `role_module_permissions` (admin/manager/member/viewer)
- RLS por `tenant_id`

---

## Como aplicar a migration

```bash
cd packages/backend
npm run migrate
```

(ou pipeline equivalente do projeto)

---

## Aceite S1

| Critério | Status |
|----------|--------|
| CRUD API com `tenant_id` | ✅ |
| Número sequencial por tenant | ✅ |
| Itens service/product + totais | ✅ (teste unitário alinhado ao PDF 230+200=430) |
| Edição bloqueada fora de draft/scheduled/in_progress | ✅ |
| Delete só draft/cancelled | ✅ |
| Feature + MODULE_IDS | ✅ |
| Client FE tipado | ✅ |
| Menu / páginas | ❌ fora de escopo (S2) |
| Assinatura / fatura / agenda | ❌ S4–S6 |

---

## Exemplo de body (create)

```json
{
  "client_id": "<uuid>",
  "client_snapshot": { "name": "OIKOS SOLUCOES AMBIENTAIS LTDA", "trade_name": "GRUPO OIKOS" },
  "execution_address": { "line": "RUA FRADIQUE COUTINHO, 2207", "city_uf": "São Paulo/SP", "postal_code": "05416-012" },
  "period_start_at": "2026-09-22T18:36:00-03:00",
  "billing_mode": "manual",
  "equipment": { "name": "LAVA E SECA", "brand": "SAMSUNG", "defects": "NÃO ESTÁ SECANDO." },
  "observations": "Unidade - IFC",
  "items": [
    { "kind": "service", "name": "MÃO DE OBRA", "quantity": 1, "unit_price_cents": 23000 },
    { "kind": "product", "name": "MAÇANETA DA PORTA", "unit": "UN", "quantity": 1, "unit_price_cents": 8000 },
    { "kind": "product", "name": "TERMOSTATO", "unit": "UN", "quantity": 2, "unit_price_cents": 6000 }
  ]
}
```

---

## Próximo (OS-S2)

1. Rotas SPA `/service-orders`, `/new`, `/:id`  
2. `ClientSearchCombobox` + editor de itens (serviços/produtos)  
3. Menu atrás de `useFeatureFlag('service_orders')` / canView  
4. Listagem com filtros e detalhe com timeline  
