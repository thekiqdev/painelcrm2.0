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

| Ambiente | `tenant.custom_domain_v1` | `tenant.domain_verify_bypass` | DNS recheck |
|----------|---------------------------|-------------------------------|-------------|
| Dev | **ON (default)** | ON (ok) | off ou on |
| Staging | **ON (default)** | OFF | opcional `TENANT_CUSTOM_DOMAIN_DNS_RECHECK=1` |
| Produção | **ON (default)** | **NUNCA** | opcional após monitoramento |

1. Flag já vem **Enabled + global** (migration `341`). Para desligar: Super Admin → Feature Flags → `tenant.custom_domain_v1` OFF, ou kill switch `tenant.master_off`.
2. Confirmar `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` (ou Partner WL) no edge
3. CORS dinâmico já cobre hosts `active` (S4)
4. Validar E2E S4 checklist
5. (Opcional) ligar recheck DNS e acompanhar logs `dns_recheck`

---

## DoD S5

- [x] Rate limit verify
- [x] Recheck DNS opcional
- [x] Testes colisão Partner↔Tenant e store↔support
- [x] Política `tenants.domain` legado documentada + UI
- [x] Auditoria (SA) + métricas (logs estruturados)
- [x] Rollout por flag documentado

**Kickoff chat:** `ok sprint 5`
