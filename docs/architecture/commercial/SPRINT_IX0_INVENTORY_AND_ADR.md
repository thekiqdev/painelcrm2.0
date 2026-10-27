# IX Sprint 0 — Inventário e ADR (idioma, moeda, Stripe)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-29 |
| **Sprint** | **IX0** concluída |
| **Plano** | [`PLAN_IX_IDIOMA_MOEDA_STRIPE.md`](./PLAN_IX_IDIOMA_MOEDA_STRIPE.md) |
| **Sprints** | [`PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md`](./PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md) |
| **Próximo** | **IX1** — fundação i18n (`ok sprint ix1`) ou **IX3** em paralelo |

Nenhuma flag nova é lida pelo runtime. Cobrança, landing e checkout seguem em português e real.

---

## 1. ADR

Decisões D1–D16 do plano ficam aceitas. Este ADR fixa o que a IX0 encontrou no código e o que as próximas sprints não podem reabrir sem outro ADR.

| ID | Decisão fechada | Evidência nesta sprint |
|----|-----------------|------------------------|
| **D1** | Locales canônicos: `pt-BR`, `en`, `es`. Fallback `pt-BR`. | O select em `PreferencesSection` já lista inglês e espanhol, com valor `en-US`. Esse select não grava nada (`defaultValue` solto). A IX1 persiste `en`, e trata `en-US` só como alias de leitura se aparecer cookie antigo. |
| **D2** | Moedas `BRL`, `USD`, `EUR`. Preço cadastrado. Sem câmbio automático. | `plans.price_cents` e `plan_interval_prices` não têm moeda. Unique atual: `(plan_id, billing_interval)`. |
| **D3** | Idioma e moeda independentes. | Mapa país → moeda não olha `Accept-Language`. México → USD. Espanha → EUR. |
| **D4** | Idioma: preferência, depois `Accept-Language`, depois `pt-BR`. | Não existe coluna de idioma no usuário. Cookie de locale não existe. |
| **D5** | Moeda: assinatura, depois preferência, depois país, depois `USD`. | Assinatura SaaS nasce com `currency = 'BRL'` fixo. País não é lido. |
| **D6** | BR → BRL; zona do euro → EUR; resto → USD. | Mapa versão 1 em `packages/backend/src/i18n/countryCurrencyMap.ts`. Ainda sem rota HTTP. |
| **D7** | Moeda da assinatura congelada no checkout. | Os três writes de `BRL` abaixo são o lugar que a IX4 precisa passar a receber a moeda do preço. |
| **D8** | Um plano, preços por moeda e intervalo. | IX3 altera `plan_interval_prices` e cria preço de lista USD/EUR. IX0 não migra preço. |
| **D9** | Nome, descrição e benefícios traduzíveis. | `plans.benefits` é um JSON único, sem locale. |
| **D10** | BRL → Asaas. USD/EUR → Stripe da plataforma, atrás de `billing2.multi_gateway`. | Flag já existe (`302`), default OFF. Adapter `stripeSaasSkeleton` lança erro em toda operação. |
| **D11** | Stripe do tenant é a conta do tenant, escopo `tenant`. | `financialAvailableGateways` só oferece `asaas` e, com env, `mercado_pago`. |
| **D12** | Chave Stripe da plataforma só em secret de ambiente. | Checklist na §5. Nada disso entra no bundle nem nesta sprint. |
| **D13** | 100% = chrome, erro visível, e-mail de sistema, notificação de plataforma, PDF de sistema. | Templates de plataforma existem só em `pt-BR`. |
| **D14** | Conteúdo escrito pelo tenant fica no idioma do autor. | Fora do mapa e das flags. |
| **D15** | Chave ausente cai em `pt-BR`. CI falha em namespace `complete`. | Não há i18next. A IX1 cria o pipeline. |
| **D16** | Partner / atacado fora desta fase. | `partnerWholesaleRecurringService` também grava `contract_currency = 'BRL'`. A IX4 não mexe nisso. |

`CF-IPCountry` não é lido em lugar nenhum do backend. A IX2 é quem passa a lê-lo. Sem o header, a moeda sugerida é USD (D5), e o seletor da landing corrige.

---

## 2. Flags

Migração `database/init/347_ix0_i18n_currency_flags.sql`. Chaves também em `PLATFORM_FEATURE_FLAG_KEYS`.

