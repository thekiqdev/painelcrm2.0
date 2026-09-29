# TD Sprint 4 — CORS + TLS edge + URLs canônicas

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S4** (feito) |
| **Plano-mãe** | [`PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md`](./PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md) |
| **Anterior** | [`SPRINT_TD_S3_SETTINGS_UI.md`](./SPRINT_TD_S3_SETTINGS_UI.md) |
| **Próximo** | — (MVP TD completo) |

---

## Entregas

### CORS / Socket.IO
- `corsOrigins.ts`: origens estáticas (env + localhost) **+** hosts `tenant_hosts` com `status=active` **+** Partner `custom_domain` `verified|active`
- Express e Socket.IO usam `corsOriginDelegate` (callback dinâmico)
- Cache TTL 60s; invalidação em verify/clear/change-role (tenant) e verify/clear (Partner)

### URLs canônicas
- `tenantPublicUrls.ts`: `buildCanonicalStoreUrl` / `buildCanonicalSupportPortalUrl`
- Host `active` → `https://{hostname}` (raiz); senão path legado na base da plataforma
- API domínio: campo `canonical_public_url` quando `active`
- Portal de suporte: `public_url` absoluto canônico
- FE: Products, StoreSettings, StoreSettingsForm, PublicSupportPortalSettingsSection

### Ops / TLS (edge)
- Node **não** emite certificado (MVP)
- Cliente aponta CNAME do hostname → `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` (fallback `PARTNER_WL_CNAME_TARGET`)
- Edge (Easypanel / Traefik / nginx) termina TLS e encaminha para o mesmo frontend/API

---

## Runbook — staging E2E

### Pré-requisitos
1. Flag `tenant.custom_domain_v1` = ON
2. Env: `TENANT_CUSTOM_DOMAIN_CNAME_TARGET=seu-edge.exemplo.com` (ou Partner WL target)
3. Edge: certificado válido para o hostname do cliente (SNI) apontando para o app

### DNS do cliente
| Tipo | Nome | Valor |
|------|------|--------|
| TXT | `_painelcrm-tenant.<hostname>` | token (Settings → Domínio) |
| CNAME | `<hostname>` | `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` |

### Passos
1. Settings → Domínio → Loja: salvar hostname → Verificar → `active`
2. (Opcional) segundo hostname role Support
3. Browser em `https://loja.cliente…` → vitrine (não landing CRM)
4. Browser em `https://suporte.cliente…` → portal de chamados
5. DevTools → Network: requests `/api/*` e `/socket.io` **sem** erro CORS
6. Products / Store settings / Portal settings: link “Abrir” usa o host canônico

### Checklist DoD
- [ ] DNS + cert no edge
- [ ] Host store abre loja
- [ ] Host support abre portal
- [ ] CORS OK na origem customizada
- [ ] Links canônicos nas Settings

---

## DoD S4

- [x] CORS/Socket allowlist com hosts `active`
- [x] URLs canônicas loja + portal
- [x] Runbook TLS/CNAME
- [x] Testes unitários (cors + public urls)

**Kickoff chat:** `ok sprint 4`
