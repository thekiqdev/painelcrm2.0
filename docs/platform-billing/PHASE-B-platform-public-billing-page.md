# Fase B — Página pública de cobrança SaaS

## Objetivo

Página **`/saas-pay/:token`** e APIs públicas mínimas para a **mesma** linha `tenant_billing`, sem UUID na URL pública e **sem recriar** cobrança no gateway ao abrir a página.

## Estado: concluído (implementação inicial)

## Estratégia do token público

- Coluna dedicada: **`tenant_billing.platform_public_pay_token`**
- Formato: **64 caracteres hexadecimais** (32 bytes de `crypto.randomBytes`, encoding hex) — token opaco, alta entropia (~128 bits efetivos de espaço de busca por tentativa; adivinhar por força bruta é impraticável)
- Unicidade: índice **único parcial** em `platform_public_pay_token` onde não nulo
- **Idempotência:** `ensureTenantBillingPublicPayToken` só grava quando o valor atual é nulo/vazio ou inválido; nunca sobrescreve token válido existente
- Resolução pública: apenas linhas com token no formato esperado; formato inválido → 404, mitigando enumeração por padrão

## Rotas frontend (públicas)

| Rota | Componente |
|------|------------|
| `/saas-pay/:token` | `PublicSaasBillingPay.tsx` |

Validação client-side do token: regex `^[a-f0-9]{64}$` (case insensitive).

## Endpoints públicos (API)

Base: `/api/public` (sem `Authorization`).

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET` | `/api/public/saas-billing/:token` | Resumo seguro (valor, vencimento, status, labels, `can_pay`, PIX/boleto/cartão quando já materializados, URLs seguras) |
| `POST` | `/api/public/saas-billing/:token/prepare-payment` | Prepara método (reutiliza serviços de checkout SaaS **sem** expor wizard comercial) |
| `GET` | `/api/public/saas-billing/:token/status` | Polling de status |
| `POST` | `/api/public/saas-billing/:token/pay-with-card` | Pagamento com cartão (rate limit reutilizado) |

Rate limit: variáveis `RATE_LIMIT_PUBLIC_SAAS_BILLING_READ_MAX` / `RATE_LIMIT_PUBLIC_SAAS_BILLING_WRITE_MAX` (em desenvolvimento pode ser ignorado conforme configuração existente).

Controller: `publicSaasBillingController.ts`. Lógica de fatura/token: `invoiceService.ts` (`getInvoiceByPlatformPublicPayToken`, `ensureTenantBillingPublicPayToken`). URL da plataforma: `utils/saasPlatformInvoiceUrl.ts` (`FRONTEND_URL`).

## Merge field (notificações da plataforma)

- **`billing.platform_invoice_url`** — URL canônica da fatura na própria plataforma (`{FRONTEND_URL}/saas-pay/{token}`)
- Catálogo / template: `database/init/145_platform_notification_billing_platform_invoice_url.sql`
- Payload em `platformBusinessNotifications.ts` (`publishPlatformBillingChargeCreated`): preenche `billing.platform_invoice_url` após garantir o token

**`billing.payment_link`** permanece como link direto do gateway (Asaas) quando existir — uso como **fallback** nas mensagens, não como experiência principal na UI desta frente.

## Fallback temporário (gateway)

- Na UI pública e no resumo da API: campo `gateway_fallback_url` quando aplicável (`saasBillingLinkHelpers` / metadata controlada)
- Objetivo: rollout seguro; experiência principal = página `/saas-pay/...`

## Arquivos criados ou alterados (Fase B)

- `database/init/144_tenant_billing_platform_public_pay_token.sql`
- `database/init/145_platform_notification_billing_platform_invoice_url.sql`
- `packages/backend/src/services/invoiceService.ts` (token, leitura por token)
- `packages/backend/src/utils/saasPlatformInvoiceUrl.ts`
- `packages/backend/src/services/saasBillingLinkHelpers.ts`
- `packages/backend/src/controllers/publicSaasBillingController.ts`
- `packages/backend/src/routes/publicRoutes.ts`
- `packages/backend/src/services/platformNotifications/platformBusinessNotifications.ts`
- `src/pages/PublicSaasBillingPay.tsx`
- `src/App.tsx` (rota pública)

## Validações realizadas

- Builds backend e frontend sem erros
- Token opaco (não UUID) na URL; mesma `tenant_billing` por token
- Reuso de `prepareSaasCheckoutPaymentMethodForBilling` / pagamento cartão existente, sem redirecionar o utilizador para o fluxo comercial de PlanCheckout como tela principal

## Riscos / pontos de atenção

- Garantir `FRONTEND_URL` correto em produção para links e merge fields
- Opcional futuro: revogação/rotação de token, expiração
- PIX: condicionado a CPF/CNPJ válido no tenant (`tenant_has_valid_cpf` na API); caso contrário a UI orienta outros meios