| Flag | Default | Efeito hoje |
|------|---------|-------------|
| `i18n.locale_detection_v1` | OFF | Nenhum. Nada consulta a chave. |
| `billing.multicurrency_v1` | OFF | Nenhum. Catálogo público continua só BRL. |
| `financial.stripe_tenant_v1` | OFF | Nenhum. Stripe não entra na lista do tenant. |
| `billing2.multi_gateway` | OFF (já existia) | Resolver SaaS continua no Asaas. Skeleton Stripe não cobra. |

`ON CONFLICT DO NOTHING`: repetir a migração não altera uma flag que o Super Admin já tenha ligado.

---

## 3. Inventário — BRL forçado na cobrança SaaS

Estes pontos **gravam** real. São o contrato que a IX4 troca pela moeda do preço. A IX0 não altera o SQL.

| Onde | O que faz |
|------|-----------|
| `billingSubscriptionService.createSubscription` | `INSERT INTO subscriptions (..., currency, ...) VALUES (..., 'BRL', ...)`. Toda assinatura nova, SaaS ou de cliente, nasce em real. |
| `persistContractSnapshotFromPaidBilling` | `contract_currency = 'BRL'` no snapshot da assinatura `type = 'saas'` após pagamento. |
| `updateSubscriptionContractSnapshotFromCalculatedContract` | O mesmo `contract_currency = 'BRL'` em mudança contratual self-service. |

`createInvoice` (`invoiceService`) não tem coluna de moeda no `INSERT` de `tenant_billing`. A moeda da cobrança SaaS está na assinatura, não na fatura. A IX4 precisa carregar `subscriptions.currency` até o gateway em vez de inventar moeda na fatura.

Cadeia de fallback `|| 'BRL'` (não grava sozinha; usa a moeda da assinatura quando ela existe). Entram na IX4 só se o write acima passar a gravar USD/EUR:

- `billingPlanFactory`, `billingPlanAutoProvision`, `billingPlanSynchronizationService`
- `billingInvoiceBuilder`, `billingEnginePipeline`, `billingProjectionBuilder`, `projectionItemResolver`
- `billingExecutionContextBuilder`, `billingExecutionReplay`

Fora da fase (D16), registrado para não “corrigir” sem querer:

- `partnerWholesaleRecurringService` — `contract_currency = 'BRL'`

Outros `'BRL'` de produto do tenant (não são a assinatura PainelCRM): default de `productsController`, contrato, `mercadoPagoCustomerInvoicePaymentService` (`currency_id: 'BRL'`), formatadores de notificação (`platformBusinessNotifications`, `invoiceNotificationsService`, `businessTransactionalNotifications`, `flowInvoiceActions`). Ficam para IX5/IX8/IX9.

---

## 4. Catálogo de gateways

| key | Onde nasce | Habilitado no catálogo | Quem usa |
|-----|------------|------------------------|----------|
| `asaas` | `60_payment_gateway_configuration.sql` | sim | Plataforma (global) e tenant |
| `mercado_pago` | `180_mercado_pago_gateway_catalog.sql` | sim no catálogo; na lista financeira só se `FINANCIAL_GATEWAY_MERCADO_PAGO_ENABLED` | Tenant |
| `stripe` | `302_billing2_multi_gateway.sql` | **não** (`is_enabled` false; o UPDATE não força esse campo) | Skeleton SaaS. Sem HTTP. |

`getAvailableFinancialGatewayKeys()` devolve `asaas` e, condicionalmente, `mercado_pago`. Stripe ausente. A IX5 acrescenta Stripe atrás de `financial.stripe_tenant_v1`.

---

## 5. Segredos Stripe da plataforma

Ainda não existem no código. Quando a IX4 criar o adapter:

| Nome | Onde | Onde não pode aparecer |
|------|------|------------------------|
| `STRIPE_SECRET_KEY` | Secret de ambiente do backend (Easypanel) | Frontend, repositório, log, resposta de API |
| `STRIPE_WEBHOOK_SECRET` | Secret de ambiente do backend | Frontend, repositório, log |

A chave Stripe **do tenant** (IX5) segue o padrão do Asaas: `payment_gateway_configs` com `scope = tenant`. O GET administrativo já mascara `credentials`. A secret key global da plataforma não entra nessa linha e não cobra cliente do CRM.

---

## 6. Templates de plataforma

