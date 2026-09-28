# Billing Calendar Report — Sprint 4.0C

## Componente

`SubscriptionFinancialCalendar` — calendário mensal por assinatura.

## Fonte de dados

- Linhas da `timeline` do payload `CrmSubscriptionDetailPayload` (exclui `merge_source: lifecycle`)
- Projeção de ciclos futuros via `buildFutureCycles` (4 meses no calendário, 12 na tabela de próximos ciclos)

## Eventos por ciclo

Para cada ciclo histórico:

1. **Geração** — `computeRecurringGenerationDateYmd(due, daysBeforeDue)`
2. **Vencimento** — `due_date` da fatura/ciclo
3. **Pago** — quando `operational_state === paid` ou `invoice_status === paid`

## Legenda visual

| Símbolo | Tipo | Condição |
|---------|------|----------|
| ✔ | Pago | Fatura paga |
| ● | Gerado | Fatura emitida, pagamento pendente |
| ○ | Futuro | Ciclo projetado ou aguardando geração |
| ⚠ | Atrasado | Falha operacional ou vencimento passado sem pagamento |
| ✖ | Cancelado | Ciclo cancelado/ignorado |
| ↻ | Reprocessado | `has_auto_retry === true` |

## Interação

Clique num evento abre diálogo com:

- Competência
- Valor
- Vencimento
- Status
- Gateway
- Botão **Abrir fatura** (quando `invoice_id` presente)

## Responsividade

- Desktop: grelha 2–3 colunas por mês
- Mobile: scroll horizontal (`snap-x`) com meses empilhados lateralmente

## Funções de suporte

- `buildCalendarMonths`
- `buildCalendarEventFromTimelineRow`
- `mapOperationalStateToVisual`
- `calendarLegend`
