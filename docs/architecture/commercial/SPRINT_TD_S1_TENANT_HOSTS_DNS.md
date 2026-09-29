# TD Sprint 1 — Schema `tenant_hosts` + DNS set/verify

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S1** (feito) |
| **Plano-mãe** | [`PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md`](./PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md) |
| **Anterior** | [`SPRINT_TD_S0_INVENTORY_AND_FLAGS.md`](./SPRINT_TD_S0_INVENTORY_AND_FLAGS.md) |
| **Próximo** | **S3** — UI Settings (seletor de uso) + Super Admin |

---

## Entregas

### Schema
- Migration `339_tenant_hosts_s1.sql`
- Tabela `tenant_hosts`: `hostname`, `role` (`store`\|`support`), `status`, token, timestamps
- Unique global em `lower(hostname)`
- Unique parcial `(tenant_id, role)` para status `pending|verified|active`

### Serviço
- `tenantDomainService.ts` — set / verify (TXT \| CNAME \| bypass) / clear / list
- TXT: `_painelcrm-tenant.<hostname>`
- CNAME → `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` (fallback Partner)
- Colisão com Partner `custom_domain` e vice-versa (`DOMAIN_TAKEN_PARTNER` / `DOMAIN_TAKEN_TENANT`)
- Só `platform_customer`; gate `tenant.custom_domain_v1`

### APIs

| Método | Rota | Auth |
|--------|------|------|
| GET | `/api/me/tenant/domain` (?role=) | Tenant + settings |
| POST | `/api/me/tenant/domain` `{ hostname, role }` | Tenant settings edit |
| POST | `/api/me/tenant/domain/verify` `{ role }` | Tenant settings edit |
| DELETE | `/api/me/tenant/domain?role=` ou `?id=` | Tenant settings edit |
| GET | `/api/superadmin/tenants/:id/domain` | Super Admin |
| DELETE | `/api/superadmin/tenants/:id/domain?role=`\|`?id=` | Super Admin |

### Testes
- `tenantDomainService.test.ts` + ajuste Partner set (colisão tenant)

---

## Como validar

1. Migrations `338` + `339`; flag **`tenant.custom_domain_v1` = ON**
2. (Dev) `tenant.domain_verify_bypass` = ON
3. Como admin do tenant SaaS:
   ```http
   POST /api/me/tenant/domain
   { "hostname": "loja.empresa.test", "role": "store" }
   ```
4. `POST /api/me/tenant/domain/verify` `{ "role": "store" }` → `active` com bypass
5. Repetir com `role: "support"` e outro hostname
6. Super Admin: `GET /api/superadmin/tenants/:id/domain`

---

## DoD S1

- [x] `tenant_hosts` + índices
- [x] set exige `role=store|support`
- [x] verify TXT/CNAME/bypass
- [x] clear por role/id
- [x] rejeita Partner / outro tenant / não-`platform_customer`
- [x] APIs `/api/me/tenant/domain*` + Super Admin
- [x] Partner set também rejeita hostname de `tenant_hosts`

**Kickoff chat:** `ok sprint 1`
