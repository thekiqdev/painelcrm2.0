# Billing UI System Report — Sprint 4.0D

## Camadas

```
SubscriptionDetail (página)
  └── experience/ (componentes de apresentação)
        └── billingSubscriptionExperiencePolish.ts (derivados visuais)
        └── billingSubscriptionExperience.ts (derivados de negócio UI)
              └── crmSubscriptionsService.getById (API existente)
```

## Seções da página (ordem de leitura)

1. **Header** — identidade + próxima cobrança em 5s
2. **KPIs** — 6 indicadores em grelha responsiva
3. **Main column** — calendário → timeline → histórico → previsão → configurações (recolhido)
4. **Sidebar** — saúde → resumo → gráfico → situação → ações → renovação
5. **FAB** — ações em mobile

## Estados de carregamento

| Estado | Componente |
|--------|------------|
| Loading | `SubscriptionExperienceSkeleton` |
| Vazio (por secção) | `SubscriptionExperienceEmptyState` |
| Dados | Componentes premium |

## Tokens visuais

- Bordas: `rounded-2xl` no header, `rounded-lg` em células
- Destaque: `text-crm-primary`, `bg-crm-primary/5`
- Saúde: emerald (saudável), amber (atenção), red (erro)
- Tipografia: valores `text-2xl`/`text-5xl` tabular-nums

## Memoização

- `useMemo` em todos os derivados pesados nos componentes
- `memoizeDetailKey` para chaves de cache futuro

## Sem novas dependências

Recharts já presente no projeto (dashboard). Popover, Avatar, Skeleton do shadcn/ui.