Não há linha com locale `en` ou `es` em `database/init`. Tudo abaixo é `pt-BR` em `platform_notification_template_system`. A IX9 duplica cada par evento+canal.

| event_key | canais em pt-BR |
|-----------|-----------------|
| `platform.account.created` | whatsapp, email |
| `platform.auth.login_link.issued` | whatsapp |
| `platform.auth.password_reset_code_issued` | whatsapp |
| `platform.plan.activated` | whatsapp, email |
| `platform.billing.charge.created` | whatsapp, email |
| `platform.billing.payment_confirmed` | whatsapp, email |
| `platform.billing.charge.overdue` | whatsapp, email |
| `platform.trial.started` | whatsapp, email |
| `platform.trial.ended` | whatsapp, email |
| `platform.trial.expiring` | whatsapp, email |
| `platform_ticket_created` | whatsapp, email |
| `platform_ticket_reply` | whatsapp, email |
| `platform_ticket_status_changed` | whatsapp, email |

Valor monetário nesses envios é formatado em `pt-BR` / `BRL` em `platformBusinessNotifications.ts`.

Templates do motor do **tenant** (proposta, contrato, fatura de cliente, WhatsApp) também estão só em `pt-BR` (`133`, `136` e afins). Escopo da IX8, não desta lista.

---

## 7. Superfícies públicas

| Superfície | Arquivo | Moeda / idioma hoje |
|------------|---------|---------------------|
| Landing SPA | `src/landingpage/` (`Pricing.tsx` formata `BRL`) | pt fixo, real |
| Landing estática | `src/landing/` | pt fixo |
| Checkout do plano | `src/pages/PlanCheckout.tsx`, `src/lib/planCheckoutDisplay.ts` | pt / BRL |
| Checkout aquisição | `src/pages/AcquisitionPremiumCheckout.tsx` | pt |
| Meu plano | `src/pages/MeuPlano.tsx` | `BRL` |
| Compra de plano | `src/components/plan/PlanPurchaseModal.tsx` | `BRL` |
| Pagamento de fatura pública | `src/pages/CustomerInvoicePay.tsx` | `pt-BR` |
| Proposta pública | `src/pages/PublicProposalView.tsx` | `pt-BR` |
| Chamado público | `src/pages/PublicTicketView.tsx`, `PublicSupportTicketLookup.tsx` | `pt-BR` |
| Confirmação de agenda | `src/pages/PublicAppointmentConfirmation.tsx` | `pt-BR` |
| Legal | `src/pages/legal/PublicLegalPage.tsx` | conteúdo do banco |
| Cadastro | `src/pages/RegisterOrganizationWizard.tsx` | `pt-BR` |
| Loja pública | `src/pages/StorePublicCheckout.tsx` | moeda do produto, default BRL |

Preferências do app (`src/components/settings/PreferencesSection.tsx`) mostram idioma e fuso, sem estado controlado e sem API. A IX1 substitui esse select; não cria um segundo.

---

## 8. Frontend — `pt-BR` e `BRL` fixos

Não há biblioteca de i18n. A busca em `src/` encontra o literal `pt-BR` em mais de cem arquivos e `date-fns/locale` (`ptBR`) em cerca de sessenta. Agrupado para as sprints de tradução:

| Sprint | Concentração |
|--------|----------------|
| IX6 | `landingpage/components/Pricing.tsx`, `PlanCheckout`, `planCheckoutDisplay.ts`, `RegisterOrganizationWizard`, páginas públicas da §7 |
| IX7 | `Dashboard.tsx`, `Chat.tsx`, `chatPageHelpers.ts`, agenda, `ClientProfile.tsx` |
| IX8 | `src/pages/finance/*`, faturas e cobranças de cliente, contratos, propostas, `financialFormat.ts`, `brlCurrencyInput.ts` |
| IX9 | `src/pages/superadmin/*` (planos, dashboard, faturamento, billing2), partner |

`SuperAdminPlans` formata preço com `currency: 'BRL'`. É a tela que a IX3 passa a editar por moeda.

---

## 9. O que a IX0 não fez

- Não traduz tela.
- Não cria preço em dólar ou euro.
- Não chama a API da Stripe.
- Não muda o checkout brasileiro.
- Não lê `CF-IPCountry`.

O mapa `currencyForCountry` existe para a IX2 importar. Nesta sprint só o teste unitário o chama.
