# Fase 4 — Outbound de notificacao por tenant (`dispatch_not_before`)

## Migration

Ficheiro: `database/init/138_notification_outbound_dispatch_not_before.sql`

- Coluna nova em `notification_outbound_deliveries`: `dispatch_not_before TIMESTAMPTZ NULL`
- `NULL` = primeira entrega elegivel de imediato (compativel com linhas anteriores e com eventos nao agendados)
- Indice parcial para polling de entregas agendadas
- `next_retry_at` mantem-se apenas para reagendamento apos falha (semantica inalterada)

## Semantica de `dispatch_not_before`

| Valor | Significado |
|--------|-------------|
| `NULL` | Enviar quando o fluxo decidir processar, sem janela inicial (due now no orquestrador / worker) |
| `TIMESTAMPTZ` | Nao enviar antes deste instante (primeira tentativa e retries respeitam `<= now()` em conjunto com `next_retry_at`) |

## Orquestrador (`notificationEngineOrchestrator.ts`)

- Apos render bem-sucedido, calcula-se `dispatch_not_before` para eventos cobertos (ver abaixo).
- A entrega e sempre criada com `insertDelivery`, incluindo `dispatch_not_before` quando aplicavel.
- Se `dispatch_not_before > now()`, o orquestrador **nao** envia WhatsApp na mesma execucao: devolve sucesso com `status: queued` e regista log `outbound_first_dispatch_deferred`.
- Caso contrario, mantem-se o fluxo existente (processamento imediato, flags de envio, retry transitorio, etc.).
- Metadados JSON incluem `outbound_dispatch_not_before` quando o instante nao e nulo.

## Calculo do agendamento (`notificationTenantOutboundDispatchSchedule.ts`)

Usa `getTenantBillingPreferences` + `resolveTenantBillingPreferences` (helper central da Fase 1).

### Eventos cobertos nesta fase

Apenas notificacoes transacionais de fatura cliente:

- `invoice.created`
- `invoice.paid`

**Fora deste escopo (permanecem imediatas no orquestrador, `dispatch_not_before` NULL):**

- `invoice.due_soon`, `invoice.overdue` (digest)
- propostas, contratos e restantes eventos transacionais

### Regra de produto

1. **`invoice_notify_same_as_generation = true` (efetivo)**  
   - `dispatch_not_before` gravado como `NULL`  
   - Envio continua no mesmo pedido do orquestrador (due imediato), sem esperar o worker.

2. **`invoice_notify_same_as_generation = false`**  
   - Usa-se o dia local do tenant correspondente a `event_occurred_at` (data do evento no fuso efetivo) e o horario `invoice_notify_time_local` efetivo.  
   - Converte-se para UTC (`utcInstantForLocalWallClock`) e define-se `dispatch_not_before`.  
   - **Se esse instante ja passou** no momento da publicacao: usa-se `new Date()` (envio o mais cedo possivel — politica: nao adiar para o dia seguinte).

## Worker (`notificationOutboundRetryWorker.ts` + repositorio)

- `listDeliveriesDueForRetry` passou a listar entregas `queued` em que:
  - `(dispatch_not_before IS NULL OR dispatch_not_before <= now())`
  - e (`next_retry_at IS NULL` **ou** `next_retry_at <= now()`)
- Ordenacao: `COALESCE(next_retry_at, dispatch_not_before, created_at)` ASC.
- `redispatchOne` valida novamente `dispatch_not_before` antes de enviar (`outbound_worker_skip_not_yet_due`).
- Log adicional: `outbound_worker_dispatch_start` (tenant, evento, retry_count).

O intervalo em `index.ts` continua a usar `getNotificationsEngineOutboundRetryPollMs()` — o mesmo timer cobre primeira entrega agendada e retries.

## Idempotencia e duplicacao

- `ON CONFLICT (tenant_id, idempotency_key) DO NOTHING` inalterado.
- Uma unica linha de entrega por ciclo idempotente; `dispatch_not_before` nao duplica envios.
- Retries continuam a usar `next_retry_at` sem sobrescrever a semantica da primeira janela.

## Observabilidade

Logs principais:

- `outbound_first_dispatch_deferred` — agendamento futuro (horario separado)
- `outbound_worker_skip_not_yet_due` — protecao extra no worker
- `outbound_worker_dispatch_start` — inicio de envio no worker
- Metadados: `outbound_dispatch_not_before`

## Riscos remanescentes

- Ordem de deploy: aplicar migration antes do backend novo (INSERT referencia coluna).
- Lista de trabalho do worker inclui todas as entregas `queued` com `next_retry_at` NULL e janela vencida — maior volume que o poll apenas de retry; ajustar `NOTIFICATIONS_ENGINE_OUTBOUND_RETRY_POLL_MS` / batch se necessario.
- Conversao fuso/horario de verao: funcao de conversao inclui varredura de seguranca; casos extremos de DST ambigua sao raros.

## Fase 5 (sugestao)

- Hardening operacional (metricas, alertas, FOR UPDATE SKIP LOCKED se multi-instancia)
- Alargar agendamento a mais eventos ou digests, se desejado
- Afinar politica quando horario separado ja passou (ex. opcao “sempre proximo dia util”)
