# TE Sprint 3 — UI SSL Settings + Super Admin — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Sprint** | **TE3** (**feito**) |
| **Plano-mãe** | [`PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md`](./PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md) |
| **Anterior** | [`SPRINT_TE_S2_CLOUDFLARE_PROVISION.md`](./SPRINT_TE_S2_CLOUDFLARE_PROVISION.md) |
| **Próximo** | **TE4** — [`SPRINT_TE_S4_HARDENING_GOLIVE.md`](./SPRINT_TE_S4_HARDENING_GOLIVE.md) (**feito**) |

---

## Objetivo

Admin do tenant (e Super Admin) entende DNS + SSL Cloudflare sem suporte ops — paridade PE4.

---

## Entregas

### Settings (`DomainSection`)
- Badges **DNS** + **SSL** (`tenantCfSslStatusLabel`)
- Checklist: Configurado → DNS → HTTPS
- Banner “Certificado em provisionamento” (DNS ok + SSL pending)
- Alert `cf_last_error`
- Botão **Atualizar status SSL** → `POST /api/me/tenant/domain/cf-sync`
- **Abrir loja/portal** com `active` (mesmo se SSL ainda pending)
- Copy CNAME = edge Cloudflare; sem “cadastre no Easypanel”

### API
- `syncTenantDomainCloudflare` + rota `cf-sync` (sync + provision se faltar `cf_id`)

### Super Admin (`SuperAdminTenantHostsCard`)
- Badges SSL / ownership CF + `cf_id` + `cf_last_error`

---

## DoD

- [x] UI mostra DNS + SSL
- [x] Banner SSL pending
- [x] Abrir loja/portal coerente com `active`
- [x] Super Admin vê status CF
- [x] Resync Super Admin — TE4
- [ ] E2E staging / flag ON prod — checklist ops TE4

---

## Kickoff próximo

~~`ok sprint te4`~~ **feito**
