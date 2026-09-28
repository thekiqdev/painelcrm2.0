# Billing UI Guidelines — Sprint 4.0C

## Linguagem

### Usar

- Cobrança, fatura, vencimento, geração, pagamento, assinatura, cliente
- Situação (em vez de "Status do Worker")
- Mensagens em português claro e orientadas à ação

### Evitar na UI principal

- Worker, Job, Retry, Billing Engine, Billing Plan, Execution Orchestrator, Context Builder, Cycle Key (exceto no accordion técnico)

## Hierarquia da página

1. Header — identidade e próxima cobrança
2. Cards de resumo — leitura rápida (6 métricas)
3. Coluna principal — calendário → timeline → histórico → próximos ciclos → configurações (recolhido)
4. Coluna lateral — resumo financeiro → situação → ações → renovação manual
5. Mobile — FAB de ações (`SubscriptionActionsPanel variant="fab"`)

## Estados visuais (`BillingVisualState`)

| Estado | Label |
|--------|-------|
| preparing | Preparando cobrança |
| generating | Gerando cobrança |
| sending_gateway | Enviando ao gateway |
| payment_pending | Pagamento pendente |
| payment_confirmed | Pagamento confirmado |
| error | Erro |
| cancelled | Cancelada |
| paused | Pausada |
| scheduled | Cobrança agendada |

## Erros

- Mensagem principal amigável (`friendlyBillingMessage`)
- Botões: **Gerar novamente** (scroll para painel de renovação) e **Ver detalhes técnicos**
- Stacktrace e metadados de job apenas no accordion recolhido

## Datas

- Sempre `YYYY-MM-DD` ou ISO8601 via `billingSafeDate` / `normalizeYmdInput`
- Nunca `Date.toString()` em payloads ou queries
- Formatação BR apenas na apresentação (`formatYmdBrSafe`)

## Cores e componentes

- Reutilizar tokens shadcn existentes (`Card`, `Badge`, `Table`)
- Badge de status da assinatura: verde CRM para ativa, âmbar para pausada
- Situação com erro: borda `destructive/30` e fundo suave

## Ações agrupadas

| Grupo | Ações |
|-------|-------|
| Cobrança | Gerar próxima, Alterar próxima |
| Assinatura | Editar, Upgrade, Downgrade, Pausar/Retomar/Reativar, Cancelar |
| Avançado | Reprocessar, Logs, Diagnóstico, Faturas |
