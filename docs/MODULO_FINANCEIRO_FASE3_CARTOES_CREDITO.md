# Módulo financeiro — Fase 3: Cartões de crédito

Documentação da funcionalidade **tenant-scoped** de cartões de crédito no PainelCRM. Não altera `customer_invoices` nem o motor de faturas recorrentes de clientes.

## Modelo de dados

| Tabela | Função |
|--------|--------|
| `financial_credit_cards` | Cadastro do cartão: nome, tipo (pessoal/empresa), limite opcional, dia de fechamento, dia de vencimento, conta padrão para pagar a fatura. |
| `financial_credit_card_purchases` | Compra (data, número de parcelas, categoria opcional, `total_amount_cents`, `amount_mode`). |
| `financial_credit_card_installments` | Parcela gerada automaticamente: valor, mês de fatura (`statement_month`), vencimento da parcela, estado (`planned` / `paid` / `cancelled`). |
| `financial_credit_card_statements` | Fatura do cartão por mês de referência: totais esperados, valores manuais na liquidação, estado (`open` / `closed` / `paid`). |

Restrições de unicidade:

- `(credit_card_id, statement_month)` na fatura.
- `(purchase_id, installment_number)` na parcela.

RLS: todas as tabelas usam políticas por `tenant_id`, alinhadas ao restante do módulo financeiro.

Categorias de sistema (tenant `NULL`): **Cartão de crédito**, **Despesas não cadastradas**, **Ajuste cartão** — criadas na migração `152_financial_credit_cards.sql` se ainda não existirem.

## Regra de fechamento

Cada cartão tem `closing_day` e `due_day`.

- Uma compra entra na fatura do **mês de referência** cujo ciclo ainda inclui a data da compra: se o dia da compra é **menor ou igual** ao dia de fechamento, conta para a fatura desse mês civil; se é **posterior** ao fechamento, desloca para o mês seguinte.
- O vencimento da fatura (`due_date` na linha da fatura) calcula-se com base no `due_day` no mês adequado ao ciclo (implementação em `financialCreditCardCycleUtils.ts`).

Exemplo: fechamento dia 20, vencimento dia 25 — compra a 19/04 entra na fatura de referência de abril; compra a 21/04 na de maio.

## Compras à vista e parceladas

Campo **`amount_mode`** (`total` | `installment`), persistido na compra (migração `153_financial_cc_purchase_amount_mode.sql`). O corpo da API `POST /credit-card-purchases` aceita `amount_mode` opcional; omissão = `total`.

### Modo «Valor total» (`amount_mode = total`)

Comportamento por omissão:

- O campo `total_amount_cents` é o **valor total da compra**.
- `installments_count = 1`: uma parcela com esse total.
- `installments_count > 1`: o total é repartido entre as parcelas com arredondamento; a diferença de centavos fica na **última** parcela.

**Exemplo:** R$ 900 em 3x → três parcelas de R$ 300 (300 + 300 + 300).

### Modo «Valor da parcela» (`amount_mode = installment`)

- O campo `total_amount_cents` no pedido representa o **valor de cada parcela** (em centavos).
- O sistema guarda na compra `total_amount_cents = valor_da_parcela × installments_count`.
- Todas as parcelas recebem o **mesmo** valor (sem repartição com resto).

**Exemplo:** R$ 500 em 3x como valor da parcela → total da compra R$ 1.500; três parcelas de R$ 500.

### Comum aos modos

- Cada parcela recebe o `statement_month` correcto (mês de referência da fatura) e parcelas seguintes ocupam meses futuros.
- Após inserir parcelas, o serviço recalcula o `expected_amount_cents` das faturas (`financial_credit_card_statements`) afectadas.
- A soma das parcelas coincide com o total da compra persistido.

## Faturas do cartão

- Uma linha em `financial_credit_card_statements` por par `(cartão, statement_month)`.
- O total esperado é a soma das parcelas **planeadas** (`planned`) naquele `statement_month` para o cartão.
- A listagem e o detalhe expõem: mês de referência, datas de fechamento e vencimento, totais, estado.

