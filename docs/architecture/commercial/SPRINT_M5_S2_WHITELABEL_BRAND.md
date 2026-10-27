# M5 S2 — White-label 100% (domínio + marca)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-13 |
| **Sprint** | **S2** (feito) |
| **Plano-mãe** | [`PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md`](./PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md) |
| **Próximo** | **S3** — Programa + planos + gateway Partner |

---

## Entregas

### Backend
- `partnerBrandResolver.ts` — marca por Host / tenant (e-mails)
- `partnerDomainService.ts` — set domain, verify TXT/CNAME, bypass dev
- `GET /api/public/partner-brand?domain=`
- `GET/POST /api/partner/domain`, `POST .../verify`, `DELETE .../domain`
- `platform.name` em notificações de negócio resolve marca do Partner quando tenant é canal
- Pay page SaaS: `platform_name` via brand resolver

### Frontend
- `PartnerBrandProvider` (root) — carrega marca pelo hostname
- `AuthLayout`, `CheckoutShellHeader`, `TenantSidebarMark` usam `displayName` / logo
- `/partner` — UI marca + domínio + instruções DNS

### Testes
- 13 testes partner (incl. brand + domain) — OK

---

## DNS

| Método | Como |
|--------|-------|
| **Tipo de host (go-live 2026-10-19)** | **Somente subdomínio** (ex. `crm.suaempresa.com.br`). Apex fora — ver [`PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md`](./PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md) |
| **TXT** | Host `_painelcrm-partner.<subdominio>` = token |
| **CNAME** | `<subdominio>` → `PARTNER_WL_CNAME_TARGET` (env; em prod = target Cloudflare for SaaS) |
| **Dev** | Super Admin → Feature Flags → **`partner.domain_verify_bypass` = ON** (marca `active` sem DNS) |

Após verify OK → `domain_status = active` → Host passa a servir marca 100% (sem “PainelCRM”).

**O que o Host abre:** marca WL + checkout do canal em `/cadastro` (planos do Partner) — detalhe S7 e plano de implantação PE-Go.

---

## Como validar

1. Feature Flags: `partner.channel_v1` ON (+ opcional `partner.domain_verify_bypass`)
2. Partner criado (S1); em `/partner`: salvar marca + domínio
3. Configurar DNS **ou** bypass via flag
4. Verificar DNS → status `active`
5. Abrir app no hostname do Partner → login/checkout/sidebar com marca do Partner

---

## DoD S2

- [x] Custom domain + verificação DNS
- [x] Tema/marca em login, checkout, e-mails (merge `platform.name`), app (sidebar fallback)
- [x] Zero menção PainelCRM no host Partner (auth/checkout/header)
- [x] Fallback host Platform = venda direta
