# TE Sprint 1 — Ops / smoke Tenant no edge CF — **FEITO (runbook)**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Sprint** | **TE1** (**feito** — entregável = runbook smoke; prova HTTPS = checklist ops) |
| **Plano-mãe** | [`PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md`](./PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md) |
| **Runbook** | [`RUNBOOK_TE_TENANT_EDGE_SMOKE.md`](./RUNBOOK_TE_TENANT_EDGE_SMOKE.md) |
| **Edge base** | [`RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md`](./RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md) |
| **Anterior** | [`SPRINT_TE_S0_INVENTORY_AND_ADR.md`](./SPRINT_TE_S0_INVENTORY_AND_ADR.md) |
| **Próximo** | **TE2** — automação CF em `tenant_hosts` · `ok sprint te2` |

---

## Objetivo

Provar (manual) que subdomínio **tenant** `store` abre a loja via Cloudflare for SaaS **sem** Add Domain no Easypanel — reusando o edge PE.

---

## Entregas (repo)

- [x] Runbook smoke tenant (não duplica setup zona; aponta PE)
- [x] Env: `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` alinhado ao Partner
- [x] Checklist DoD + rollback + falhas comuns
- [x] Ponteiro em Easypanel deploy

---

## Checklist ops (marcar no staging)

- [ ] Edge PE ok (fallback + Origin rewrite + `customers.`)
- [ ] `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` (ou herança Partner) = target SaaS
- [ ] Tenant teste: Domínio Loja → DNS → `active`
- [ ] Custom Hostname **manual** na CF (ssl active)
- [ ] `GET /api/public/tenant-host?domain=…` → store
- [ ] Browser: loja no subdomínio (não 404 / não home)
- [ ] Sem Add Domain desse host no Easypanel

---

## DoD

| Item | Estado |
|------|--------|
| Runbook smoke aplicável | **OK** |
| Prova HTTPS staging | **Pendente ops** (checklist) |
| Automação API CF tenant | TE2 |

---

## Kickoff próximo

`ok sprint te2`
