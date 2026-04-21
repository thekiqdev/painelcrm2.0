# Propostas — ajuste: rascunho no create e fatura “enviada” na conversão

Ajuste incremental: restaurar **Salvar como rascunho** na criação e fazer a fatura gerada na conversão da proposta nascer com status alinhado a **cobrança já emitida ao cliente**.

## 1. Botão «Salvar como rascunho»

- **Onde:** `src/pages/NewProposal.tsx`
- **O que:** Dois CTAs no rodapé do formulário:
  - **Criar proposta** — primário (`size="lg"`, destaque), mesma API `POST /api/proposals` com `status: draft`, depois navega para `/proposals/:id` e mensagem sobre o link.
  - **Salvar como rascunho** — secundário (`variant="outline"`, `size="lg"`), mesma validação e mesmo payload (rascunho), depois `toast` «Rascunho salvo.» e navegação para **`/proposals`** (lista), **sem** restaurar o botão antigo «Salvar rascunho e voltar à lista».
- **Hierarquia:** um único primário + um secundário explícito; sem CTAs redundantes.

## 2. Fatura na conversão da proposta — status «enviada»

O modelo de faturas (`customer_invoices`) **não** possui o literal `sent` no CHECK de `status`. Valores permitidos incluem, entre outros, `pending` e `waiting_payment` (ver `database/init/75_payment_status_check_multi_gateway.sql`).

**Escolha adotada**

- **`waiting_payment`** = na UI do CRM costuma aparecer como **«Aguardando pagamento»** — fatura/cobrança já colocada na fila de ciclo de pagamento (emitida ao cliente no sentido de negócio), distinta de um `pending` genérico logo após rascunho interno.
- **`pending`** permanece o padrão para demais fluxos de `createManualInvoice` que não passam a flag.

**Implementação**

- `CreateManualCustomerInvoiceInput` ganha opcional `initial_status?: 'pending' | 'waiting_payment'`.
- `createManualCustomerInvoice` usa esse valor no `INSERT` (placeholder `$11` para `status`).
- `createManualInvoice` (`customerBillingService`) aceita `initial_invoice_status` opcional e repassa `initial_status: 'waiting_payment'` só quando solicitado (e apenas no ramo que já cria fatura **com** gateway/cobrança).
- `convertAcceptedProposalToInvoice` (`proposalInvoiceConversionService`) chama `createManualInvoice` com **`initial_invoice_status: 'waiting_payment'`**.

**Preservado:** `proposal_id`, itens, valores, cliente, proteção contra dupla conversão e demais regras existentes.

**Exceção:** no ramo de `createManualInvoice` em que o cliente **não** tem CPF/CNPJ e a fatura é criada **sem** passagem pelo gateway, **não** se aplica `waiting_payment` (continua `pending`), pois não há cobrança emitida no provedor.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/NewProposal.tsx` | `validateBeforeCreate`, `buildCreatePayload`, `saveDraft`, botão secundário. |
| `packages/backend/src/services/customerInvoiceService.ts` | `initial_status` no input e no `INSERT`. |
| `packages/backend/src/services/customerBillingService.ts` | `initial_invoice_status` no body de `createManualInvoice`; repasse para `createManualCustomerInvoice` no fluxo com gateway. |
| `packages/backend/src/services/proposalInvoiceConversionService.ts` | `initial_invoice_status: 'waiting_payment'` na conversão. |

## Riscos remanescentes

- Ambientes ou integrações que assumiam **sempre** `pending` no primeiro registro da fatura manual podem precisar revisar relatórios ou filtros (mitigação: mudança limitada à conversão de proposta com gateway).
- Fatura sem gateway (cliente sem documento) segue `pending`.
- Webhooks do provedor podem ainda normalizar tentativas como `pending` conforme `normalizeGatewayStatus`; o **documento** da fatura em `customer_invoices` inicia em `waiting_payment` na conversão.

## Checklist

- [x] Botão **Salvar como rascunho** voltou na criação da proposta
- [x] Botão **Criar proposta** continua como CTA principal
- [x] Botão antigo **Salvar rascunho e voltar à lista** não voltou
- [x] Ao converter proposta em fatura (com gateway), a fatura nasce com **`waiting_payment`**
- [x] Vínculo `proposal_id` preservado
- [x] Conversão preserva cliente, itens e valores (sem mudança de regra de montagem)
