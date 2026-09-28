# Histórico da recorrência dentro da fatura

Implementação incremental para exibir, na tela de detalhe da fatura, o histórico das invoices da mesma recorrência usando `subscription_id` como agrupador lógico.

## Endpoint/payload ajustado

- Reaproveitado endpoint existente: `GET /api/customer-invoices/:id/recurrence-history`.
- Ajuste no backend (`customerBillingService.listRecurrenceHistoryForInvoice`):
  - adicionou `payment_token` no `SELECT` e no tipo `RecurrenceHistoryInvoice`;
  - ordenação definida como `ORDER BY due_date DESC, created_at DESC` (mais recente primeiro).

## Como o histórico foi carregado

- A tela `CustomerInvoiceDetail` já carregava o histórico quando `invoice.subscription_id` existe.
- Mantido esse fluxo:
  1. carrega invoice por `id`;
  2. se há `subscription_id`, chama `customerInvoicesService.getRecurrenceHistory(id)`;
  3. renderiza o bloco **Faturas desta recorrência**.

## Campos exibidos no bloco

Por item da recorrência:

- número da fatura (`invoice_number` com fallback para `id`);
- período (`period_start` / `period_end`, quando presente);
- vencimento (`due_date`);
- valor (`amount_cents`);
- status (badge já existente);
- criação (`created_at`);
- ação para abrir detalhe (`/customer-invoices/:id`);
- ação de pagamento quando aplicável (`/pay/:payment_token`).

## Como a fatura atual é identificada

- comparação `historyItem.id === invoice.id`;
- destaque visual do card da linha (borda/fundo);
- badge textual **Atual**.

## Critério de ordenação escolhido

- `due_date DESC`, com desempate por `created_at DESC`.
- Motivo: facilita leitura operacional com os ciclos mais recentes no topo.

## Estados de borda tratados

- **Invoice sem `subscription_id`:** bloco não é exibido.
- **Recorrência com lista vazia:** mostra mensagem simples “Esta recorrência ainda não gerou faturas no histórico.”
- **Itens sem `payment_token`:** linha aparece normalmente; ação de pagamento não aparece.
- **Status cancelado/falhado/pago/etc.:** exibidos via badge de status já padronizada.

## Relação com bloco de Recorrência

- O bloco **Recorrência** continua mostrando estado operacional (próxima cobrança, periodicidade, último processamento).
- O bloco **Faturas desta recorrência** complementa com visão histórica de cobranças geradas.
- Na tela, o histórico é renderizado abaixo do bloco de recorrência.

## Riscos remanescentes

- Se o volume de invoices por assinatura crescer muito, pode ser necessário paginação no endpoint (`LIMIT 120` atual).
- A ação “Abrir pagamento” usa `payment_token`; invoices antigas sem token não terão ação (comportamento esperado).
