# Runbook de incidentes — Subdomínio Partner (PE)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Fase** | PE Etapa 5 |
| **Ops base** | [`RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md`](./RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md) |

---

## 1. 404 Easypanel no subdomínio do Partner

**Sintoma:** página “404 Não Encontrado” (logo Easypanel).

**Causa provável:** Origin Host rewrite ausente / fallback errado.

**Ações:**
1. Confirmar CNAME do Partner → `PARTNER_WL_CNAME_TARGET` (ex. `customers.painelcrm.com`)
2. CF → Custom Hostname existe e `status`/`ssl` active
3. Origin Rule: Host no origin = hostname já no Easypanel
4. **Não** “resolver” com Add Domain por Partner (regredir escala)

---

## 2. Abre home da Platform / sem marca Partner

**Sintoma:** site carrega mas parece PainelCRM / sem brand.

**Ações:**
1. `GET /api/public/partner-brand?domain={host}` — deve retornar `brand`
2. `partner_profiles.domain_status` = `active`
3. Flag `partner.channel_v1` ON
4. CORS: origem `https://{host}` (allowlist dinâmica)

---

## 3. Certificado SSL stuck (pending)

**Sintoma:** badge SSL “Validando” / “Emitindo” por >30–60 min.

**Ações:**
1. No painel Partner: **Atualizar status SSL** (`POST /api/partner/domain/cf-sync`)
2. CF dashboard → Custom Hostname → validation records (TXT/HTTP)
3. Confirmar CNAME aponta para o target SaaS (HTTP DCV)
4. Se órfão: clear domínio no Partner + recriar; ou apagar Custom Hostname na CF e **Atualizar status SSL** / Verificar DNS de novo

---

## 4. DNS verificado mas CF com erro (`cf_last_error`)

**Sintoma:** DNS Ativo + alert Cloudflare na UI.

**Ações:**
1. Ler `cf_last_error` (Super Admin → Partner → card Subdomínio, ou UI Partner)
2. Conferir `CF_SAAS_ZONE_ID` / `CF_SAAS_API_TOKEN` no Easypanel
3. Super Admin → Avançado → Feature Flags → `partner.edge_cloudflare_saas_v1` = **ON**
4. Token com permissão Custom Hostnames Edit
5. **Atualizar status SSL** ou Verificar DNS (re-provisiona se sem `cf_id`)

---

## 5. Clear deixou Custom Hostname órfão na CF

**Sintoma:** domínio limpo no painel; hostname ainda na CF.

**Ações:**
1. CF → Custom Hostnames → delete pelo hostname
2. Confirmar `CF_SAAS_*` estavam configurados no clear (sem token, só limpa espelho local)
3. SQL ops (leitura):
```sql
SELECT partner_tenant_id, custom_domain, domain_status,
       cf_custom_hostname_id, cf_ssl_status, cf_last_error
FROM partner_profiles
WHERE cf_custom_hostname_id IS NOT NULL;
```

---

## 6. Cota Cloudflare (100 hostnames grátis)

**Sintoma:** create Custom Hostname falha (quota / billing).

**Monitorar:**
```sql
SELECT count(*) FILTER (WHERE cf_custom_hostname_id IS NOT NULL) AS with_cf,
       count(*) FILTER (WHERE domain_status = 'active') AS active_domains
FROM partner_profiles;
```

**Ações:** CF Plans → hostname packs (~US$ 0,10/hostname) · arquivar Partners inativos · limpar órfãos.

---

## 7. Bypass DNS ligado em produção

**Sintoma:** log `[partner-domain] domain_verify_bypass ativo em production`.

**Ação:** Super Admin → Feature Flags → `partner.domain_verify_bypass` = **OFF** imediatamente.

---

## 8. Checkout Platform no link de vendas

**Sintoma:** link ainda `/{slug}/cadastro` na Platform após domínio active.

**Ações:**
1. `domain_status` = `active`?
2. Reload `/partner` → Link de vendas
3. Conferir `PUBLIC_APP_URL` só afeta **sem** WL; com WL o origin é `https://{custom_domain}`

---

## Contatos / ordem de escalação

1. Checklist deste runbook  
2. Runbook CF setup ([`RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md`](./RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md))  
3. Cloudflare dashboard Custom Hostnames + Origin Rules  
4. Logs backend `[partner-cf]` / `[partner-domain]`
