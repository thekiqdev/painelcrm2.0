# Relatórios financeiros — receita de assinaturas e projeção futura

Este documento descreve a configuração de ciclos nas assinaturas CRM (`subscriptions.type = customer`) e como o relatório `GET /api/financial/reports` calcula **realizado**, **pendente** e **previsto**, sem alterar o motor de geração de faturas.

## Colunas na base

- `subscriptions.cycles_unlimited` (boolean, default `true`): quando `true`, a assinatura não tem limite explícito de cobranças; `max_cycles` deve ser `NULL`.
- `subscriptions.max_cycles` (integer, nullable): quando `cycles_unlimited = false`, indica o **número total de cobranças** previstas ao longo da vida da assinatura (inclui faturas já emitidas). Obrigatório e `> 0` neste modo.

Constraint SQL: `(cycles_unlimited AND max_cycles IS NULL) OR (NOT cycles_unlimited AND max_cycles > 0)`.

Migração: `database/init/154_subscriptions_cycles_config.sql`.

## Ciclos ilimitados

- Não há teto de faturas pela configuração.
- A **receita prevista** no relatório percorre apenas o **intervalo do filtro** (mês actual, ano civil, YTD, datas personalizadas): projecta-se a partir de `next_billing_date` com a mesma regra de datas que `calculateNextBillingDate` (âncora e último dia do mês).

## Ciclos finitos

- `max_cycles` representa o máximo de **faturas de ciclo** (cobranças) para a assinatura, contando as já existentes.
- Espaço restante para projeção: `max(0, max_cycles - COUNT(faturas não canceladas))`.
- Não se projectam mais ciclos depois de atingir esse teto.

## Realizado vs pendente vs previsto

| Conceito | Origem | Atribuição ao mês (gráfico/tabela mensal) |
|----------|--------|---------------------------------------------|
| **Receita realizada** | Faturas de assinatura (`customer_invoices` com `subscription_id`, não filhas) com `status = paid` e `paid_at` no intervalo | Mês = `to_char(paid_at::date, 'YYYY-MM')` |
| **Receita pendente** | Mesmas faturas, estados `pending`, `waiting_payment`, `processing`, `overdue` | Mês = `due_date` no intervalo |
| **Receita prevista** | Datas de cobrança futuras **sem** fatura correspondente, derivadas de `next_billing_date` + periodicidade | Mês = data projectada da cobrança |

Regras de não duplicidade:

- Se já existe fatura (ou ciclo `subscription_cycles` com `invoice_id` / estado `invoiced`) para uma data de ciclo, **não** entra em previsto.
- Com `subscription_cycles_read = true` e linhas em `subscription_cycles`, usam-se ciclos `pending`/`queued`/`processing` **sem** `invoice_id` como previsto no período, e marca-se a data como ocupada antes da simulação por `next_billing_date`.
- Com flag desligada ou sem linhas em `subscription_cycles`, usa-se apenas `subscriptions` + `customer_invoices` (fallback).

O motor de geração de faturas **não** é alterado por esta fase; apenas leitura e agregação.

## Impacto no gráfico (Financeiro > Relatórios > Visão geral)

- Gráfico de barras empilhadas por mês: **realizada** (verde), **pendente** (âmbar), **prevista** (violeta).
- A altura total da barra representa o **potencial** no mês (soma dos três componentes), desde que não haja duplicação por ciclo.

## API

`GET /api/financial/reports` inclui:

- `subscriptions_projection`: totais, contagens de ciclos, `by_month`, `rows` (detalhe por assinatura), `cycles_read_used`.
- Em cada elemento de `monthly`: `subscription_revenue_realized`, `subscription_revenue_pending`, `subscription_revenue_projected`.

Preset adicional: `preset=full_year` ou `current_year` → 1 de Janeiro a 31 de Dezembro do ano UTC actual (alinhado ao backend de resumo).

## Configuração na UI

- **Nova fatura / assinatura** (`CustomerInvoiceNew`): interruptor «Ciclos ilimitados» e campo «Quantidade de ciclos» quando desligado.
- **Detalhe da assinatura** (`SubscriptionDetail`): mesmo bloco com `PATCH /api/crm-subscriptions/:id/cycles-config`.
- **Criação via API** (`POST /api/customer-invoices`): campos opcionais `cycles_unlimited`, `max_cycles` quando `recurring: true`.

## Cuidados

- Alterar `max_cycles` para um valor inferior ao número de faturas já emitidas faz com que **não haja** receita prevista adicional até o utilizador corrigir o limite.
- `cancel_at_period_end`: a projeção não avança além de `current_period_end` quando aplicável.
- Receita «realizada» do módulo de assinaturas é um subconjunto das faturas de clientes pagas; a **receita total** do relatório continua a incluir todas as faturas pagas no período (não só assinaturas).
