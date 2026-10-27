# TE Sprint 0 — Inventário, ADR e decisões (Cloudflare for SaaS) — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Sprint** | **TE0** (**feito**) |
| **Plano-mãe** | [`PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md`](./PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md) |
| **Anterior** | MVP TD S0–S5 · PE-Go completo ([`PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md`](./PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md)) |
| **Próximo** | TE1 **feita** → [`SPRINT_TE_S1_OPS_SMOKE.md`](./SPRINT_TE_S1_OPS_SMOKE.md) · seguinte: `ok sprint te2` |

---

## Objetivo

Fechar decisões TE1–TE10, inventariar gap Easypanel vs app TD, e alinhar reuso do edge já construído no Partner (PE).

---

## ADR — por que Cloudflare for SaaS

| Opção | Veredito |
|-------|----------|
| Add Domain no Easypanel por host | **Rejeitado** — inviável em escala (já visto em produção: 404) |
| Traefik catch-all + ACME on-demand | Possível, frágil em cima do Easypanel; rate-limit LE |
| **Cloudflare for SaaS** | **Escolhido** — TLS + Custom Hostnames; Origin Host rewrite evita cadastro no Traefik |

**Decisão:** mesmo edge da fase PE (Partner). TE **não** recria zona/fallback; reutiliza `customers.<zona>`, `CF_SAAS_*`, Origin Rule. Só falta provisionar Custom Hostname em `tenant_hosts` (espelho do fluxo Partner).

---

## Decisões fechadas (TE0)

| ID | Tema | Fechado |
|----|------|--------|
| **TE1** | Edge | Cloudflare for SaaS (igual PE) |
| **TE2** | Tipo de host | **Somente subdomínio** (alinhar validação à PE Etapa 1 em TE2/TE3). Apex fora |
| **TE3** | CNAME target | `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` → preferir **mesmo** valor que `PARTNER_WL_CNAME_TARGET` (ex. `customers.painelcrm.com`) |
| **TE4** | Provisionar CF | Após verify → `active` (TXT/bypass); SSL async |
| **TE5** | Abrir loja/portal | Permitir com `tenant_hosts.active` + banner se SSL CF pending (paridade PE Etapa 4) |
| **TE6** | Clear | Delete Custom Hostname + limpar row/`cf_*` |
| **TE7** | Flag | `tenant.edge_cloudflare_saas_v1` default **OFF** até TE1 ok |
| **TE8** | Partner | **Já feito (PE-Go)** — reusar `cloudflareCustomHostnameClient` + env `CF_SAAS_*`; não duplicar ops |
| **TE9** | Custo | Mesma cota CF (100 + US$ 0,10); Partner + Tenant compartilham |
| **TE10** | Segredos | Só backend; nunca FE |
| **TE11** | Subdomínio API | TE2: reutilizar `isPartnerSubdomainHostname` (extrair shared) ou espelho em tenant |
| **TE12** | Colisão | Manter: hostname único vs Partner `custom_domain` e demais `tenant_hosts` |

---

## Inventário — app TD (já existe)

| Peça | Estado |
|------|--------|
| `tenant_hosts` (role `store`\|`support`) | Migration `339` |
| Flag `tenant.custom_domain_v1` | ON por padrão (`341`/`346`) |
| Set/verify/clear | `tenantDomainService.ts` |
| TXT `_painelcrm-tenant.` + CNAME | Instruções na API/UI |
| CNAME resolver | `getTenantCustomDomainCnameTarget()` → env tenant → Partner → PUBLIC_APP → `painelcrm.com` |
| Resolve público | `GET /api/public/tenant-host?domain=` |
| FE bootstrap | `TenantHostProvider` → loja \| portal |
| CORS | hosts `active` em allowlist |
| UI Settings | `DomainSection.tsx` (Loja \| Chamados) |
| Job recheck DNS | `tenantHostDnsRecheckJob` |

### Gaps vs PE (o que TE ainda não tem)

| Gap | Sprint |
|-----|--------|
| Colunas `cf_*` em `tenant_hosts` | TE2 |
| Flag `tenant.edge_cloudflare_saas_v1` | TE2 |
| Hook verify/clear → CF (reusar client PE) | TE2 |
| Validação só subdomínio (apex) no tenant | TE2 |
| UI SSL badge / banner / cf-sync | TE3 |
| Hardening + E2E + incidente tenant | TE4 |
| Ops CF zona nova | **TE1** — se PE já aplicou runbook, TE1 = **verificar** + apontar `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` |

### Edge (compartilhado com PE)

| Item | Doc |
|------|-----|
| Fallback + customers + Origin rewrite | [`RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md`](./RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md) |
| Cliente API CF | `packages/backend/src/partner/cloudflareCustomHostnameClient.ts` |
| Env | `CF_SAAS_ZONE_ID`, `CF_SAAS_API_TOKEN`, `PARTNER_WL_CNAME_TARGET` |

**Nota TE0:** mover client CF para `packages/backend/src/cloudflare/` (shared) é desejável na TE2 para não acoplar tenant→partner; aceitável importar do partner no primeiro PR se preferir velocidade.

---

## Contratos TE2 (rascunho)

```
verifyTenantDomain → status active
  → if tenant.edge_cloudflare_saas_v1 && CF configured
  → create/reuse Custom Hostname
  → persist tenant_hosts.cf_*

clearTenantDomain / clear by role
  → delete Custom Hostname
  → clear cf_*
```

Falha CF **não** reverte `active` (igual PE).

UX TE3: abrir `canonical_public_url` com banner SSL pending.

---

## Checklist TE1 (ops)

- [ ] Confirmar runbook PE já aplicado em staging/prod (fallback, Origin Rule, `customers.`)
- [ ] `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` = mesmo target que Partner (ou omitir e herdar `PARTNER_WL_CNAME_TARGET`)
- [ ] Prova manual: 1 `tenant_hosts` store + Custom Hostname manual → loja abre (não 404 / não home)
- [ ] Se PE ainda não foi aplicado: executar [`RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md`](./RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md) primeiro

---

## DoD TE0

- [x] ADR Cloudflare (reuso PE)
- [x] Inventário TD + gaps
- [x] Decisões TE1–TE12 fechadas
- [x] Contratos TE2/TE3 esboçados
- [x] Plano-mãe atualizado

---

## Kickoff próximo

`ok sprint te1` — validar/completar ops CF para tenant (ou marcar N/A se PE edge já serve).
