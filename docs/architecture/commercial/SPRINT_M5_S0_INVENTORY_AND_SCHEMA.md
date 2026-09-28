# M5 S0 — Inventário técnico + draft schema/API

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-13 |
| **Sprint** | **S0** (fechado) |
| **Plano-mãe** | [`PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md`](./PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md) |
| **DoD** | Inventário âncoras · decisões S0 · draft SQL · draft API · checklist S1 |
| **Próximo** | **S2** — White-label 100% (após S1 feito) |

---

## 1. Decisões fechadas no S0

| ID | Tema | Fechado |
|----|------|---------|
| **D20** | O que é 1 licença | **1 usuário** (user ativo em `customer_tenant`s do Partner) |
| **D21** | Programa no MVP | Só **`license_pool`**. `revenue_share` = schema preparado / UI depois (pós-MVP ou S3 stub) |
| **D22** | Gateway MVP | **Asaas apenas**; reutilizar `payment_gateway_configs` (`scope=tenant` no tenant Partner) |
| **D23** | Aquisição de licenças (MVP) | Superadmin **aloca** pool na criação/edição do Partner; Partner vê saldo; top-up self-serve Platform→Partner pode entrar ainda no S3 se couber |
| **D24** | Piso de preço | Definido **por Partner** na criação (superadmin) |
| **D25** | Seller no MVP (S4) | Membership + **link de venda**; Central/comissões = **S5** |
| **D26** | Quem consome licença | Soma de users com `tenant_id` ∈ customer_tenants do Partner. **Memberships Partner** (admin/seller) **não** consomem no MVP |
| **D27** | Flag de rollout | `partner.channel_v1` em `platform_feature_flags` (off → allowlist → global) |

**Ainda abertos (não bloqueiam S1):** D19 NF · apuração `revenue_share` · S5.cap comissão vs lucro.

---

## 2. Definição operacional — licença = usuário

```
used_seats(partner) =
  COUNT(users)
  WHERE users.tenant_id IN (
    SELECT id FROM tenants
    WHERE account_type = 'customer_tenant'
      AND partner_id = :partner_tenant_id
  )
  AND users deleted/inactive policy = (definir: só ativos / todos não soft-deleted)
```

| Regra | MVP |
|-------|-----|
| Unidade | 1 licença = 1 **usuário** |
| Pool | `partner_license_pool.purchased_seats` |
| Enforcement | Bloquear criar user em customer_tenant do canal se `used + 1 > purchased` |
| Trial | User(s) do trial **consomem** licença (Partner banca) |
| Partner staff | `partner_admin` / `partner_seller` **não** entram no COUNT |
| Relação com `plans.max_users` | Limite **por customer_tenant** continua existindo; pool Partner é **teto agregado** do canal |

---

## 3. Inventário — âncoras no código atual

### 3.1 Tenants

| Item | Path | Nota M5 |
|------|------|---------|
| CREATE | `database/init/26_tenants_and_user_tenant.sql` | `slug`, `domain`, `plan_id`, `status` |
| Logos | `125_tenant_company_branding.sql` | CRM B2B — **não** é WL de plataforma |
| Limites | `36_tenant_limit_overrides.sql`, `plans.max_users` | Reusar enforcement em `tenantLimitService.ts` |
| Seats comerciais | `94_seats_commercial_policy.sql` | Addon Platform; pool Partner é **novo** domínio |
| `domain` | já existe (texto) | S2: verificação DNS + `partner_profiles.custom_domain` |

**Gap:** sem `account_type`, `partner_id`, `seller_user_id`.

### 3.2 Gateway Asaas

| Item | Path | Nota M5 |
|------|------|---------|
| Config global/tenant | `database/init/60_payment_gateway_configuration.sql` | `scope global\|tenant` + `credentials` JSONB |
| Resolver | `packages/backend/src/modules/payments/gatewayResolver.ts` | SaaS=global; CRM=tenant |
| CRUD tenant | `myTenantPaymentGatewayController.ts` + `/api/me/tenant/payment-gateway` | **Padrão a clonar** para Partner |
| SaaS Platform | `getActiveAsaasConfigForSaas()`, env `ASAAS_*` | Fatura pool Partner (Platform→Partner) |
| Webhook | `asaasWebhookRoutes.ts` | S3: discriminar cobrança canal (Partner) vs direta |

**Decisão S0:** gateway do Partner = config `scope=tenant` no **tenant Partner** (mesmo storage). Cobrança do customer_tenant resolve credenciais do **Partner pai**, não do customer.

### 3.3 Acquisition / provision

| Item | Path |
|------|------|
| Provision | `acquisition/acquisitionProvisioningService.ts` |
| Admin user | `services/tenantAdminService.ts` → `createTenantAdminUser` |
| Checkout | `planPurchaseController.ts` |

**Gap:** gravar `partner_id` / `seller_user_id` na session/lead e no INSERT do tenant.

