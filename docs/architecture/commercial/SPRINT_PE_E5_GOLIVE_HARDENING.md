# PE Etapa 5 — Go-live + hardening — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Etapa** | **5** (**feito** — entregáveis repo; piloto prod = checklist ops) |
| **Plano-mãe** | [`PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md`](./PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md) |
| **Anterior** | [`SPRINT_PE_E4_UI_SSL_E2E.md`](./SPRINT_PE_E4_UI_SSL_E2E.md) |
| **Próximo** | Piloto prod (ops) · depois TE tenant ([`PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md`](./PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md)) |

---

## Objetivo

Produção estável: hardening no app, runbooks de incidente/go-live, backlog apex/TE documentados.

---

## Entregas (repo)

### Hardening
- `getPartnerBlockedHosts()` — bloqueia localhost + `FRONTEND_URL`/`PUBLIC_APP_URL` + CNAME target + `painelcrm.com`
- Warn se `partner.domain_verify_bypass` em `NODE_ENV=production`
- `POST /api/partner/domain/cf-sync` — re-sync SSL / re-provision se sem `cf_id`
- UI Partner: botão **Atualizar status SSL**
- Super Admin Partner detail: card **Subdomínio do canal (PE)** com DNS/SSL/CF id/erro

### Docs
- [`RUNBOOK_PE_INCIDENTES.md`](./RUNBOOK_PE_INCIDENTES.md) — 404, SSL stuck, órfão, cota, bypass, link errado
- Checklist go-live (abaixo)

### Backlog explícito
| Item | Destino |
|------|---------|
| Domínio apex (A genérico) | Fora — Apex Proxying / ALIAS |
| Tenant loja/chamados no mesmo edge | [`PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md`](./PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md) |
| Partner WL via TE shared client | Reusar CF client PE3 |

---

## Checklist go-live produção (ops)

Copiar e marcar no deploy:

### Env / flags
- [ ] Migration `353` aplicada
- [ ] `PARTNER_WL_CNAME_TARGET=customers.<zona>`
- [ ] `CF_SAAS_ZONE_ID` + `CF_SAAS_API_TOKEN` (secrets)
- [ ] `FRONTEND_URL` / `PUBLIC_APP_URL` HTTPS canônicos
- [ ] `partner.channel_v1` ON
- [ ] Super Admin → **Avançado → Feature Flags** → `partner.edge_cloudflare_saas_v1` = **ON** (default OFF)
- [ ] `partner.domain_verify_bypass` **OFF**

### Edge
- [ ] Fallback origin Active
- [ ] Origin Host rewrite ativo
- [ ] Zero Add Domain Easypanel por Partner novo

### Piloto
- [ ] 1 Partner real: subdomínio → verify → SSL active
- [ ] `https://{sub}/cadastro` → compra/trial OK
- [ ] Marca Partner · gateway Partner
- [ ] Link de vendas usa o subdomínio
- [ ] Clear remove Custom Hostname (teste em staging ou Partner de teste)

---

## DoD

| Item | Estado |
|------|--------|
| Hardening app + cf-sync + Super Admin card | **OK** |
| Runbook incidentes | **OK** |
| Checklist go-live / piloto | **Ops** (marcar acima) |
| Apex / TE na fila | **Documentado** |

---

## Fase PE-Go: completa (código)

Etapas 0–5 entregues no repositório. Pendência residual = execução ops do checklist neste closeout + piloto.
