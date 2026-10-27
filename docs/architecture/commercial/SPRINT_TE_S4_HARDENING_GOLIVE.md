# TE Sprint 4 — Hardening + go-live — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Sprint** | **TE4** (**feito** — entregáveis repo; piloto prod = checklist ops) |
| **Plano-mãe** | [`PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md`](./PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md) |
| **Anterior** | [`SPRINT_TE_S3_UI_SSL.md`](./SPRINT_TE_S3_UI_SSL.md) |
| **Próximo** | Piloto prod (ops) · fase TE completa no código |

---

## Objetivo

Produção confiável: hardening, runbook de incidentes, checklist go-live, backlog apex explícito.

---

## Entregas (repo)

### Hardening
- `getTenantCustomDomainBlockedHosts()` — inclui hosts `FRONTEND_URL`/`PUBLIC_APP_URL` + CNAME SaaS
- Soft sync CF no GET instructions + recheck DNS (TE2)
- `POST /api/me/tenant/domain/cf-sync` (TE3) + **Super Admin** `POST …/domain/cf-sync` + botão **Resync CF**
- Copy UI: apex não suportado; cota CF compartilhada (nota Super Admin)
- Recheck job já chama `syncTenantCloudflareHostnameStatus` quando DNS ok

### Docs
- [`RUNBOOK_TE_INCIDENTES.md`](./RUNBOOK_TE_INCIDENTES.md)
- Checklist go-live (abaixo)
- Apex / login CRM = backlog (não nesta fase)

---

## Checklist go-live produção (ops)

### Env / flags
- [ ] Migration `354` aplicada
- [ ] `TENANT_CUSTOM_DOMAIN_CNAME_TARGET=customers.<zona>` (mesmo target PE)
- [ ] `CF_SAAS_ZONE_ID` + `CF_SAAS_API_TOKEN` (secrets)
- [ ] `tenant.custom_domain_v1` ON (já default do produto)
- [ ] **Habilitar edge só no painel:** Super Admin → **Avançado → Feature Flags** → namespace `tenant` → `tenant.edge_cloudflare_saas_v1` = **ON** (default OFF no código; não ligar por env em prod)
- [ ] Partner no mesmo edge (se ainda OFF): namespace `partner` → `partner.edge_cloudflare_saas_v1` = **ON**
- [ ] `tenant.domain_verify_bypass` **OFF**

### Edge
- [ ] Fallback origin + Origin Host rewrite (já PE)
- [ ] Zero Add Domain Easypanel por tenant novo

### Piloto E2E staging → prod
- [ ] Tenant `platform_customer`: subdomínio loja → verify → SSL active
- [ ] `https://{loja}` abre **loja** (não home, não 404)
- [ ] Subdomínio support → portal de chamados
- [ ] UI Settings: DNS + SSL + banner pending
- [ ] Clear remove Custom Hostname (staging ou tenant de teste)
- [ ] Super Admin Resync CF atualiza `cf_ssl_status`

---

## Backlog explícito (pós-TE)

| Item | Destino |
|------|---------|
| Domínio apex (A genérico) | Apex Proxying Enterprise / ALIAS |
| Login CRM no domínio custom (`app`) | Fora do TD/TE |
| Métricas/alerta cota CF automatizado | Ops futuro |

---

## DoD

| Item | Estado |
|------|--------|
| Hardening blocked hosts + SA Resync CF | **OK** |
| Runbook incidentes | **OK** |
| Checklist go-live / piloto | **Ops** (marcar acima) |
| Apex / login CRM backlog | **Documentado** |

---

## Fase TE: completa (código)

Sprints TE0–TE4 entregues no repositório. Pendência residual = execução ops do checklist + piloto.