## Pagamento da fatura

`POST /api/financial/credit-card-statements/:statementId/pay`

Corpo:

- `payment_account_id` (obrigatório): conta/banco a debitar.
- `paid_at` (opcional): data do pagamento (`YYYY-MM-DD`).
- `manual_amount_cents` (opcional): valor real pago em centavos.

Comportamento:

1. Recalcula o esperado pela soma das parcelas `planned` da fatura.
2. Valor pago = `manual_amount_cents` se informado, senão o esperado.
3. Se o pago for **maior** que o esperado: cria duas despesas concluídas — uma no valor esperado (categoria **Cartão de crédito**) e outra na diferença (**Despesas não cadastradas**).
4. Caso contrário: uma despesa concluída no valor pago (categoria **Cartão de crédito**).
5. Marca a fatura como `paid`, preenche `paid_at`, contas e IDs das transacções; marca as parcelas como `paid` e associa `financial_transaction_id` à primeira transacção criada.

## Ajuste por diferença

- Diferença **positiva** (valor real superior ao cadastrado): tratada pela despesa extra «Despesas não cadastradas», como acima.
- Diferença **negativa**: o débito na conta reflecte apenas o valor efectivamente pago; não duplica compras no realizado do resumo.

## Impacto no resumo financeiro (`GET /api/financial/summary`)

- **Previsto / projeção**: soma das parcelas de cartão com estado `planned` por `statement_month` dentro do intervalo `from`–`to`, acrescentada ao `projected_total_expense` e por mês em `planned_credit_card` (evita contar compras em duplicado com transacções já realizadas).
- **Realizado**: o pagamento da fatura gera `financial_transactions` de despesa concluída — entra em `total_expense` / `transaction_expense` como qualquer outra despesa; as parcelas deixam de estar `planned`, logo deixam de entrar no previsto desse mês.
- Campos adicionais na resposta JSON: `planned_credit_card_installments_total`, `open_credit_card_statements_expected_total`.

## API (prefixo `/api/financial`)

| Método | Rota |
|--------|------|
| GET | `/credit-cards` |
| POST | `/credit-cards` |
| GET | `/credit-cards/:cardId` |
| PATCH | `/credit-cards/:cardId` |
| GET | `/credit-card-purchases` |
| POST | `/credit-card-purchases` |
| GET | `/credit-card-installments` |
| GET | `/credit-card-statements` |
| GET | `/credit-card-statements/:statementId` |
| POST | `/credit-card-statements/:statementId/pay` |

Filtros úteis em listagens: `card_id` ou `credit_card_id`, `from`, `to`, `status`; em parcelas também `statement_month` (primeiro dia do mês, ex.: `2026-04-01`).

## Frontend

- Lista: `/finance/credit-cards` (redirect de `/finance/cartoes`).
- Detalhe do cartão: `/finance/credit-cards/:cardId`.
- Fatura: `/finance/credit-cards/:cardId/faturas/:statementId`.

Linguagem de interface orientada ao utilizador: cartões, compras, parcelas, fatura do cartão, pagar fatura, valor real da fatura, despesas não cadastradas. No formulário de compra: **Valor total da compra** vs **Valor de cada parcela**.

## Critérios de aceite

- [x] Cartão pode ser cadastrado e editado.
- [x] Compra à vista gera uma parcela.
- [x] Compra parcelada gera várias parcelas com repartição correcta de centavos (modo total) ou parcelas iguais (modo valor da parcela).
- [x] Parcelas entram no `statement_month` correcto segundo o fechamento.
- [x] A fatura soma parcelas planeadas correctamente.
- [x] Fatura pode ser paga a partir de uma conta/banco.
- [x] Pagamento cria `financial_transaction`(s) de despesa concluída.
- [x] Valor manual superior ao esperado gera despesa «Despesas não cadastradas» na diferença.
- [x] Resumo financeiro inclui cartão sem duplicar previsto com realizado.
- [x] Build backend e frontend sem erros.
