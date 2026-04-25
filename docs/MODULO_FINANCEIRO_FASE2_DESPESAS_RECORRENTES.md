# Módulo financeiro — Fase 2: despesas recorrentes e projeção

## Objectivo

Permitir despesas fixas repetidas (aluguel, assinaturas, etc.), gerar ocorrências futuras, registar o pagamento como despesa na conta e enriquecer o resumo financeiro com valores **planejados** e **previstos** quando o período incluir meses ou totais com ocorrências em aberto.

## Modelo de dados

### `financial_recurring_expenses`

| Campo | Descrição |
|--------|------------|
| `description` | Nome da despesa |
| `amount_cents` | Valor em centavos |
| `category_id` | Categoria (`expense_categories`) |
| `default_account_id` | Conta padrão (`financial_accounts`) |
| `periodicity` | `weekly`, `biweekly`, `monthly`, `quarterly`, `semiannual`, `annual` |
| `due_day` | Semanal/quinzenal: 1=segunda … 7=domingo. Mensal+: dia do mês (1–31) |
| `start_date` | Início da série |
| `end_date` | Fim opcional |
| `schedule_type` | `infinite` ou `finite` |
| `max_occurrences` | Obrigatório se `finite` |
| `is_active` | Se inactivo, remove ocorrências futuras não pagas |

### `financial_recurring_expense_occurrences`

| Campo | Descrição |
|--------|------------|
| `due_date` | Vencimento |
| `amount_cents` | Valor (cópia da regra na geração) |
| `status` | `planned`, `pending`, `paid`, `cancelled` |
| `paid_at` | Preenchido ao pagar |
| `transaction_id` | Ligação à despesa criada em `financial_transactions` |

**Unicidade:** `(recurring_expense_id, due_date)` evita duplicar a mesma data.

## Geração de ocorrências

- Ao **criar** ou **actualizar** uma despesa recorrente activa, o sistema:
  - apaga ocorrências **futuras** (`due_date >= hoje`) com estado `planned` ou `pending` e sem `transaction_id`;
  - volta a gerar datas até **pelo menos 12 meses** a partir de `max(hoje, start_date)`, respeitando `end_date`, `max_occurrences` e periodicidade.
- Inserções usam `ON CONFLICT DO NOTHING` na unicidade `(recurring_expense_id, due_date)`.
- **Estado inicial:** `planned` se `due_date > hoje`, senão `pending`.

## Pagamento de ocorrência

`POST /api/financial/recurring-expense-occurrences/:id/pay`

- Cria `financial_transactions` do tipo `expense`, `status = completed`, na conta (por omissão a da ocorrência).
- Actualiza a ocorrência: `status = paid`, `paid_at = now()`, `transaction_id`.
- O saldo da conta segue a lógica existente (despesas concluídas).

## Resumo financeiro (`GET /api/financial/summary`)

Parâmetros:

| Parâmetro | Uso |
|-----------|-----|
| `preset=current_month` | Mês civil actual |
| `preset=next_month` | Mês civil seguinte |
| `from`, `to` | Período personalizado (se não usar preset) |

Campos adicionais na resposta (valores em **reais**, como o resto do endpoint):

- `planned_recurring_expense_total` — soma de ocorrências `planned` ou `pending` no período.
- `projected_total_income` — nesta fase igual à receita **realizada** no período (sem previsão de novas receitas).
- `projected_total_expense` — despesas realizadas (transacções concluídas) + planejadas recorrentes no período.
- `projected_balance` — `projected_total_income - projected_total_expense`.
- `monthly[].planned_recurring_expense`, `projected_expense`, `projected_profit` — detalhe por mês.

**Nota:** despesas já pagas via ocorrência entram nas transacções concluídas e **não** entram na soma “planejada”, evitando duplicação.

## API (prefixo `/api/financial`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/recurring-expenses` | Lista (`active_only=true` opcional) |
| POST | `/recurring-expenses` | Cria + gera ocorrências |
| PATCH | `/recurring-expenses/:recurringId` | Actualiza + regenera futuras não pagas |
| POST | `/recurring-expenses/:recurringId/regenerate` | Só regenera |
| GET | `/recurring-expense-occurrences` | Lista (`from`, `to`, `recurring_expense_id` opcional) |
| POST | `/recurring-expense-occurrences/:occurrenceId/pay` | Corpo opcional: `account_id`, `transaction_date` |

## Frontend

- **`/finance/recurring-expenses`** — gestão de regras, filtro por mês nas ocorrências, botão **Pagar**.
- **`/finance`** — cartão **Próximas despesas** (mês + **Pagar**), cartões de projeção quando há total planejado, gráfico com série **Planejadas**.

## Migração

Ficheiro: `database/init/151_financial_recurring_expenses.sql` (registado em `packages/backend/src/migrate.ts`).

## Fora de âmbito (Fase 2)

Cartão de crédito, parcelamento, PDF/relatórios avançados, alteração ao motor de faturas recorrentes (`customer_invoices` / jobs de billing).
