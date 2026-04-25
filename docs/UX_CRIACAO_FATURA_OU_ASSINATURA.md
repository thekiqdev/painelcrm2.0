# UX — Criação: fatura única ou assinatura recorrente

## Objetivo

Na criação de cobranças (`CustomerInvoiceNew`), o utilizador escolhe explicitamente entre:

- **Fatura única** — cobrança avulsa, sem `subscription`.
- **Assinatura recorrente** — cria `subscription` (tipo CRM) e a **primeira** `customer_invoice` ligada, com renovações automáticas tratadas pelo motor já existente.

O mesmo passo **Tipo de cobrança** (dois cartões) aplica-se **com ou sem cliente** no início: com cliente selecionado ou em modo **fatura por link** (sem cliente até o link ser preenchido).

## Fluxo na interface

1. **Cliente / link**: seleção do cliente **ou** ativar «Usar fatura por link» (texto explicativo quando o link está ativo).
2. **Tipo de cobrança** (fora do modo embebido): dois cartões — **Fatura única** e **Assinatura recorrente** (copy específica para modo link quando aplicável).
3. **Dados da cobrança**: formulário com badge do tipo, **Alterar tipo** e **Voltar** para o passo 2.

### Exceções

| Situação | Comportamento |
|----------|----------------|
| `embedded` (ex.: chat) | Continua a ir direto ao formulário como **fatura única** (sem passo intermédio). |
| URL com `client_id` (não embebido) | Após preencher o cliente, abre o passo **Tipo de cobrança**. |
| Fatura por link | «Continuar» no primeiro passo exige gateway CRM ativo (igual ao fluxo com cliente); abre **Tipo de cobrança** (não salta o formulário sem escolher tipo). |

## Comportamento técnico

- **Fatura única**: `POST /api/customer-invoices` sem `recurring: true` → `createManualInvoice`.
- **Assinatura** (com ou sem `client_id`): `recurring: true` + `billing_interval` + itens → `createRecurringManualInvoice`.
  - Com **cliente**: igual ao fluxo anterior (cobrança no gateway quando aplicável).
  - **Por link** (`client_id` null): primeira fatura criada como fatura por link (`createManualInvoice` sem gateway); `subscriptions.customer_id` fica `NULL` até `completePaymentByToken`, que passa a preencher o cliente na fatura **e** na assinatura (`UPDATE subscriptions SET customer_id = … WHERE customer_id IS NULL`).

A validação Zod que obrigava cliente para recorrência foi removida; o motor de renovação continua a exigir cliente na assinatura antes de gerar cobranças — garantido após conclusão do link.

## Campos específicos da assinatura (UI)

- **Periodicidade**, **vencimento da primeira cobrança**, nota sobre **geração antecipada**, itens como base de renovações (ver código).

## Critérios de aceite

- [x] Utilizador escolhe entre fatura única e assinatura (com cliente ou por link, exceto embebido).
- [x] Fatura única por link mantém `payment_token` e fluxo público atual.
- [x] Assinatura por link cria `subscription` + primeira fatura por link; após completar o link, a assinatura fica com `customer_id` para o motor.
- [x] Fluxo com cliente selecionado inalterado na intenção (passo tipo + formulário).
- [x] `npm run build` (frontend e backend `tsc`).

## Ficheiros principais

- `src/pages/CustomerInvoiceNew.tsx`
- `packages/backend/src/controllers/customerInvoicesController.ts`
- `packages/backend/src/services/customerBillingService.ts`
