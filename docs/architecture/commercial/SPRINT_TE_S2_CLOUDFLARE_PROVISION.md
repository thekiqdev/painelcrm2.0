# TE Sprint 2 — Automação Custom Hostname (`tenant_hosts`) — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Sprint** | **TE2** (**feito**) |
| **Plano-mãe** | [`PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md`](./PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md) |
| **Anterior** | [`SPRINT_TE_S1_OPS_SMOKE.md`](./SPRINT_TE_S1_OPS_SMOKE.md) |
| **Próximo** | **TE3** — UI SSL Settings · [`SPRINT_TE_S3_UI_SSL.md`](./SPRINT_TE_S3_UI_SSL.md) (**feito**) |

---

## Objetivo

Verify/`active` e clear de `tenant_hosts` sincronizam Cloudflare Custom Hostname (reuso do client PE).

---

## Entregas

### DB / flags
- Migration `354_tenant_edge_cloudflare_saas_te2.sql` (+ supabase)
- Colunas `tenant_hosts.cf_*`
- Flag `tenant.edge_cloudflare_saas_v1` (default OFF, kill `tenant.master_off`)

### Backend
- `tenantCloudflareHostnameService.ts` — provision / deprovision (client PE)
- Hooks: `verifyTenantDomain` → provision; `clearTenantDomain` / admin clear → deprovision antes do DELETE
- Só subdomínio: `DOMAIN_SUBDOMAIN_REQUIRED` (helper PE `isPartnerSubdomainHostname`)
- `TenantDomainInstructions` inclui `cf_*`
- Falha CF **não** reverte `active`

### Testes
- Apex rejeitado · verify chama provision · provision no-op/flag ON

---

## Como ligar em staging

1. Smoke TE1 OK (Origin rewrite + CNAME SaaS)
2. Migration `354`
3. `CF_SAAS_ZONE_ID` + `CF_SAAS_API_TOKEN`
4. Super Admin → **Avançado → Feature Flags** → `tenant.edge_cloudflare_saas_v1` = **ON** (default OFF)
5. Settings Domínio → verificar → Custom Hostname na CF

---

## DoD

- [x] Flag + migration
- [x] Verify provisiona / clear remove
- [x] Apex rejeitado
- [x] Falha CF não corrompe `active`
- [ ] UI SSL polida — TE3

---

## Kickoff próximo

`ok sprint te3`
