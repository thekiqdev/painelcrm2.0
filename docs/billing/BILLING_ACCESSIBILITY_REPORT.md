# Billing Accessibility Report — Sprint 4.0D

## WCAG — contraste

- Pares de cor definidos em `wcagContrastPair` por estado de saúde
- Texto principal sobre `bg-card` / `bg-muted` usa tokens do design system (shadcn)
- Indicadores de status não dependem só de cor: emoji + texto (“Saudável”, “Erro”)

## ARIA

| Elemento | Atributo |
|----------|----------|
| Header | `aria-label="Resumo da assinatura"` |
| KPIs | `role="region"` + `aria-label` |
| Calendário | `role="grid"`, células com `aria-label` dinâmico |
| Health score | `role="meter"`, `aria-valuenow/min/max` |
| Situação | `role="status"`, `aria-live="polite"` |
| Filtros histórico | `role="tablist"`, tabs com `aria-selected` |
| Skeleton | `aria-busy="true"` |
| Gráfico vazio | `role="img"` + descrição |

## Teclado

- `focusRingClass()` em botões interativos do calendário, filtros e accordions
- Popover Radix: Escape fecha, foco preso no conteúdo
- Collapsible: trigger é `<button>` nativo

## Leitor de tela

- Dias do calendário anunciam quantidade e tipo de eventos
- Health score anuncia valor numérico e label (“92 de 100”)
- Empty states com título + descrição semânticos (`<h3>` + parágrafo)

## O que foi evitado

- Stacktrace na UI (barreira para leitores e utilizadores)
- Informação transmitida apenas por cor nos KPIs (sempre há label textual)
- `Date.toString()` em qualquer superfície visível ou API

## Testes

61 testes em `billingSubscriptionExperiencePolish.test.ts` incluem secção **acessibilidade e UI** (`focusRingClass`, `keyboardNavOrder`, `wcagContrastPair`, `calendarDayAriaLabel`).

## Melhorias futuras (fora do escopo)

- Skip links para secções principais
- Anúncio live region ao mudar mês no calendário
- Testes e2e com axe-core
