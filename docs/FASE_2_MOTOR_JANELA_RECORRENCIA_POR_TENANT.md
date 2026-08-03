# Fase 2 - Motor de janela local por tenant

## Objetivo da fase

Ativar a regra real de janela local no motor de recorrencia para que a geracao de invoices respeite:

- `generation_date_ymd <= hoje local do tenant` (vencimento do ciclo − dias de antecipacao)
- e, em **qualquer** dia elegivel (`local_ymd >= generation_date_ymd`), somente apos `recurring_generate_time_local`

> **Atualizacao 2026-08-01 (Sprint 1 — [`PLAN_BILLING_WINDOW_AND_WHATSAPP_INVALID_TOKEN.md`](./billing/PLAN_BILLING_WINDOW_AND_WHATSAPP_INVALID_TOKEN.md)):**  
> Antes, o horario H so era exigido no **dia de geracao**; em dias posteriores (catch-up) o ciclo ficava elegivel desde 00:01.  
> **Regra de produto atual:** sempre `local_hhmm >= H` quando `local_ymd >= generation_date_ymd`.

Sem alterar a UI de preferencias nesta fase original; notificacao alinhada foi tratada na Sprint 2 do plano acima.

## Regra final de elegibilidade implementada

A assinatura/job e considerada elegivel quando:

1. `local_now_ymd >= generation_date_ymd` **e**
2. `local_now_hhmm >= recurring_generate_time_local_effective`

Caso contrario:

- `future_local_date`: ainda nao chegou o dia local de geracao
- `too_early_local_time`: dia de geracao (ou catch-up) ja chegou, mas ainda nao chegou a hora local configurada

O timezone e horario usados sao resolvidos pelo helper central (`resolveTenantBillingPreferences`), com fallback explicito e rastreavel.

Helper: `buildBillingWindowDiagnostic` em `packages/backend/src/services/billingTimeWindowObservability.ts`.

## Scheduler (`enqueueRenewalJobs`)

O scheduler continua rodando com alta frequencia, mas agora:

- calcula a janela local efetiva por assinatura
- **nao enfileira** assinaturas fora da janela local
- registra decisao real de skip por janela (`time_window_scheduler_skip_outside_window`)
- registra elegibilidade em modo verbose (`time_window_scheduler_eligible`)

Assim, o enqueue deixa de depender apenas de `CURRENT_DATE` do banco como criterio final.

## Worker (`processNextBatch`)

O worker agora revalida a mesma regra de janela local antes de gerar invoice:

- se elegivel, segue fluxo normal
- se fora da janela, **nao gera invoice** e faz requeue com `retry_at`

Evento de log da revalidacao: `time_window_worker_check`  
Evento de requeue por janela: `time_window_worker_requeued_outside_window`

## Regra de requeue adotada

Quando o job esta fora da janela local, ele e reagendado para:

- `retry_at = now() + 15 minutos`

Comportamento:

- status volta para `pending`
- lock e limpo (`locked_at`, `locked_by`)
- job nao falha e nao e cancelado por estar cedo

Essa estrategia evita loop agressivo, preserva simplicidade operacional e garante nova tentativa proxima ao horario alvo local.

> Nota: alinhamento de `retry_at` ao proximo instante local H (S1.1) permanece opcional / follow-up.

## Idempotencia

As garantias existentes foram preservadas:

- `cycle_key` continua evitando duplicidade por ciclo
- validacoes de invoice existente por assinatura/periodo permanecem ativas
- jobs completados continuam finalizados como `completed`
- requeue por janela reutiliza o mesmo job (sem criar job duplicado)

Resultado: nao ha geracao dupla da mesma cobranca por causa da janela local.

## Jobs pendentes antigos (pre-Fase 2)

Nao foi necessaria limpeza manual.

Com a Fase 2:

- jobs `pending` antigos passam naturalmente pela revalidacao do worker
- se estiverem cedo, recebem `retry_at` e aguardam janela
- quando a janela abre, seguem processamento normal

Ou seja, a adaptacao e implicita e retrocompativel.

## O que nao muda nesta fase (historico)

Na Fase 2 original ficaram fora de escopo:

- UI em Configuracoes > Faturas (ja existia / evoluiu a parte)
- agendamento separado de notificacao — coberto depois (Sprint 2 do plano de janela + WhatsApp)
- uso de `invoice_notify_*` no motor outbound — coberto na Sprint 2

## Como validar

- Unitarios: `billingTimeWindowObservability.test.ts`
- Ops: [`docs/billing/RUNBOOK_BILLING_WINDOW_AND_WHATSAPP.md`](./billing/RUNBOOK_BILLING_WINDOW_AND_WHATSAPP.md)
- Verbose: `BILLING_TIME_WINDOW_VERBOSE=true`
