# M5 S7 — Cadastro / Checkout exclusivo do canal Partner

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-18 |
| **Sprint** | **S7** (**completo** — S7.0–S7.4) |
| **Plano-mãe** | [`PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md`](./PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md) |
| **Depende de** | S2 marca · S3 sell-plans + gateway · S4 attribution · correções comerciais Partner (sell plan no `/planos`) |
| **Próximo** | Soften UX WL · NF (D19) · `revenue_share` |

---

## 1. Problema (evidência)

| Sintoma | Causa |
|---------|--------|
| Link `http://localhost:5173/{slug}/cadastro` “não funciona” | `PUBLIC_APP_URL` / fallback do sale-link aponta para **5173**; app Vite/proxy em uso está em **8081** |
| Em `http://localhost:8081/{slug}/cadastro` → **“Cadastro em manutenção”** | `AcquisitionSignupFlow` só libera se `active_signup_flow === exclusive_signup` (`signup_flow_v1` na config pública). Com estratégia = `checkout`, o fluxo `/cadastro` fica bloqueado |
| Botão “Ir para cadastro padrão” | Leva ao **checkout Platform** (`/checkout`) — catálogo/preço/gateway da Platform, **não** do Partner |
| Gap de produto | Link do Partner deveria abrir um **checkout/cadastro do canal**: marca Partner + planos `partner_sell_plans` + cobrança no gateway do Partner + `customer_tenant` |

**Conclusão:** reusar `/cadastro` (acquisition exclusivo Platform) acopla o canal Partner à estratégia global Growth. O canal precisa de superfície **própria**, independente de `exclusive_signup` vs `checkout`.

---

## 2. Meta

Entregar um **checkout de aquisição do Partner** (UX equivalente ao `/checkout` da Platform) em:

| URL | Uso |
|-----|-----|
| `/{partnerSlug}/cadastro` | Casa (sem vendedor) |
| `/{partnerSlug}/{sellerUserId}/cadastro` | Vendedor atribuído |
| `https://{customDomain}/cadastro` | WL verificado (host resolve Partner) |
| `https://{customDomain}/{sellerUserId}/cadastro` | WL + seller |

**Não** depender de `active_signup_flow === exclusive_signup`.  
**Não** misturar catálogo/preço/gateway da Platform.

Fluxo desejado (espelho mental do checkout Platform):

1. Abrir link → marca + planos do Partner  
2. Escolher plano (preço do `partner_sell_plans`, trial se houver)  
3. Dados empresa / admin / login+senha  
4. Pagamento (PIX/boleto/cartão) **no Asaas do Partner** — ou ativar trial bancado pelo Partner  
5. Provisionar `customer_tenant` com `partner_id`, `seller_user_id?`, `partner_sell_plan_id`  
6. Login / onboarding operacional no canal

---

## 3. Fora de escopo (S7)

- Redesign visual completo do checkout Platform  
- Trocar estratégia global Growth (`exclusive_signup`)  
- NF / `revenue_share`  
- App mobile / PWA  
- Multi-gateway além de Asaas no Partner  

---

## 4. Decisões de produto (proposta)

| ID | Tema | Decisão proposta |
|----|------|------------------|
| **P1** | Superfície | Nova rota de produto: **Partner Channel Checkout** — path `/{slug}/cadastro` (já roteado) + página dedicada (não o gate de manutenção do acquisition exclusivo) |
| **P2** | Relação com `/cadastro` Platform | Mantém-se para venda direta quando `exclusive_signup` ativo. Canal Partner **não** usa esse gate |
| **P3** | UX | Paridade com `/checkout`: etapas Plano → Empresa/Admin → Pagamento (ou trial) → sucesso |
| **P4** | Planos | Só `partner_sell_plans` `status=active` do Partner do path/host |
| **P5** | Trial | Usa `trial_days` do sell plan; consome seat do pool (D13) |
| **P6** | Cobrança | `amount_cents` = preço do sell plan; gateway = Partner pai |
| **P7** | Origin do link | Sale-link usa `Origin` do request / `PUBLIC_APP_URL` documentado; fallback local alinhado à porta real do FE (ex. 8081) |

---

## 5. Arquitetura alvo

