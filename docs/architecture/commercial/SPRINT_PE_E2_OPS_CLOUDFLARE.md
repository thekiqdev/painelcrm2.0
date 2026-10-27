# PE Etapa 2 — Ops Cloudflare + Easypanel — **FEITO (runbook)**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Etapa** | **2** (**feito** — entregável = runbook; prova HTTPS = checklist ops) |
| **Plano-mãe** | [`PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md`](./PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md) |
| **Runbook** | [`RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md`](./RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md) |
| **Anterior** | [`SPRINT_PE_E1_SUBDOMAIN_ONLY.md`](./SPRINT_PE_E1_SUBDOMAIN_ONLY.md) |
| **Próximo** | Etapa 3 **feita** → [`SPRINT_PE_E3_CLOUDFLARE_PROVISION.md`](./SPRINT_PE_E3_CLOUDFLARE_PROVISION.md) · seguinte: `ok pe etapa 4` |

---

## Objetivo

Edge pronto para subdomínio Partner **sem** Add Domain por Partner no Easypanel: Cloudflare for SaaS + fallback origin + **Origin Host rewrite** + `PARTNER_WL_CNAME_TARGET`.

---

## Entregas (repo)

- [x] Runbook completo: zona CF, fallback, CNAME target `customers.…`, Origin Host header, prova manual, rollback
- [x] Helper env `packages/backend/src/config/partnerCloudflareSaasEnv.ts` (CNAME + CF_* para Etapa 3)
- [x] Ponteiros no plano-mãe e Easypanel deploy

---

## Checklist ops (ambiente — executar no staging)

Use o runbook seção A–C. Marque quando validar:

- [ ] Fallback origin Active na CF
- [ ] `customers.<zona>` proxied → fallback
- [ ] Origin Rule: Host no origin = hostname já no Easypanel
- [ ] Backend: `PARTNER_WL_CNAME_TARGET=customers.<zona>`
- [ ] Custom Hostname **manual** do subdomínio de teste: `status` + `ssl` active
- [ ] `GET /api/public/partner-brand?domain=…` → 200 + brand
- [ ] `https://{sub}/cadastro` → checkout do canal
- [ ] **Sem** Add Domain desse sub no Easypanel

> Esta etapa **não** configura a conta Cloudflare do cliente a partir do Cursor — o time de ops aplica o runbook e marca o checklist acima.

---

## DoD

| Item | Estado |
|------|--------|
| Runbook aplicável | **OK** |
| Prova HTTPS staging | **Pendente ops** (checklist acima) |
| Automação API CF | Etapa 3 |

---

## Kickoff próximo

`ok pe etapa 3` — provisionar/desprovisionar Custom Hostname no verify/clear Partner.
