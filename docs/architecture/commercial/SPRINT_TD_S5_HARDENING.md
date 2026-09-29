# TD Sprint 5 — Hardening (produção estável)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S5** (feito) |
| **Plano-mãe** | [`PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md`](./PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md) |
| **Anterior** | [`SPRINT_TD_S4_CORS_TLS_CANONICAL.md`](./SPRINT_TD_S4_CORS_TLS_CANONICAL.md) |
| **Próximo** | — (MVP TD completo; backlog: apex, host `app` CRM) |

---

## Entregas

### Rate limit verify
- `domainVerifyRateLimit.ts` — **5 / minuto** por chave (`tenant:{id}` | `partner:{id}`)
- Env opcional: `RATE_LIMIT_DOMAIN_VERIFY_MAX`
- Aplicado em `POST /api/me/tenant/domain/verify` e `POST /api/partner/domain/verify` → **429** `RATE_LIMITED`

### Recheck DNS (opcional)
- Job `tenantHostDnsRecheckJob.ts`
- Ligar: `TENANT_CUSTOM_DOMAIN_DNS_RECHECK=1`
- Intervalo: `TENANT_HOST_DNS_RECHECK_POLL_MS` (default 6h)
- Hosts `active` sem TXT/CNAME → `pending` + `last_error`; invalida CORS

### Colisões (testes)
| Caso | Código |
|------|--------|
| Tenant set vs Partner domain | `DOMAIN_TAKEN_PARTNER` |
| Partner set vs `tenant_hosts` | `DOMAIN_TAKEN_TENANT` |
| Tenant vs outro tenant | `DOMAIN_TAKEN` |
| Mesmo hostname store↔support | `DOMAIN_TAKEN_ROLE` |
| change-role com destino ocupado | `DOMAIN_TAKEN_ROLE` |
| Verify falha em host active | demove → `pending` (TD10) |

### Auditoria / métricas
- Logs JSON `[tenant-domain]`: `domain_set`, `domain_verify`, `domain_verify_rate_limited`, `domain_collision`, `domain_clear`, `domain_change_role`, `dns_recheck`
- Super Admin clear → `super_admin_audit_log` action `tenant.custom_domain_cleared`

### Política `tenants.domain` (TD6)
- **Legado / metadado** (merge fields, templates, export)
- **Não** roteia Host nem CORS
- SSOT público: `tenant_hosts` + Settings Domínio / Super Admin card “Domínios personalizados”
- UI Super Admin: label “Domínio (legado / metadado)” + nota explicativa

---

## Rollout por flag

## Rollout por flag

| Ambiente | Domínio personalizado | `tenant.domain_verify_bypass` | DNS recheck |
|----------|----------------------|-------------------------------|-------------|
| Dev | **ON (código + migration)** | ON (ok) | off ou on |
| Staging | **ON** | OFF | opcional |
| Produção | **ON** | **NUNCA** | opcional |

**Ativação:** não exige env. CNAME target = `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` → `PARTNER_WL_CNAME_TARGET` → host de `FRONTEND_URL`/`PUBLIC_APP_URL` → `painelcrm.com`.

**Desligar:** kill switch `tenant.master_off` **ou** `TENANT_CUSTOM_DOMAIN_V1=false`.

1. Migrations até `346` aplicadas
2. Edge deve aceitar Host do subdomínio do cliente (mesmo app que `FRONTEND_URL`)
3. Cliente cria TXT + CNAME; Verifica DNS na Settings


---

## DoD S5

- [x] Rate limit verify
- [x] Recheck DNS opcional
- [x] Testes colisão Partner↔Tenant e store↔support
- [x] Política `tenants.domain` legado documentada + UI
- [x] Auditoria (SA) + métricas (logs estruturados)
- [x] Rollout por flag documentado

**Kickoff chat:** `ok sprint 5`