```
Browser
  └─ /{partnerSlug}/cadastro[/{sellerId}]
        │
        ├─ FE: PartnerChannelCheckout (novo)
        │     · resolve brand + plans via API pública
        │     · UI estilo PlanCheckout
        │
        └─ API pública canal (novo/estendido)
              · GET  /api/public/partner-channel/:slug
              · POST /api/public/partner-channel/signup  (ou steps)
              · POST prepare-payment / pay  (tenant billing no gateway Partner)
                    │
                    └─ provision customer_tenant
                         partner_id + seller + partner_sell_plan_id
```

**Envelope técnico:** `tenants.plan_id` = `source_platform_plan_id` (ou default) para limites.  
**Comercial:** `partner_sell_plan_id` + preço do sell plan (já consolidado no Meu plano).

---

## 6. Sprints internos (S7.0 → S7.4)

### S7.0 — Inventário + contrato — **FEITO** (2026-08-18)

**Objetivo:** fechar gaps e contrato de API sem UI ainda.

- [x] Documentar diferença: `/cadastro` Platform vs `/{slug}/cadastro` Partner  
- [x] Inventariar etapas/payloads de `PlanCheckout` reutilizáveis  
- [x] Definir DTOs públicos: brand, plans, signup, payment  
- [x] Corrigir **origin do sale-link** (Origin → `PUBLIC_APP_URL`/`FRONTEND_URL` → fallback `http://localhost:8080`; ignora host da API)  
- [x] Critério: Partner abre link na porta certa (via Origin do painel ou env); path ainda pode cair no gate de manutenção até S7.1  

**Saída:** seções 12–14 abaixo + código em `platformPublicUrls.ts` / `partnerSellerService.ts`.

---

### S7.1 — Superfície FE Partner Checkout — **FEITO** (2026-08-18)

**Objetivo:** página dedicada no path Partner, **sem** gate `exclusive_signup`.

- [x] Extrair/criar `PartnerChannelCheckout`  
- [x] Rotas `/:partnerSlug/cadastro` e `/:partnerSlug/:sellerId/cadastro` apontam para essa página  
- [x] Em WL host: `/cadastro` via `CadastroEntry` → Partner; `/{sellerUuid}/cadastro` detectado no mesmo componente  
- [x] Shell visual alinhado ao checkout (`CheckoutAppShell` + stepper)  
- [x] Carregar brand + planos via `GET /api/public/partner-brand?slug=`  
- [x] Empty states: slug inválido, sem planos publicados  
- [x] CTA manutenção **não** aparece no canal Partner  
- [ ] Pagamento/trial real → **S7.2** (passo 5 = placeholder)

**DoD:** abrir `http://localhost:8081/{slug}/cadastro` mostra UI de checkout do canal (sem gate manutenção).

---

### S7.2 — Backend signup + cobrança canal — **FEITO** (2026-08-18)

**Objetivo:** fechar lead → provision → trial/pagamento no gateway Partner.

- [x] API pública canal `/api/public/partner-channel/*` **sem** `requireExclusiveSignupFlow`  
- [x] Validar slug/host → `partner_id`; validar `sellerUserId` membership ativa  
- [x] Signup: admin + senha; `partner_sell_plan_id` obrigatório; `created_via=partner`  
- [x] Trial: `signup-trial` → `status=trial`, consome pool, JWT  
- [x] Pago: `signup` → `payment_pending` + `tenant_billing` com `amount_cents` do sell plan + prepare no gateway Partner  
- [x] Provision: `account_type=customer_tenant`, `partner_id`, `seller_user_id?`, `partner_sell_plan_id`  
- [x] Isolamento: sell plan / seller só do Partner do slug  
- [x] Testes unitários (`partnerChannelSignupService.test.ts`)  
- [x] FE `PartnerChannelCheckout` passo 5 ligado às APIs  

**DoD:** trial e prepare-payment sandbox criam/prepararam cliente na carteira com preço do sell plan.

**Arquivos:** `partnerChannelSignupService.ts`, `partnerChannelPublicController.ts`, rotas em `publicRoutes.ts`.

---

### S7.3 — Hardening + sale-link + regressão — **FEITO** (2026-08-18)

