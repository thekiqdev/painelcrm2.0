# Módulo financeiro profissional (PainelCRM)

## Visão

O **Financeiro** é o painel de gestão financeira **da empresa** (visão consolidada: contas, entradas, despesas, indicadores e, nas próximas fases, recorrência, cartões e relatórios exportáveis).

Ele **não substitui** o módulo **Faturas** (`/customer-invoices`): faturas continuam sendo **cobranças a clientes** (gateway, `customer_invoices`). O Financeiro pode **incorporar na visão** as receitas dessas cobranças quando estão **pagas**, para o resumo unificado.

## Estado atual da base (investigação)

- **Legado (mantido):** tabelas `invoices` e `expenses` (`database/init/13_create_finance.sql`), filtradas por **tenant** via `user_id → users.tenant_id` nos controllers existentes.
- **Cobranças:** `customer_invoices` + endpoint `GET /api/finance/billing-receipts` (receitas pagas para relatório).
- **Fase 1 (novo):** migração `149_finance_module_phase1.sql` cria tabelas tenant-scoped com `tenant_id`, RLS alinhado ao padrão Etapa 5, e **categorias padrão** inseridas para todos os tenants existentes. Novos tenants recebem categorias na primeira listagem (`ON CONFLICT` + seed no serviço).

## Entidades (Fase 1)

| Tabela | Descrição |
|--------|-----------|
| `finance_accounts` | Contas/caixas: nome, tipo (`bank`, `cash`, `wallet`, `digital`), saldo inicial, data do saldo, descrição, ativo. |
| `finance_expense_categories` | Categorias de despesa por tenant (padrão + criadas pelo usuário). |
| `finance_income_entries` | Entradas manuais (valor, data recebimento, conta, cliente opcional, nome manual, tag, forma, observações). |
| `finance_expense_entries` | Despesas com vencimento, pagamento opcional, categoria, conta, status (`expected`, `pending`, `paid`, `overdue`, `cancelled`), fornecedor. |

**Saldo estimado da conta:** saldo inicial + soma de entradas (`received_at` ≥ data do saldo inicial) − despesas **pagas** vinculadas à conta (`status = paid`, data efetiva `COALESCE(paid_at, expense_date)` ≥ data do saldo inicial).

## APIs (Fase 1)

Todas sob `GET/POST/PATCH/DELETE` com prefixo **`/api/finance`**, autenticação CRM e tenant (mesmo stack de `billing-receipts`).

- `GET /api/finance/accounts` — lista contas + `current_balance_cents` estimado.
- `POST /api/finance/accounts` — cria conta.
- `GET|PATCH|DELETE /api/finance/accounts/:accountId`
- `GET /api/finance/accounts/:accountId/ledger` — extrato (entradas + despesas).
- `GET /api/finance/accounts/:accountId/period?from=&to=` — totais entrada/saída no período.
- `GET|POST /api/finance/expense-categories`
- `GET|POST /api/finance/income-entries` (+ filtros `from`, `to`, `account_id`)
- `PATCH|DELETE /api/finance/income-entries/:id`
- `GET|POST /api/finance/expense-entries` (+ filtros)
- `PATCH|DELETE /api/finance/expense-entries/:id`

**Compatibilidade:** `GET /api/finance/billing-receipts` ganhou filtros opcionais `from` e `to` (data de `paid_at`). `GET /api/invoices` ganhou `issue_from` / `issue_to` opcionais.

## Frontend (Fase 1)

- Rotas aninhadas em **`/finance`** com layout e subpáginas:
  - `/finance/resumo` — resumo com **filtro mês / trimestre / ano**, cards (Receita, Despesas, Lucro) e gráfico **Receita × Despesas** (dados agregados do período).
  - `/finance/contas` — cadastro e **cards** por conta; detalhe em `/finance/contas/:id` (extrato + atalhos para lançamentos).
  - `/finance/entradas` — entradas manuais + lista.
  - `/finance/despesas` — despesas do novo modelo + **nova categoria** + marcar paga/pendente.
  - `/finance/cartoes`, `/finance/relatorios` — placeholders (Fases 3–4).
- **`/finance/notas-internas`** — tela legada anterior (`Finance.tsx`: notas internas + despesas antigas por projeto).
- Menu lateral: grupo **Financeiro** com atalhos para cada seção (em sidebar expandida).

## Regras de negócio (resumo Fase 1)

- **Receita no resumo:** notas internas com `status=paid` no período (`issue_date`) + cobranças pagas (`paid_at`) + entradas manuais (`received_at`).
- **Despesas no resumo:** despesas legadas (`expenses.date` no período) + despesas novas com `expense_date` no período e **status ≠ cancelled** (valor reconhecido no período; refinamento contábil pode evoluir nas fases).
- **Lucro no card:** receita − despesas conforme totais acima (parametrizável no código em evoluções futuras).

## Fases (roadmap)

| Fase | Escopo |
|------|--------|
| **1 (atual)** | Resumo filtrado, contas, entradas, despesas, categorias padrão + custom, integração leitura cobranças pagas + notas internas + legado `expenses`, tenant-scoped, sem quebrar Faturas. |
| **2** | Despesas recorrentes, ocorrências, projeção futura, anti-duplicidade. |
| **3** | Cartões: cadastro, compras parceladas, fatura, pagamento, ajuste “despesas não cadastradas”. |
| **4** | Relatórios por abas (Visão geral, Bancos, Despesas, Receitas e cobranças, Cartões e recorrências), presets de período, comparação com período anterior, exportação CSV. PDF pode evoluir depois. |

## Próximos passos sugeridos

- Quinzena no filtro do resumo (UI + agregação).
- Conciliação explícita entre `customer_invoices` e conta bancária (opcional).
- Testes automatizados dos serviços `financeModuleService` (saldo, período, RLS).
- Migração gradual de despesas legadas para `finance_expense_entries` (opcional, off-line).

## Critérios de aceite Fase 1 (checklist)

- [x] Menu Financeiro com subitens (Resumo, Contas, Entradas, Despesas, Cartões, Relatórios).
- [x] Resumo com cards Receita / Despesas / Lucro e gráfico no período.
- [x] Cadastro de contas e cards com saldo estimado; detalhe com extrato.
- [x] Entradas manuais e despesas (novo modelo) funcionando.
- [x] Categorias padrão + criação de nova categoria.
- [x] Filtro por mês, trimestre e ano no resumo.
- [x] Dados tenant-scoped (tabelas + API).
- [x] Faturas (cobranças) intactas; receitas de cobrança integradas só leitura no resumo.
- [x] Migração `149_finance_module_phase1.sql` registrada em `migrate.ts`.
