# TD Sprint 0 — Inventário + ADR + flags

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S0** (feito) |
| **Plano-mãe** | [`PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md`](./PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md) |
| **Próximo** | **S1** — schema `tenant_hosts` + DNS set/verify |

---

## Entregas

### Decisões fechadas (ADR curto)

| ID | Decisão |
|----|---------|
| **TD1** | Tenant admin self-serve; Super Admin read/clear |
| **TD2** | Só subdomínio; apex fora |
| **TD3** | Papel obrigatório: `store` \| `support` (não `app`/CRM) |
| **TD4** | Tabela `tenant_hosts` (S1) |
| **TD5** | Hostname único vs Partner + outros tenants |
| **TD6** | `tenants.domain` legado permanece até S5 |
| **TD7** | Marca = nome/logo do tenant (+ portal/loja existentes) |
| **TD8** | Flag `tenant.custom_domain_v1` (**default ON** / global — migration `341`) |
| **TD9** | Sem gate de plano no MVP |
| **TD10** | DNS fail → pending/error; path legado continua |
| **TD11** | Até 1 host ativo por papel (`store` e/ou `support`) |
| **TD12** | Troca de papel permitida com confirmação |
| **TDA1** | Host na raiz → landing da loja ou do portal (sem slug na URL do cliente) |
| **TDA2** | Redirect 301 do path legado → host canônico = **opcional S4** |
| **TDA3** | Host `support` resolve portal pelo Host; slug interno na API |
| **TDA4** | `customer_tenant` fora |
| **TDA5** | Papel `app` (CRM) = backlog pós-MVP |

### Flags

| Key | Uso |
|-----|-----|
| `tenant.custom_domain_v1` | Liga o produto (APIs/UI) |
| `tenant.domain_verify_bypass` | Dev: verify sem DNS |
| `tenant.master_off` | Kill switch do namespace |

Migration: `338_tenant_custom_domain_flags_s0.sql`  
Helpers: `packages/backend/src/tenantCustomDomain/tenantDomainFlags.ts`

### Env (documentado)

| Env | Uso |
|-----|-----|
| `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` | CNAME que o cliente aponta (fallback: `PARTNER_WL_CNAME_TARGET`) |
| `TENANT_CUSTOM_DOMAIN_BLOCKED_HOSTS` | CSV extra de hosts bloqueados |
| `TENANT_CUSTOM_DOMAIN_V1` | Contingência se flag ausente no DB |
| `TENANT_DOMAIN_VERIFY_BYPASS` | Contingência bypass |

**Blocked default:** `localhost`, `127.0.0.1`, `::1`, `painelcrm.com`, `www.painelcrm.com`, `app.painelcrm.com` + target CNAME.

---

## Inventário — entrypoints atuais

### Loja (`role=store`)

| Camada | Path / API |
|--------|------------|
| FE | `/:storeSlug/loja`, `/:storeSlug/loja/produto/:productId`, `/:storeSlug/loja/checkout` (`App.tsx` → `PublicStore`) |
| API | `GET /api/store-profile/public/slug/:slug` (`storeProfileRoutes.ts`) |
| Settings | Admin loja em `/admin/loja` (autenticado) |

**S2:** Host `store` ativo → bootstrap FE resolve tenant/slug pelo Host e renderiza o mesmo bundle da loja **sem** exigir `/{slug}` na URL.

### Abertura de chamados (`role=support`)

| Camada | Path / API |
|--------|------------|
| FE | `/suporte/:id` → `SuportePublicOrPlatformTicket` → `PublicTenantSupportPortalPage` (slug = segmento; tipicamente slug do tenant) |
| FE auxiliar | `/ticket/:token` — visão de chamado por token (não é o host root) |
| API | `GET /api/public/support/:slug` · `POST …/tickets` · lookup/messages (`publicRoutes.ts`) |
| Settings | `PublicSupportPortalSettingsSection` — URL publicada hoje: `{origin}/suporte/{tenantSlug}` |

**S2:** Host `support` ativo → landing do portal no root do Host; APIs continuam por slug interno resolvido do contexto.

### Partner (não misturar)

| Camada | Path / API |
|--------|------------|
| DNS/brand | `partnerDomainService`, `GET /api/public/partner-brand` |
| Settings | `/partner/config/domain` |

Hostname em Partner `verified|active` **bloqueia** set no tenant (e vice-versa) a partir da S1.

### Stub a substituir (S3)

- `src/components/settings/DomainSection.tsx` — UI fake; S3 = seletor Loja \| Chamados + DNS real.

---

## Como ligar (dev)

1. Rodar migrations (inclui `338` + `341`) — **`tenant.custom_domain_v1` já fica ON/global**.
2. Só precisa mexer na flag se quiser **desligar** (Enabled OFF ou kill switch `tenant.master_off`).
3. (Opcional) `tenant.domain_verify_bypass` = ON só em non-prod.
4. Definir `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` (ou reutilizar `PARTNER_WL_CNAME_TARGET`).

---

## DoD S0

- [x] TD1–TD12 e TDA1–TDA5 fechados neste doc / plano-mãe
- [x] Inventário loja + portal + Partner
- [x] Flags `tenant.*` no registry + migration
- [x] Blocked hosts + CNAME target documentados
- [x] Papel `app` (CRM) explicitamente fora do MVP
- [x] Testes unitários das flags

**Kickoff chat:** `ok sprint 0`