**Objetivo:** produção-ready e venda direta intacta.

- [x] Sale-link: origin (S7.0) + paths `/{slug}/cadastro` e seller; nota no painel Partner  
- [x] Domínio WL: `buildPartnerSaleUrl` sem slug; `/cadastro` via `CadastroEntry`  
- [x] Rate limit em brand + signup; honeypot `website` / `company_website`  
- [x] Brand público: Partner suspenso → inválido; `gateway_ready` para UX  
- [x] Regressão automatizada: `partnerChannelS73.regression.test.ts`  
- [x] Superfícies separadas: `/checkout` Platform e `/cadastro` exclusive intactos (CadastroEntry)  

**DoD:** checklist §7 coberto por código + testes; QA manual restante = sandbox Asaas real.

---

### S7.4 — CPF/CNPJ obrigatório para cobrança Asaas — **FEITO** (2026-08-19)

**Objetivo:** paridade com `/checkout` Platform — Asaas exige documento válido antes de PIX/boleto/cartão.

- [x] `partnerChannelBillingDocument.ts`: `ensureTenantBillingDocumentForPayment` (lê/persiste `tenants.cpf_cnpj` antes da fatura)
- [x] `signupPartnerChannelPaid`: valida documento antes de `createInvoice`; mapeia erro Asaas → `CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD`
- [x] `signupPartnerChannelTrial`: `cpf_cnpj` opcional com validação de formato
- [x] API pública: erro 400 com `field: 'cpf_cnpj'` quando aplicável
- [x] FE `PartnerChannelCheckout`: campo CPF/CNPJ no passo Empresa (opcional) e no passo Pagamento (obrigatório); envio no body do signup
- [x] Painel Partner: CPF/CNPJ opcional em criar/editar cliente (`PartnerCustomersPage`)
- [x] Testes: `partnerChannelBillingDocument.test.ts`, casos CPF em `partnerChannelSignupService.test.ts`

**DoD:** trial sem CPF ok; pagamento pago exige CPF/CNPJ válido (FE + BE); fatura Asaas sandbox Partner não falha por documento ausente.

**Arquivos:** `partnerChannelBillingDocument.ts`, `partnerChannelSignupService.ts`, `PartnerChannelCheckout.tsx`, `partnerCustomerService.ts`.

---

## 7. Checklist QA

| # | Item | Estado |
|---|------|--------|
| 1 | `PUBLIC_APP_URL` / Origin = FE real (ex. 8081) | Código S7.0 + nota no painel |
| 2 | Partner + sell plan active + gateway | Manual |
| 3 | `/{slug}/cadastro` sem “manutenção” | S7.1 |
| 4 | Só planos do Partner | S7.1 + brand API |
| 5 | Trial → carteira + `/planos` Partner-first | S7.2 + overlay prévio |
| 6 | Pagamento sandbox Asaas Partner (com CPF/CNPJ válido) | Manual (S7.2 + S7.4) |
| 7 | Link vendedor com `seller_user_id` | S7.2 |
| 8 | `/checkout` Platform intacto | CadastroEntry / rotas separadas |
| 9 | Remover domínio WL → link `/{slug}/cadastro` | S4 + sale-link |

---

## 8. Riscos

| Risco | Mitigação |
|-------|-----------|
| Misturar acquisition exclusivo com canal | Página + APIs separadas; zero `requireExclusiveSignupFlow` no canal |
| Preço SaaS no billing | Snapshot + `amount_cents` do sell plan (já padrão no checkout Partner de Meu plano) |
| Porta/local errada no link | Origin hint + `PUBLIC_APP_URL` + doc no painel Partner |
| Seller UUID inválido no path | 404 amigável; não cair em checkout Platform |
| Pool esgotado no trial | `assertPartnerPoolAllowsNewUser` antes de provisionar |

---

## 9. Estimativa

| Fatia | Esforço |
|-------|---------|
| S7.0 | 0,5–1 d |
| S7.1 | 2–3 d |
| S7.2 | 3–4 d |
| S7.3 | 1–2 d |
| **Total** | **~7–10 dias úteis** |

---

## 10. Ordem sugerida de execução

