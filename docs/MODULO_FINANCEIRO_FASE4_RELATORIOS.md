# Módulo financeiro — Fase 4: Relatórios (nível empresarial)

Relatórios consolidados **tenant-scoped** sobre o modelo unificado (`financial_*`, `expense_categories`, `customer_invoices`, cartões e recorrências). Não altera o motor de faturas recorrentes nem `customer_invoices` além de leituras agregadas.

## API

`GET /api/financial/reports`

Query (mesmos critérios do resumo):

- `preset`: `current_month` | `last_month` | `ytd` | `next_month` (herdado; útil para outros ecrãs) — **ou**
- `from` + `to` (`YYYY-MM-DD`) para intervalo livre.

Resposta inclui `preset` quando aplicável.

## Conteúdo do relatório

| Bloco | Descrição |
|--------|-----------|
| **period / previous_period** | Intervalo seleccionado e período anterior de **mesma duração** (para variação percentual). |
| **general** | Totais alinhados ao resumo financeiro: receitas, despesas, lucro, movimentos vs faturas de clientes, previsões (recorrente, cartão, despesas previstas, saldo previsto), faturas de cartão em aberto. |
| **comparison** | Variação % da receita, despesa e lucro vs período anterior (`null` se divisão por zero). |
| **monthly** | Série mensal no intervalo (receita, despesa, lucro, recorrente e cartão previstos). |
| **by_account** | Por conta: receitas e despesas **concluídas** no período, líquido do período, saldo estimado actual. |
| **expenses_by_category** | Despesas concluídas agrupadas por categoria. |
| **income_by_category** | Entradas concluídas agrupadas por categoria. |
| **billing_by_client** | `customer_invoices` pagas no período, agrupadas por cliente (até 200 linhas). |
| **credit_cards** | Lista de cartões com utilização e próxima fatura (mesma lógica da listagem de cartões). |
| **credit_card_bank_payments** | Soma de despesas no período ligadas ao pagamento de fatura (categoria sistema «Cartão de crédito» e «Despesas não cadastradas» quando a descrição indica ajuste de fatura). |
| **recurring_snapshot** | Recorrentes com vencimento no período ainda em `planned`/`pending`; valores pagos com `paid_at` no período. |

## Frontend

Rota: **`/finance/relatorios`**

Abas:

1. **Visão geral** — KPIs, comparação com período anterior, previsão, tabela mensal.  
2. **Bancos** — movimento e saldo por conta.  
3. **Despesas** — por categoria.  
4. **Receitas e cobranças** — receitas por categoria + cobranças por cliente.  
5. **Cartões e recorrências** — cartões, saídas para faturas, snapshot de recorrentes.

**Exportação:** botão **CSV** (UTF-8 com BOM, separador `;`) para arquivo ou Excel em PT.

## Presets adicionados ao resumo

Os presets `last_month` e `ytd` foram acrescentados a `resolveSummaryRange` no controlador financeiro e aplicam-se também a `GET /api/financial/summary`.

## Critérios de aceite

- [x] Relatório único com dados consistentes com o resumo e com RLS por tenant.  
- [x] Comparativo com período anterior de igual duração.  
- [x] Abas cobrindo visão geral, bancos, despesas, receitas/cobranças, cartões e recorrências.  
- [x] Export CSV.  
- [x] Build backend e frontend sem erros.  

## Evolução sugerida

- Export PDF (biblioteca dedicada ou impressão do browser).  
- Gráficos adicionais por aba.  
- Agendamento de envio por e-mail (fora do âmbito actual).
