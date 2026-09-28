# Fase 0 — Observabilidade da recorrência por tenant

## Objetivo da fase

Adicionar observabilidade de **timezone + janela local** em scheduler/worker sem alterar comportamento real da recorrência.

## O que foi implementado

## 1) Helper de diagnóstico (reutilizável)

Arquivo:

- `packages/backend/src/services/billingTimeWindowObservability.ts`

Responsabilidade:

- resolver timezone efetiva (`tenant` ou fallback);
- validar timezone IANA;
- calcular `local_now_ymd` e `local_now_hhmm` do tenant;
- aplicar **simulação diagnóstica** da janela futura:
  - horário padrão fase 0: `09:00`;
  - elegível se `next_billing_date < local_date` ou (`==` e `local_time >= 09:00`);
- retornar estrutura pronta para log.

Importante:

- `phase = observability_only_phase0`;
- não muda enqueue/processamento.

## 2) Scheduler com contexto de janela local

Arquivo:

- `packages/backend/src/services/recurringBillingJobService.ts`

Mudanças:

- `enqueueRenewalJobs()` agora faz `LEFT JOIN tenants` para ler `timezone` (apenas observabilidade).
- Para cada assinatura candidata, calcula diagnóstico via helper.
- Logs novos:
  - `time_window_diagnostic_subscription` (detalhado, controlado por flag).
  - métricas agregadas em `enqueue_done`:
    - `diagnostic_eligible_by_window`
    - `diagnostic_too_early_local_time`
    - `diagnostic_future_local_date`
    - `diagnostic_fallback_timezone_used`
    - `phase=observability_only_phase0`

## 3) Worker com contexto de janela local

Arquivo:

- `packages/backend/src/services/recurringBillingJobService.ts`

Mudanças:

- `processNextBatch()` agora consulta `tenants.timezone` por `job.tenant_id` (apenas observabilidade).
- Para cada job, calcula diagnóstico da janela e registra log:
  - `time_window_diagnostic_job`
  - campos essenciais sempre;
  - campos detalhados quando `BILLING_TIME_WINDOW_VERBOSE=true`.

## 4) Flag de verbosidade

Arquivos:

- `packages/backend/src/config/billingEnv.ts`
- `env.example`

Adicionado:

- `isBillingTimeWindowVerbose()` lendo `BILLING_TIME_WINDOW_VERBOSE`.
- comentário/documentação em `.env` de exemplo.

## Campos de log (fase 0)

Essenciais:

- `tenant_id`
- `subscription_id` / `jobId`
- `next_billing_date`
- `timezone_effective`
- `timezone_source` (`tenant` ou `fallback_default`)
- `fallback_applied`
- `would_be_eligible_by_window`
- `window_reason`
- `phase=observability_only_phase0`
- `note` deixando explícito “behavior unchanged”

Detalhados (quando verbose):

- `tenant_timezone` (raw)
- `timezone_valid`
- `local_now_ymd`
- `local_now_hhmm`
- `generate_time_local_effective` (default fase 0 = `09:00`)
- `generate_time_source=default_phase0`

## Fallbacks usados nesta fase

- Timezone fallback: `America/Sao_Paulo`.
- Horário de geração fallback (somente simulação): `09:00`.

Ambos são diagnósticos nesta fase e aparecem explicitamente nos logs.

## O que **não** muda nesta fase

- não há migração/novos campos persistidos de horário por tenant;
- não há endpoint GET/PUT de preferências;
- scheduler não muda critério real de enqueue;
- worker não bloqueia nem requeue por janela local;
- `next_billing_date` permanece a regra real;
- sem alteração em notificações/gateway/link público.

## Como interpretar os logs

- `would_be_eligible_by_window=false` + `window_reason=too_early_local_time`
  - indica que, na fase futura, aquela assinatura aguardaria o horário local configurado.
- `fallback_applied=true`
  - tenant sem timezone válida/definida; diagnóstico usou fallback.
- `diagnostic_*` no `enqueue_done`
  - visão agregada do impacto esperado da futura janela, sem alterar produção.

## Preparação para Fase 1

Com os logs desta fase, é possível validar:

- distribuição por timezone;
- quantas assinaturas cairiam fora da janela no horário atual;
- tenants com timezone ausente/inválida;
- impacto operacional antes de persistir preferências e ativar filtro real.