1. **S7.0** — origin do link + contrato  
2. **S7.1** — FE dedicado (desbloqueia demo visual)  
3. **S7.2** — backend signup/pagamento  
4. **S7.3** — hardening + QA  

---

## 11. Status

| Item | Estado |
|------|--------|
| Rotas React `/:partnerSlug/cadastro` | **S7.1** → `PartnerChannelCheckout` |
| Brand/plans públicos por slug | `GET /api/public/partner-brand?slug=` — usado no FE |
| Sale-link path Partner | Feito (S4+) |
| Sale-link **origin** (porta correta) | **S7.0 feito** — `resolveSaleLinkOrigin` |
| Contrato API canal | **S7.0 feito** — §14 |
| Checkout/cadastro **UI** canal | **S7.1 feito** |
| Signup/pagamento canal | **S7.2 feito** — `/api/public/partner-channel/signup(-trial)` |
| Hardening / honeypot / regressão | **S7.3 feito** |
| Cobrança Partner no Meu plano (cliente já criado) | Feito (overlay/checkout sell plan) |
| **S7 overall** | **Completo** |

---

## 12. Inventário S7.0 — superfícies hoje

### 12.1 Paths vs produto

| Path | Componente | Gate | Canal |
|------|------------|------|-------|
| `/checkout` | `PlanCheckout` | Nenhum (venda direta Platform) | Platform `plans` + `/api/plan-purchase` |
| `/cadastro` | `AcquisitionSignupFlow` | `exclusive_signup` ativo | Platform acquisition |
| `/{partnerSlug}/cadastro` | **mesmo** `AcquisitionSignupFlow` | **mesmo gate** → manutenção se strategy=`checkout` | Atribuição Partner parcial (S4); **UI errada** |
| `/{partnerSlug}/{sellerId}/cadastro` | idem | idem | Seller path |
| WL `/cadastro` | idem / brand host | idem | Host resolve Partner |

### 12.2 `PlanCheckout` — etapas e APIs (reuso mental para S7.1/S7.2)

| Step | UI | APIs Platform |
|------|-----|---------------|
| 1 | Picker de planos | `GET /api/plans` |
| 2 | Empresa (nome, e-mail, logo…) | local state |
| 3 | Admin (senha, WhatsApp) | `POST /api/plan-purchase/validate-admin` |
| 4 | Resumo | — |
| 5a Trial | — | `POST /api/plan-purchase/complete-signup-trial` |
| 5b Pago | PIX/boleto/cartão | `POST /api/plan-purchase` → `POST /api/billing/:id/pay-with-card` |

**Shell reutilizável (FE):** `CheckoutAppShell`, `CheckoutCompactStepper`, `CheckoutShellHeader`.

**Payloads-chave (Platform):** `plan_id`, `billing_interval`, `company_name`, `email`, `responsible_name`, `password`, `whatsapp`, `cpf_cnpj?`, `payment_method`, `users_count?`.

**Canal Partner (alvo):** trocar `plan_id` → `partner_sell_plan_id`; catálogo via brand; cobrança no gateway do Partner; **não** chamar APIs que exigem `requireExclusiveSignupFlow`.

### 12.3 Já existe para o canal

| Peça | Onde |
|------|------|
| Brand + plans por slug/host | `GET /api/public/partner-brand?slug=` → `{ brand, platform, plans }` (`mapSellPlanToCatalog`) |
| Sale URL builder | `buildPartnerSaleUrl` |
| Origin sale-link | `resolveSaleLinkOrigin` + Origin do request no painel Partner |
| Attribution | `resolvePartnerAttribution` (host/slug/seller) |
| Overlay Meu plano | `partnerChannelCustomerPlans` |

### 12.4 Origin do sale-link (S7.0)

Prioridade (sem domínio WL):

1. `Origin` do browser (painel em `http://localhost:8081` → link com 8081)  
2. `x-forwarded-host` / `Host` **se não for porta da API** (`API_PORT`, default 3001)  
3. `PUBLIC_APP_URL` → `FRONTEND_URL`  
4. Fallback `http://localhost:8080` (default Vite)

**Dev checklist:** com FE em 8081, abra o painel Partner nessa porta (Origin resolve) **ou** defina no `.env` do backend:

