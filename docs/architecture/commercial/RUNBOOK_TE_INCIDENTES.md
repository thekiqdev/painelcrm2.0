# Runbook de incidentes — Domínio personalizado Tenant (TE)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Fase** | TE Sprint 4 |
| **Ops edge** | [`RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md`](./RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md) |
| **Smoke** | [`RUNBOOK_TE_TENANT_EDGE_SMOKE.md`](./RUNBOOK_TE_TENANT_EDGE_SMOKE.md) |
| **Partner (paridade)** | [`RUNBOOK_PE_INCIDENTES.md`](./RUNBOOK_PE_INCIDENTES.md) |

---

## 1. 404 Easypanel no subdomínio do tenant

**Sintoma:** página “404 Não Encontrado” (logo Easypanel).

**Causa provável:** Origin Host rewrite ausente / fallback errado.

**Ações:**
1. CNAME do tenant → `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` (ou `PARTNER_WL_CNAME_TARGET`)
2. CF → Custom Hostname existe (`tenant_hosts.cf_custom_hostname_id`)
3. Origin Rule: Host no origin = hostname já no Easypanel
4. **Não** Add Domain por tenant no Easypanel

---

## 2. Abre home da Platform em vez da loja/portal

**Sintoma:** HTTPS ok, mas cai na landing / home.

**Ações:**
1. `GET /api/public/tenant-host?domain={host}` → 200 com `role` `store`|`support` e `status=active`
2. `tenant_hosts.status` = `active`
3. Flag `tenant.custom_domain_v1` ON
4. CORS: origem `https://{host}` na allowlist dinâmica
5. FE: bootstrap por Host (não slug)

---

## 3. Certificado SSL stuck (pending)

**Sintoma:** badge SSL “Validando” / “Emitindo” por >30–60 min.

**Ações:**
1. Settings Domínio → **Atualizar status SSL** (`POST /api/me/tenant/domain/cf-sync`)
2. Super Admin → Domínios do tenant → **Resync CF**
3. CF dashboard → Custom Hostname → validation (TXT/HTTP DCV)
4. Confirmar CNAME → target SaaS
5. Se órfão: Remover domínio no Settings + recriar; ou delete Custom Hostname na CF e verify de novo

---

## 4. DNS verificado mas `cf_last_error`

**Sintoma:** DNS Ativo + alert Cloudflare na UI.

**Ações:**
1. Ler `cf_last_error` (Settings ou Super Admin)
2. `CF_SAAS_ZONE_ID` / `CF_SAAS_API_TOKEN` no Easypanel
3. Super Admin → Avançado → Feature Flags → `tenant.edge_cloudflare_saas_v1` = **ON**
4. Token com Custom Hostnames Edit
5. **Atualizar status SSL** / Resync CF / Verificar DNS

---

## 5. Clear deixou Custom Hostname órfão na CF

**Ações:**
1. CF → Custom Hostnames → delete pelo hostname
2. Confirmar `CF_SAAS_*` no clear (sem token, só limpa espelho local)
3. SQL ops:
```sql
SELECT id, tenant_id, hostname, role, status,
       cf_custom_hostname_id, cf_ssl_status, cf_last_error
FROM tenant_hosts
WHERE cf_custom_hostname_id IS NOT NULL;
```

---

## 6. Cota Cloudflare (100 hostnames — Partner + Tenant)

**Monitorar (cota compartilhada):**
```sql
SELECT
  (SELECT count(*) FROM partner_profiles WHERE cf_custom_hostname_id IS NOT NULL) AS partner_cf,
  (SELECT count(*) FROM tenant_hosts WHERE cf_custom_hostname_id IS NOT NULL) AS tenant_cf;
```

**Ações:** hostname packs CF · limpar órfãos · arquivar hosts inativos.

---

## 7. Bypass DNS em produção

**Sintoma:** log `[tenant-domain] domain_verify_bypass ativo em production`.

**Ação:** Super Admin → `tenant.domain_verify_bypass` = **OFF**.

---

## 8. Apex rejeitado / cliente insiste em domínio raiz

**Sintoma:** erro `DOMAIN_SUBDOMAIN_REQUIRED`.

**Resposta produto:** nesta fase só subdomínio. Apex com A genérico = Cloudflare Apex Proxying (Enterprise) ou ALIAS/flattening no DNS do cliente — **backlog**, não workaround no Easypanel.

---

## Contatos / escalação

1. Este runbook  
2. [`RUNBOOK_TE_TENANT_EDGE_SMOKE.md`](./RUNBOOK_TE_TENANT_EDGE_SMOKE.md)  
3. [`RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md`](./RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md)  
4. Logs `[tenant-cf]` / `[tenant-domain]`
