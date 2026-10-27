# PE Etapa 0 — Inventário e decisões (subdomínio Partner) — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Etapa** | **0** (**feito**) |
| **Plano-mãe** | [`PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md`](./PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md) |
| **Anterior** | M5 S2 + S7 (app canal) |
| **Próximo** | Etapa 1 **feita** → [`SPRINT_PE_E1_SUBDOMAIN_ONLY.md`](./SPRINT_PE_E1_SUBDOMAIN_ONLY.md) · seguinte: `ok pe etapa 2` |

---

## Objetivo

Confirmar inventário de flags/env, fluxo domínio + checkout, gaps de produto/edge e rascunho Cloudflare antes de código/ops de produção.

---

## Decisões fechadas (Etapa 0)

| ID | Tema | Fechado |
|----|------|--------|
| **PE0.1** | Tipo de host | **Somente subdomínio** (ex. `crm.revenda.com.br`) |
| **PE0.2** | Apex | **Fora** desta implantação (backlog) |
| **PE0.3** | Superfície DoD | `https://{subdomínio}/cadastro` → checkout planos Partner |
| **PE0.4** | Edge | **Cloudflare for SaaS** + Origin Host rewrite → Easypanel |
| **PE0.5** | Ordem | Partner go-live **antes** de TE tenant (loja/chamados); mesmo edge CF |
| **PE0.6** | Automação CF | Etapa 3; Etapa 2 = prova **manual** na CF |
| **PE0.7** | Flag edge | Nome: `partner.edge_cloudflare_saas_v1` (criar na Etapa 3; default OFF até ops OK) |

---

## Inventário — o que já existe no app

### Flags (`platform_feature_flags`)

| Flag | Seed default | Uso |
|------|--------------|-----|
| `partner.channel_v1` | **OFF** (`rollout_type=off`) | Canal: APIs + UI `/partner` + Super Admin Partners |
| `partner.domain_verify_bypass` | OFF | Dev/staging: `active` sem DNS — **nunca prod** |
| `partner.master_off` | OFF | Kill switch namespace partner |
| `partner.edge_cloudflare_saas_v1` | **não existe** | Criar na Etapa 3 |

Env contingência (só se flag ausente no DB): `PARTNER_CHANNEL_V1`, `PARTNER_DOMAIN_VERIFY_BYPASS`.

### Env relevantes

| Variável | Estado no código | Nota |
|----------|------------------|------|
| `PARTNER_WL_CNAME_TARGET` | Lido em `partnerDomainService.cnameTarget()` | Se vazio: instrução CNAME sem target; verify CNAME falha (TXT/bypass ainda ok) |
| `PARTNER_WL_BLOCKED_HOSTS` | Default `localhost,127.0.0.1` | Incluir hosts da plataforma na Etapa 1/2 |
| `PUBLIC_APP_URL` / `FRONTEND_URL` | Sale-link origin (`resolveSaleLinkOrigin`) | Sem domínio WL: link `/{slug}/cadastro` |
| `CF_SAAS_ZONE_ID` / `CF_SAAS_API_TOKEN` | **não existem** | Etapa 2/3 |

Nenhum `.env` versionado com esses valores — configurar no Easypanel/staging na Etapa 2.

### Domínio Partner (S2)

| Peça | Path / API |
|------|------------|
| Set / get / verify / clear | `partnerDomainService.ts` · `/api/partner/domain*` |
| TXT | `_painelcrm-partner.<hostname>` = token |
| CNAME | hostname → `PARTNER_WL_CNAME_TARGET` |
| Verify OK | `domain_status = active` (+ CORS cache invalidate) |
| Marca pública | `GET /api/public/partner-brand?domain=` · `PartnerBrandProvider` |
| Colisão | vs outro Partner e vs `tenant_hosts` |

**Gap produto (Etapa 1):** `setPartnerDomain` aceita qualquer host com `.` — **não rejeita apex** (`empresa.com.br`). UI sugere subdomínio mas não bloqueia.

### Checkout / sale-link (S7)

| Peça | Comportamento |
|------|----------------|
| Sem WL | `https://{PUBLIC_APP_URL}/{partnerSlug}/cadastro` |
| Com WL `active` | `https://{custom_domain}/cadastro` (+ `/{sellerId}/cadastro`) |
| FE rotas | `/cadastro`, `/:partnerSlug/cadastro`, `/:partnerSlug/:sellerId/cadastro` → `PartnerChannelCheckout` |
| Planos | `partner_sell_plans` do Partner |
| Gateway | Asaas do Partner |

Testes de regressão sale-link: `partnerChannelS73.regression.test.ts`.

### Edge / Easypanel

| Peça | Estado |
|------|--------|
| Cadastro automático de hostname no Traefik | **Não** — mesmo gap do TD |
| Campos `cf_*` em `partner_profiles` | **Não** |
| Cliente API Cloudflare | **Não** |

Sem Custom Hostname / domínio no Easypanel → risco **404 Easypanel** (já observado em host tenant).

---

## Checklist Etapa 0 (ops humano — staging)

Itens de ambiente (não verificáveis só pelo repo):

- [ ] Em staging: ligar `partner.channel_v1` (Super Admin → Feature Flags)
- [ ] Partner de teste com sell-plans `active` + gateway Asaas sandbox
- [ ] Confirmar valor atual de `PARTNER_WL_CNAME_TARGET` no deploy (ou ausente)
- [ ] Conta Cloudflare + zona da plataforma (existe ou criar na Etapa 2)
- [ ] Anotar hostname do origin Easypanel já cadastrado (ex. `painelcrm.com`) para fallback CF

---

## Rascunho ops Cloudflare (input Etapa 2)

| Item | Valor alvo (preencher na Etapa 2) |
|------|-----------------------------------|
| Zona | `painelcrm.com` (ou domínio canônico da Platform) |
| Fallback origin | hostname do serviço FE/API no Easypanel |
| Origin Host rewrite | `Host` → mesmo hostname já no Traefik |
| CNAME target público | ex. `customers.painelcrm.com` → `PARTNER_WL_CNAME_TARGET` |
| Prova manual | 1 Custom Hostname = subdomínio do Partner de teste |

---

## Gaps → próximas etapas

| Gap | Etapa |
|-----|--------|
| Rejeitar apex + copy UI | **1** |
| CF zona + Origin rewrite + prova HTTPS `/cadastro` | **2** |
| API CF no verify/clear + flag + `cf_*` | **3** |
| UI SSL + E2E compra no subdomínio | **4** |
| Prod + piloto + runbook | **5** |

---

## DoD Etapa 0

- [x] Decisões PE0.1–PE0.7 fechadas
- [x] Inventário flags/env/APIs/rotas documentado
- [x] Gap apex e gap edge identificados
- [x] Rascunho CF para Etapa 2
- [x] Plano-mãe atualizado (status Etapa 0)

---

## Kickoff próximo

`ok pe etapa 1` — validação só subdomínio no app (API + UI Partner).
