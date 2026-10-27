# PE Etapa 1 — Só subdomínio (app) — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Etapa** | **1** (**feito**) |
| **Plano-mãe** | [`PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md`](./PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md) |
| **Anterior** | [`SPRINT_PE_E0_INVENTORY.md`](./SPRINT_PE_E0_INVENTORY.md) |
| **Próximo** | Etapa 2 **feita** → [`SPRINT_PE_E2_OPS_CLOUDFLARE.md`](./SPRINT_PE_E2_OPS_CLOUDFLARE.md) · seguinte: `ok pe etapa 3` |

---

## Objetivo

Painel e API rejeitam domínio raiz (apex); copy e instruções DNS alinhados a **somente subdomínio**.

---

## Entregas

### Backend
- `partnerHostname.ts` — `isPartnerSubdomainHostname` (apex `.com` / `.com.br` etc. → false)
- `setPartnerDomain` → erro `DOMAIN_SUBDOMAIN_REQUIRED` com mensagem acionável
- Testes: `partnerHostname.test.ts` + caso apex em `partnerDomainService.test.ts`

### Frontend
- `PartnerDomainPage`: copy “subdomínio”, exemplos, nota sobre `/cadastro`
- Instruções DNS: TXT + **CNAME host/target** (aviso se `PARTNER_WL_CNAME_TARGET` ausente)

### Docs
- Este closeout · plano-mãe · S2 DNS

---

## DoD

- [x] Apex `empresa.com` / `empresa.com.br` rejeitado na API
- [x] Subdomínio `crm.empresa.com` / `crm.empresa.com.br` aceito
- [x] UI sem convidar domínio raiz
- [x] Testes unitários OK

---

## Kickoff próximo

`ok pe etapa 2` — runbook Cloudflare + Easypanel + prova HTTPS no subdomínio de teste.
