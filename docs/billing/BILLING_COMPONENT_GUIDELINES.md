# Billing Component Guidelines — Sprint 4.0D

## Quando criar componente em `experience/`

- Apresenta dados já disponíveis no payload `CrmSubscriptionDetailPayload`
- Não chama APIs novas
- Pode ser testado via funções puras em `*Polish.ts` ou `*Experience.ts`

## Padrões por componente

### Header (`SubscriptionExperienceHeader`)

- Avatar com iniciais do cliente
- Valor no formato `R$ X / semana|mês`
- Próxima cobrança: `formatNextChargePremium` → `14 JUL`

### KPI (`SubscriptionSummaryCards`)

- Ícone lucide discreto (muted)
- Comparação só quando há dado do mês anterior
- Cores de acento apenas em positivo/negativo/warning

### Calendário (`SubscriptionFinancialCalendar`)

- Navegação: `shiftMonthKey`
- Popover (não dialog) para detalhe do dia
- `aria-label` por célula via `calendarDayAriaLabel`

### Timeline (`SubscriptionBusinessTimeline`)

- Agrupar com `groupSmartTimeline`
- Expandir só quando `count > 1`

### Histórico (`SubscriptionFinancialHistory`)

- Filtros como tabs (`role="tablist"`)
- Busca client-side em competência, invoice, valor
- Ordenação via `filterAndSortHistory`

### Situação (`SubscriptionSituationCard`)

- **Nunca** renderizar stacktrace
- Detalhes técnicos recolhidos: worker, retry, job id, cycle key
- Botão primário: “Resolver agora” → scroll para renovação

### Sidebar (`SubscriptionFinancialSummaryPanel`)

- Health score como `role="meter"`
- Gráfico com altura fixa 140–160px

## Empty states

Usar `SubscriptionExperienceEmptyState` com `kind` adequado — não duplicar copy inline.

## Skeleton

Usar `SubscriptionExperienceSkeleton` na página inteira durante `loading` — não spinners isolados.
