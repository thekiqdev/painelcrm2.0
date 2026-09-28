# Billing Visual Language — Sprint 4.0D

## Objetivo

Compreensão em **menos de 5 segundos**: quanto recebo, quando recebo, se pagou, se há problema.

## Hierarquia tipográfica

| Nível | Uso | Classe típica |
|-------|-----|----------------|
| Hero | Próxima cobrança, health score | `text-3xl`–`text-5xl` bold |
| Título | Nome do plano | `text-2xl`–`text-3xl` semibold |
| KPI valor | Cards de resumo | `text-2xl` bold tabular-nums |
| Corpo | Labels, tabelas | `text-sm` |
| Meta | Descrições, legendas | `text-xs` / `text-[10px]` muted |

## Cor — uso restrito

- **Verde (`emerald`)**: saudável, tendência positiva, receita no gráfico
- **Âmbar**: atenção, faturas em aberto, health 50–74
- **Vermelho**: erro, atrasos no gráfico, tendência negativa
- **CRM primary**: hoje no calendário, marcos da timeline futura
- **Muted**: maior parte do chrome — bordas, fundos, texto secundário

## Ícones de evento (timeline)

| Ícone | Significado |
|-------|-------------|
| 💰 | Pagamento |
| 🧾 | Cobrança / fatura |
| 🔁 | Lifecycle |
| ✓ | Criação / marco |
| ○ | Agendado |

## Calendário — símbolos

| Símbolo | Significado |
|---------|-------------|
| ✔ | Pago |
| ● | Gerado |
| ○ | Futuro / próxima |
| ⚠ | Atraso |
| ✖ | Cancelada |
| ↻ | Reprocessada |

## Health score — labels

| Score | Label |
|-------|-------|
| 90–100 | Excelente |
| 75–89 | Boa |
| 50–74 | Atenção |
| 0–49 | Crítica |

## Motion

- Transições: `duration-200 ease-out`
- Expand timeline: `animate-in fade-in`
- Sem animações contínuas ou distrações

## Densidade

- Desktop: sidebar sticky, 3 colunas (2+1)
- Tablet/Mobile: coluna única, calendário full-width, FAB