```env
PUBLIC_APP_URL=http://localhost:8081
# ou
FRONTEND_URL=http://localhost:8081
```

---

## 13. Diferença de produto (contrato)

| | Platform `/checkout` | Partner `/{slug}/cadastro` (alvo S7) |
|--|----------------------|--------------------------------------|
| Catálogo | `plans` | `partner_sell_plans` active |
| Preço | `interval_prices` / plan | `price_cents` do sell plan |
| Gateway | Platform Asaas | Partner Asaas |
| Tenant | `platform_customer` | `customer_tenant` + `partner_id` |
| Plano técnico | `plan_id` escolhido | envelope `source_platform_plan_id` + `partner_sell_plan_id` |
| Gate Growth | n/a | **nunca** `exclusive_signup` |
| Seller | marketing ref opcional | path `/{sellerId}` ou membership |

---

## 14. Contrato API público — Partner Channel (alvo S7.1–S7.2)

Prefixo: `/api/public/partner-channel`  
**Sem** `requireExclusiveSignupFlow`. Rate-limit em S7.3.

### 14.1 Bootstrap (S7.1 pode usar o existente)

`GET /api/public/partner-brand?slug={slug}`  
(ou `?domain=` / host)

**200**

```json
{
  "brand": {
    "partner_tenant_id": "uuid",
    "public_name": "string",
    "product_name": "string",
    "logo_url": "string|null",
    "theme_json": {},
    "tagline": "string|null",
    "custom_domain": "string|null",
    "domain_status": "none|pending|verified|active",
    "slug": "agencia-devs"
  },
  "platform": false,
  "plans": [
    {
      "id": "uuid",
      "partner_sell_plan_id": "uuid",
      "name": "string",
      "slug": "string",
      "price_cents": 9900,
      "billing_interval": "monthly",
      "trial_days": 7,
      "plan_type": "standard",
      "channel": "partner",
      "benefits": [{ "label": "string" }]
    }
  ]
}
```

Erros UX FE: `brand: null` / `platform: true` → slug inválido; `plans: []` → empty state.

**Opcional S7.2:** `GET /api/public/partner-channel/:slug` espelha o mesmo + `seller` validado se path tiver seller.

### 14.2 Signup trial

`POST /api/public/partner-channel/signup-trial`

```json
{
  "partner_slug": "agencia-devs",
  "seller_user_id": "uuid|null",
  "partner_sell_plan_id": "uuid",
  "company_name": "string",
  "email": "string",
  "responsible_name": "string",
  "password": "string",
  "whatsapp": "string",
  "cpf_cnpj": "string|null",
  "phone": "string|null"
}
```

**201** — espelha trial Platform: `{ token, user, tenant_id }` (JWT do customer).  
**4xx:** `PLAN_NOT_FOUND`, `PARTNER_SUSPENDED`, `POOL_EXHAUSTED`, `EMAIL_ALREADY_REGISTERED_USE_LOGIN`, `SELLER_INVALID`.

### 14.3 Signup pago (prepare)

`POST /api/public/partner-channel/signup`

```json
{
  "partner_slug": "agencia-devs",
  "seller_user_id": "uuid|null",
  "partner_sell_plan_id": "uuid",
  "billing_interval": "monthly",
  "payment_method": "PIX|BOLETO|CREDIT_CARD",
  "company_name": "string",
  "email": "string",
  "responsible_name": "string",
  "password": "string",
  "whatsapp": "string",
  "cpf_cnpj": "string",
  "phone": "string|null"
}
```

**200** — alinhado a `PurchaseResult` do Platform:

```json
{
  "tenant_id": "uuid",
  "billing_id": "uuid",
  "payment_method": "PIX",
  "amount_cents": 9900,
  "pix_qr_code": "...",
  "pix_copy_paste": "...",
  "boleto_url": null,
  "inline_pay_token": "string|null"
}
```

Cartão: reusar `POST /api/billing/:id/pay-with-card` com `inline_pay_token` (gateway Partner já resolvido via `customer_tenant`).

### 14.4 Validação admin (opcional)

`POST /api/public/partner-channel/validate-admin` — `{ email, whatsapp }` → disponibilidade no canal (sem provisionar).

---
