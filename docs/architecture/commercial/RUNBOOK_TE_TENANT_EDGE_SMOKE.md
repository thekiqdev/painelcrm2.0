# Runbook — Smoke Tenant Edge (loja / chamados) no Cloudflare for SaaS

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Fase** | TE Sprint 1 ([`SPRINT_TE_S1_OPS_SMOKE.md`](./SPRINT_TE_S1_OPS_SMOKE.md)) |
| **Plano** | [`PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md`](./PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md) |
| **Edge base (não duplicar)** | [`RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md`](./RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md) |

Objetivo: provar que um **subdomínio de tenant** (`loja.*`, role `store`) chega no app **sem** Add Domain no Easypanel e abre a **loja** (não 404 Easypanel, não home Platform).

---

## 0. Pré-requisito: edge PE

Se fallback origin / `customers.<zona>` / Origin Host rewrite **ainda não** existem, execute **antes** as seções A–B do runbook Partner.

Se PE já está em staging/prod, pule para a seção 1.

Checklist rápido:

- [ ] Fallback origin Active
- [ ] `customers.<zona>` proxied → fallback
- [ ] Origin Rule: Host no origin = hostname já no Easypanel
- [ ] `PARTNER_WL_CNAME_TARGET` (ou equivalente) = `customers.<zona>`

---

## 1. Env tenant (Easypanel)

Alinhar CNAME do tenant ao **mesmo** target SaaS do Partner:

```text
TENANT_CUSTOM_DOMAIN_CNAME_TARGET=customers.<sua-zona>
```

Se omitido, o código já faz fallback para `PARTNER_WL_CNAME_TARGET` → `FRONTEND_URL` → `painelcrm.com`  
(`getTenantCustomDomainCnameTarget` em `tenantDomainFlags.ts`).

Recomendado em prod: **setar explicitamente** o mesmo valor do Partner.

Opcional (TE2+):

```text
CF_SAAS_ZONE_ID=...
CF_SAAS_API_TOKEN=...
```

(TE1 ainda usa Custom Hostname **manual** na CF.)

---

## 2. App — domínio loja (Settings)

1. Tenant `platform_customer` com loja/`store_slug` ativo  
2. Flag `tenant.custom_domain_v1` ON (default)  
3. Settings → **Domínio** → papel **Loja**  
4. Salvar subdomínio (ex. `loja-teste.seudominio.com.br`)  
5. Copiar TXT + CNAME da UI  

| Tipo | Nome | Valor |
|------|------|--------|
| TXT | `_painelcrm-tenant.<sub>` (conforme UI) | token |
| CNAME | `<sub>` | `customers.<zona>` |

6. **Verificar DNS** → status `active`  
   - Staging: pode usar `tenant.domain_verify_bypass` (nunca em prod)

---

## 3. Cloudflare — Custom Hostname manual (TE1)

1. CF → Custom Hostnames → **Add** → hostname = subdomínio do tenant  
2. Aguardar `status` + `ssl.status` = `active`  
3. **Não** cadastrar esse host no Easypanel  

(TE2 automatiza este passo no verify.)

---

## 4. Validação (DoD TE1)

| Check | Esperado |
|-------|----------|
| `https://{sub}/` | Vitrine / loja do tenant (não LandingPage Platform) |
| `GET /api/public/tenant-host?domain={sub}` | `200` · `host.role=store` · `store_slug` |
| Certificado | HTTPS do hostname do cliente (CF) |
| Easypanel Domains | **Sem** esse hostname na lista do serviço |
| (Opcional) role `support` | Segundo host → portal de chamados |

### Falhas comuns

| Sintoma | Ação |
|---------|------|
| 404 Easypanel | Origin Host rewrite / fallback — ver runbook PE |
| Home Platform | `tenant-host` null — DNS/`active`/API |
| Loja indisponível | `store_slug` ausente no tenant |
| SSL pending longo | Aguardar ou ver validation records na CF |

---

## 5. Rollback do teste

1. Remover Custom Hostname na CF  
2. Settings → Domínio → Remover host do papel  
3. Tenant volta a path legado `/{slug}/loja`

---

## 6. Próximo

**TE2** — provisionar/desprovisionar Custom Hostname no verify/clear de `tenant_hosts` (reusar client PE).