### 3.4 Superadmin cria tenant

| Item | Path | Nota |
|------|------|------|
| API | `POST /api/superadmin/tenants` (`tenantsController.createTenant`) | **Não** cria admin no mesmo POST |
| UI | `SuperAdminClientNew.tsx` | Espelhar para Partner **com** admin + programa + pool |

### 3.5 Marca hardcoded (gap S2)

| Surface | Path |
|---------|------|
| Auth | `src/layouts/AuthLayout.tsx` — "PainelCRM" |
| Checkout | `src/components/checkout/CheckoutShellHeader.tsx` |
| Logo | `src/components/Logo.tsx` |
| Env fallback Platform | `APP_PUBLIC_NAME` / `VITE_APP_PUBLIC_NAME` |

Branding tenant CRM: `TenantBrandContext`, `127_public_tenant_brand_sql_functions.sql` — reaproveitar padrões, não confundir com WL Partner.

### 3.6 Feature flags

- `platform_feature_flags` + `featureFlagRegistry.ts` — padrão billing2/acquisition.
- Seed S1: `partner.channel_v1`.

### 3.7 Limite de users

- `tenantLimitService.ts` — `checkTenantUsersLimit` / `ForAddOne`.
- S3/S4: além do limite do plano do customer, checar **pool do Partner** (D20/D26).

---

## 4. Draft SQL (S1 — migration alvo)

> Numeração final = próximo init do repo na implementação. Nomes estáveis abaixo.

```sql
-- ========== tenants: canal ==========
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'platform_customer'
    CHECK (account_type IN ('platform_customer', 'partner', 'customer_tenant')),
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS seller_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- customer_tenant exige partner_id; partner e platform_customer não
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_partner_account_chk CHECK (
    (account_type = 'customer_tenant' AND partner_id IS NOT NULL)
    OR (account_type IN ('platform_customer', 'partner') AND partner_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_tenants_partner_id ON public.tenants(partner_id)
  WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_account_type ON public.tenants(account_type);

COMMENT ON COLUMN public.tenants.account_type IS
  'platform_customer=venda direta; partner=revendedor WL; customer_tenant=cliente do canal';

-- ========== partner_profiles ==========
CREATE TABLE IF NOT EXISTS public.partner_profiles (
  partner_tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  program_type TEXT NOT NULL DEFAULT 'license_pool'
    CHECK (program_type IN ('license_pool', 'revenue_share')),
  program_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- program_config_json.license_pool: { "floor_price_cents": N, "unit_cost_cents": N, "min_seats": N }
  -- program_config_json.revenue_share: { "share_percent": N } (pós-MVP)
  public_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  custom_domain TEXT,
  domain_status TEXT NOT NULL DEFAULT 'none'
    CHECK (domain_status IN ('none', 'pending', 'verified', 'active')),
  domain_verification_token TEXT,
  logo_url TEXT,
  theme_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  payout_cadence_preference TEXT NOT NULL DEFAULT 'monthly'
    CHECK (payout_cadence_preference IN ('monthly', 'biweekly', 'on_demand')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_profiles_custom_domain_active
  ON public.partner_profiles (lower(custom_domain))
  WHERE custom_domain IS NOT NULL AND domain_status IN ('verified', 'active');

-- ========== partner_memberships ==========
CREATE TABLE IF NOT EXISTS public.partner_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('partner_admin', 'partner_seller')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  referral_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_tenant_id, user_id)
);

-- vendedor único global (ativo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_seller_user_unique_active
  ON public.partner_memberships (user_id)
  WHERE role = 'partner_seller' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_memberships_referral_code
  ON public.partner_memberships (referral_code)
  WHERE referral_code IS NOT NULL;

-- ========== partner_license_pool ==========
CREATE TABLE IF NOT EXISTS public.partner_license_pool (
  partner_tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchased_seats INTEGER NOT NULL CHECK (purchased_seats >= 0),
  unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  -- used_seats = derivado (COUNT users); opcional cache:
  used_seats_cache INTEGER NOT NULL DEFAULT 0 CHECK (used_seats_cache >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.partner_license_pool IS
  'Pool de licenças do Partner; 1 seat = 1 usuário em customer_tenants do canal';

-- ========== partner_sell_plans (S3; criar vazio ok no S1 ou adiar) ==========
CREATE TABLE IF NOT EXISTS public.partner_sell_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_platform_plan_id UUID REFERENCES public.plans(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  billing_interval TEXT NOT NULL DEFAULT 'monthly',
  features_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_tenant_id, slug)
);

-- ========== acquisition (S4; colunas nullable ok cedo) ==========
-- ALTER acquisition_leads / onboarding_sessions:
--   ADD partner_id UUID NULL
--   ADD seller_user_id UUID NULL
--   ADD seller_referral_code TEXT NULL
```

**Gateway:** sem tabela nova no MVP — Partner usa `payment_gateway_configs` com `tenant_id = partner_tenant_id`.

