# TD Sprint 2 — Host resolve → loja ou portal de chamados

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S2** (feito) |
| **Plano-mãe** | [`PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md`](./PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md) |
| **Anterior** | [`SPRINT_TD_S1_TENANT_HOSTS_DNS.md`](./SPRINT_TD_S1_TENANT_HOSTS_DNS.md) |
| **Próximo** | **S4** — CORS + TLS + URLs canônicas |

---

## Entregas

### Backend
- `resolveTenantHostByHostname` — host `verified|active` + `platform_customer` → contexto `store` \| `support`
  - `store`: resolve `store_slug` via `store_profiles`
  - `support`: resolve slug (`tenants.slug`) + `tenant_support_portal_settings.enabled`
- `GET /api/public/tenant-host?domain=` — Partner WL tem prioridade; senão tenant host
- Rate limit reutilizado do Partner brand

### Frontend
- `TenantHostProvider` + bootstrap em `/` (`HomeOrRedirect` → `TenantHostLanding`)
- Role `store` → `PublicStore` na raiz; paths `/loja`, `/loja/produto/:id`, `/loja/checkout`
- Role `support` → `PublicTenantSupportPortalPage` (slug interno do host)
- `useStorefrontSlug` / `storefrontHref` — links sem `/{slug}` no host customizado
- Host Platform e Partner intactos

### Testes
- `tenantHostResolver.test.ts` (store + support + unknown)

---

## Como validar

1. Flag `tenant.custom_domain_v1` ON; bypass DNS ON em dev
2. Set + verify host `role=store` e outro `role=support` (S1)
3. Simular Host (hosts file / header) e abrir origem:
   - Host store → vitrine do tenant (não landing CRM)
   - Host support → portal de chamados
4. `GET /api/public/tenant-host?domain=<hostname>` → JSON com `role`, slugs, marca
5. Host Partner continua em `/api/public/partner-brand` (tenant-host retorna `partner: true`)

---

## DoD S2

- [x] `resolveTenantHostByHostname`
- [x] API pública `/api/public/tenant-host`
- [x] FE: Host `store` → loja
- [x] FE: Host `support` → portal de chamados
- [x] Host Platform inalterado
- [x] Partner host intacto (prioridade)
- [x] Testes de resolução

**Kickoff chat:** `ok sprint 2`
