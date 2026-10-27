# PE Etapa 3 — Automação Custom Hostname (verify/clear) — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Etapa** | **3** (**feito**) |
| **Plano-mãe** | [`PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md`](./PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md) |
| **Runbook ops** | [`RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md`](./RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md) |
| **Anterior** | [`SPRINT_PE_E2_OPS_CLOUDFLARE.md`](./SPRINT_PE_E2_OPS_CLOUDFLARE.md) |
| **Próximo** | Etapa 4 **feita** → [`SPRINT_PE_E4_UI_SSL_E2E.md`](./SPRINT_PE_E4_UI_SSL_E2E.md) · seguinte: `ok pe etapa 5` |

---

## Objetivo

Verify/`active` e clear do Partner sincronizam **Custom Hostname** na Cloudflare (sem clique ops por domínio).

---

## Entregas

### DB / flags
- Migration `353_partner_edge_cloudflare_saas_pe3.sql` (+ supabase `20261019150000_…`)
- Colunas `partner_profiles.cf_*`
- Flag `partner.edge_cloudflare_saas_v1` (default **OFF**, kill `partner.master_off`)

### Backend
- `cloudflareCustomHostnameClient.ts` — create / get / find / delete
- `partnerCloudflareHostnameService.ts` — provision / deprovision / sync
- Hooks: `verifyPartnerDomain` → provision; `clearPartnerDomain` → deprovision (antes do clear)
- Falha CF **não** reverte `domain_status=active`
- `DomainInstructions` inclui `cf_ssl_status`, `cf_last_error`, etc.
- Env: `CF_SAAS_ZONE_ID`, `CF_SAAS_API_TOKEN` (+ contingência `PARTNER_EDGE_CLOUDFLARE_SAAS_V1` / `CF_SAAS_ENABLED`)

### Frontend
- Badge **SSL:** status + erro CF na tela Domínio Partner

### Testes
- `partnerCloudflareHostnameService.test.ts`, flags, domain verify chama provision

---

## Como ligar em staging

1. Runbook Etapa 2 aplicado (fallback + Origin Host rewrite + `PARTNER_WL_CNAME_TARGET`)
2. Secrets no Easypanel: `CF_SAAS_ZONE_ID`, `CF_SAAS_API_TOKEN`
3. Rodar migration `353`
4. Super Admin → Feature Flags → `partner.edge_cloudflare_saas_v1` = **ON**
5. Partner: salvar subdomínio → DNS → Verificar → conferir Custom Hostname na CF + badge SSL na UI

---

## DoD

- [x] Flag + migration
- [x] Verify provisiona (flag ON + API configurada)
- [x] Clear remove na CF
- [x] Falha CF não corrompe posse TXT/`active`
- [x] Status SSL na API/UI básica
- [ ] Validação E2E staging *(ops — Etapa 4)*

---

## Kickoff próximo

`ok pe etapa 4`