**S5 (não criar no S1):** `partner_commission_*`.

**RLS (S1):** policies `partner_*` — bypass superadmin; membership ativa para Partner.

---

## 5. Draft API (contratos S1–S4)

### S1 — Fundação

| Método | Rota | Body / notas |
|--------|------|--------------|
| `POST` | `/api/superadmin/partners` | `name`, `slug`, `admin_email`, `admin_name`, `admin_password?`, `program_type` (default `license_pool`), `floor_price_cents`, `unit_cost_cents`, `purchased_seats`, `public_name`, `product_name` → cria tenant `account_type=partner` + profile + pool + membership admin + user |
| `GET` | `/api/superadmin/partners` | lista + status + seats |
| `GET` | `/api/superadmin/partners/:id` | detalhe |
| `PATCH` | `/api/superadmin/partners/:id` | piso, seats (+), status (suspend = S6 full) |
| `GET` | `/api/partner/me` | contexto: profile, role, pool summary |
| `GET/PATCH` | `/api/partner/profile` | marca básica (logo/theme); domínio = S2 |

Auth: `requireSuperAdmin` vs `requirePartnerAdmin` (membership).

### S2 — Domínio / brand pública

| Método | Rota | Notas |
|--------|------|-------|
| `POST` | `/api/partner/domain` | set hostname → `pending` + token |
| `POST` | `/api/partner/domain/verify` | check DNS TXT/CNAME |
| `GET` | `/api/public/partner-brand` | por `Host` ou `?domain=` — anônimo |

### S3 — Planos + gateway + pool

| Método | Rota | Notas |
|--------|------|-------|
| `GET/PUT` | `/api/partner/gateway` | clone de `/api/me/tenant/payment-gateway`; só Asaas MVP |
| `POST` | `/api/partner/gateway/test` | |
| `GET` | `/api/partner/licenses` | purchased, used (COUNT), unit_cost |
| `CRUD` | `/api/partner/sell-plans` | price ≥ `floor_price_cents` |
| `GET` | `/api/partner/sell-plans/projection` | receita − custo licença (− comissão est. se S5) |

Cobrança end-customer: resolver gateway pelo **`partner_id`** do customer_tenant.

### S4 — Carteira

| Método | Rota | Notas |
|--------|------|-------|
| `GET/PATCH` | `/api/partner/customers` | lista / reatribuir `seller_user_id` |
| `GET` | `/api/partner/seller/me/link` | URL + referral_code |

Acquisition: aceitar `partner` + `ref` (referral) nos links públicos.

---

## 6. Módulos backend sugeridos (S1+)

```
packages/backend/src/partner/
  partnerTypes.ts
  partnerRepository.ts
  partnerAdminService.ts          -- create partner (superadmin)
  partnerContext.ts               -- getPartnerContext from auth
  partnerAuthMiddleware.ts        -- requirePartnerAdmin | requirePartnerSeller
  partnerLicenseService.ts        -- COUNT used + enforce (S3)
  partnerBrandResolver.ts         -- Host → profile (S2)
```

Flag: `partner.channel_v1` — rotas Partner/superadmin partners no-op/404 se off.

---

## 7. Checklist S1 (pronto para executar)

- [x] Migration: `account_type`, `partner_id`, `seller_user_id`, `partner_profiles`, `partner_memberships`, `partner_license_pool`
- [x] Seed flag `partner.channel_v1`
- [x] `POST/GET/PATCH /api/superadmin/partners` (+ cria admin via `createTenantAdminUser`)
- [x] Middleware `requirePartnerAdmin` + `GET /api/partner/me`
- [x] Shell FE mínimo `/partner` (rota protegida)
- [x] UI Superadmin: criar Partner (programa license_pool, seats, piso, admin)
- [x] Testes: criar Partner; membership; constraint customer_tenant; seller unique
- [x] Regressão: `POST /api/superadmin/tenants` (venda direta) inalterado

**S1 entregue:** [`SPRINT_M5_S1_PARTNER_FOUNDATION.md`](./SPRINT_M5_S1_PARTNER_FOUNDATION.md).

---

## 8. Riscos S0 → S1

| Risco | Mitigação |
|-------|-----------|
| Confundir logos CRM com WL Partner | `partner_profiles` separado; S2 resolve por Host |
| `createTenant` hoje sem admin | Endpoint Partner **sempre** cria admin |
| Pool vs `max_users` do plano | Documentar: ambos aplicam; pool é agregado |
| Webhook Asaas multi-conta | S3: mapear payment → partner via config/customer metadata |

---

## 9. Status S0

| Entrega | Status |
|---------|--------|
| Inventário âncoras | **Feito** |
| D20–D27 | **Fechado** |
| Draft SQL | **Feito** (acima) |
| Draft API | **Feito** (acima) |
| Checklist S1 | **Feito** |

**S0 encerrado.** Próximo: implementar **S1**.
