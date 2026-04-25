# Módulo Financeiro: contas pessoais e transferências

## Contas pessoais vs empresariais

As contas financeiras agora têm `account_scope`:

- `business` = conta empresarial
- `personal` = conta pessoal

Default: `business`.

Na UI, o campo aparece como **Tipo da conta** com opções:

- Empresarial
- Pessoal

## Transferência entre contas

A transferência interna é criada por `POST /api/financial/transfers` com:

- `from_account_id`
- `to_account_id`
- `amount_cents`
- `transfer_date`
- `description` (opcional)

Validações:

- origem e destino obrigatórios
- origem diferente de destino
- valor maior que zero
- contas devem pertencer ao mesmo tenant

## Modelagem

### Tabela de rastreio

`financial_transfers`

- id
- tenant_id
- from_account_id
- to_account_id
- amount_cents
- transfer_date
- description
- out_transaction_id
- in_transaction_id
- created_at
- updated_at

### Movimentos gerados

Cada transferência gera 2 linhas em `financial_transactions`:

1) Saída da origem:

- `type = 'expense'`
- `transaction_kind = 'transfer'`
- `transfer_direction = 'out'`
- `transfer_id` preenchido

2) Entrada no destino:

- `type = 'income'`
- `transaction_kind = 'transfer'`
- `transfer_direction = 'in'`
- `transfer_id` preenchido

## Impacto em saldo e lucro

- **Saldo por conta**: transferência altera normalmente (sai da origem, entra no destino).
- **Extrato da conta**: aparece como transferência enviada/recebida.
- **Resumo e relatórios gerais (receita/despesa/lucro)**: transferências internas são excluídas dos totais para não inflar resultado.

Implementação dos filtros de totais:

- `COALESCE(transaction_kind, 'regular') <> 'transfer'` em agregações de receita/despesa.

## Endpoints

- `POST /api/financial/transfers`
- `GET /api/financial/transfers` (filtros: `account_id`, `from`, `to`)

## Critérios de aceite cobertos

- cadastro de conta pessoal e empresarial
- listagem com tipo da conta + filtro por tipo
- transferência com dupla escrituração (saída/entrada)
- atualização de saldos/extratos nas duas contas
- transferência não afeta lucro/receita/despesa do relatório geral
- bloqueio de transferência para a mesma conta
