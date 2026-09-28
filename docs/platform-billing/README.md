# Cobrança SaaS da plataforma (`tenant_billing`)

## Objetivo

Centralizar a experiência de **pagamento de faturas já emitidas** para o plano/comercialização SaaS da PainelCRM: uma única linha em `tenant_billing`, link público próprio da plataforma para o cliente e visão **global** no Super Admin.

## Fonte única da cobrança

- A entidade canônica é **`tenant_billing`** (valor, vencimento, status, `invoice_number`, referência de gateway, metadata operacional).
- Não se cria segunda cobrança ao abrir a página pública; apenas se consulta e atualiza a mesma linha (preparar método, polling, webhooks).

## Por que o checkout não é a experiência principal da fatura

- O **`/checkout` (PlanCheckout)** é o fluxo **comercial** de contratação (plano, dados da empresa, administrador).
- Reutilizá-lo como tela principal de “pagar esta fatura” mistura **contratação** com **liquidação** e aumenta risco de UX confusa e regressões.
- A frente dedicada é **só cobrança**: resumo, status, meios de pagamento, sem wizard de plano.

## Página pública própria

- Rota pública **`/saas-pay/:token`** com token opaco (alta entropia) mapeado em `tenant_billing.platform_public_pay_token`.
- APIs em `/api/public/saas-billing/:token` (consulta, preparar pagamento, status, cartão) sem expor UUID na URL pública.

## Super Admin e link público

- **Cobranças da plataforma**: listagem global (`GET /api/superadmin/platform-billings`) com indicadores `has_public_pay_link` e `has_gateway_fallback_link`.
- O operador pode copiar o link da plataforma para suporte ou conferência, sem depender do link bruto do Asaas como principal.

## Documentação por fase

| Ficheiro | Conteúdo |
|----------|----------|
| [PHASE-A-superadmin-financial-control.md](./PHASE-A-superadmin-financial-control.md) | Listagem global Super Admin |
| [PHASE-B-platform-public-billing-page.md](./PHASE-B-platform-public-billing-page.md) | Página pública + token + APIs |
| [STATUS.md](./STATUS.md) | Estado atual da frente |
