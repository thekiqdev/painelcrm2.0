# Runbook — Janela horária de faturamento + WhatsApp invoice.created

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-01 |
| **Plano** | [`PLAN_BILLING_WINDOW_AND_WHATSAPP_INVALID_TOKEN.md`](./PLAN_BILLING_WINDOW_AND_WHATSAPP_INVALID_TOKEN.md) |
| **Sprints** | 0–4 (onda fechada em código; validação prod = checklist abaixo) |

---

## 1. Regra de produto (SSOT)

Para renovação CRM automática:

```text
local_ymd < generation_date_ymd     → future_local_date (não gera)
local_ymd >= generation_date_ymd
  AND local_hhmm < H                → too_early_local_time (requeue; NÃO cancela)
local_ymd >= generation_date_ymd
  AND local_hhmm >= H               → eligible_by_window (gera 1× por ciclo)
```

- `H` = `tenants.recurring_generate_time_local` (default `09:00`) no timezone efetivo (`America/Sao_Paulo` se inválido/ausente).
- `generation_date_ymd` = vencimento do ciclo − dias de antecipação (cap por periodicidade).
- **Catch-up (D+1, atraso, N>0 já passado):** também exige H — **não** libera às 00:01.

Notificação `invoice.created`:

- `same_as_generation` → alinhada a H (imediato se já ≥ H; senão `dispatch_not_before`).
- Notify separado → `dispatch_not_before` no horário de notify no mesmo dia local do evento.

---

## 2. Caso golden — catch-up só após H

| Passo | Condição | Esperado |
|-------|----------|----------|
| G1 | `generation_date` = D, H = 09:00, agora = D+1 **00:01** local | Job **não** completa fatura; `too_early_local_time` / requeue |
| G2 | Mesmo ciclo, agora = D+1 **09:00** local | Fatura criada **1×**; `cycle_key` estável |
| G3 | `same_as_generation=true` | Delivery WhatsApp no instante da criação (ou deferred se somehow antes de H) |
| G4 | Token Uaz inválido na 1ª tentativa | Delivery `queued` + `next_retry_at` (não `failed` definitivo na 1ª) |
| G5 | Reconnect UI + retry/manual | `sent` |

Testes automatizados que cobrem G1/G2: `billingTimeWindowObservability.test.ts` (Sprint 1).  
Schedule G3: `notificationTenantOutboundDispatchSchedule.test.ts` (Sprint 2).  
Classifier G4: `whatsappDispatchErrorClassifier.test.ts` (Sprint 3).

---

## 3. Flags / logs operacionais

| Flag / log | Uso |
|------------|-----|
| `BILLING_TIME_WINDOW_VERBOSE=true` | Scheduler/worker: `local_now_ymd`, `local_now_hhmm`, `window_reason` |
| `[notifications-engine] outbound_dispatch_schedule` | Sempre-on: H, timezone, `dispatch_not_before`, `schedule_source` |
| `[notifications-engine] whatsapp_dispatch_failed` | Falha WA + `chat_instance_id` + class |
| `[notifications-engine] send_transient_retry_scheduled` | Retry agendado (Invalid token etc.) |
| `[chat_instance_health]` | Self-heal `disconnected` (não recria token) |

---

## 4. Queries de observabilidade (leitura)

### 4.1 Preferências do tenant

```sql
SELECT id, timezone,
       recurring_generate_time_local,
       invoice_notify_same_as_generation,
       invoice_notify_time_local,
       recurring_invoice_generate_days_before_due
FROM tenants
WHERE id = '<tenant_id>';
```

### 4.2 Faturas criadas por hora local (BRT) — caçar pico ~00:01

```sql
SELECT to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'HH24') AS hour_brt,
       count(*)::int AS n
FROM customer_invoices
WHERE created_at > now() - interval '14 days'
GROUP BY 1
ORDER BY 1;
```

### 4.3 Deliveries `invoice.created` — status / erro (14 dias)

```sql
SELECT status,
       left(coalesce(error_message, ''), 60) AS err,
       count(*)::int AS n
FROM notification_outbound_deliveries
WHERE event_key = 'invoice.created'
  AND created_at > now() - interval '14 days'
GROUP BY 1, 2
ORDER BY n DESC;
```

### 4.4 Invalid token — ainda falha definitiva prematura?

```sql
-- Esperado pós-S3: várias tentativas failed_transient / queued com next_retry_at
-- antes de failed final (após max_attempts)
SELECT d.id, d.status, d.error_message, d.retry_count,
       d.next_retry_at, d.dispatch_not_before, d.created_at, d.updated_at
FROM notification_outbound_deliveries d
WHERE d.event_key = 'invoice.created'
  AND d.error_message ILIKE '%invalid token%'
  AND d.created_at > now() - interval '14 days'
ORDER BY d.created_at DESC
LIMIT 50;
```

### 4.5 Jobs em requeue de janela

```sql
SELECT status, count(*)::int AS n
FROM billing_recurring_jobs
GROUP BY 1;

SELECT id, tenant_id, subscription_id, cycle_key, status, retry_at, scheduled_at, updated_at
FROM billing_recurring_jobs
WHERE status = 'pending'
  AND retry_at IS NOT NULL
  AND retry_at > now()
ORDER BY retry_at
LIMIT 50;
```

### 4.6 Self-heal WhatsApp

```sql
SELECT id, user_id, status, updated_at,
       metadata->>'invalidTokenDetectedAt' AS healed_at,
       metadata->>'invalidTokenSource' AS source,
       left(instance_token, 8) AS token_prefix
FROM chat_instances
WHERE metadata ? 'invalidTokenDetected'
ORDER BY updated_at DESC
LIMIT 50;
```

---

## 5. Checklist pós-deploy (produção / staging)

- [ ] Ligar `BILLING_TIME_WINDOW_VERBOSE=true` por curto período; confirmar `too_early_local_time` antes de H e `eligible_by_window` após H.
- [ ] Query 4.2: sem pico anormal em `00`/`01` para tenants com H ≠ 00:00.
- [ ] Tenant com `days_before > 0`: catch-up após H gera 1 fatura.
- [ ] Query 4.4: 1ª falha Invalid token → `queued` + retry (não `failed` imediato).
- [ ] Reenvio manual na fatura após reconnect WhatsApp → `sent`.

---

## 6. Rollback mental (se necessário)

| Mudança | Reverter |
|---------|----------|
| Janela S1 | Restaurar checagem de H só quando `local_ymd === generation_date_ymd` |
| Schedule S2 | `same_as_generation` voltar a `return null` sempre |
| Classifier S3 | `invalid`+`token` / 401/403 → `definitive` |

Preferir rollback pontual da camada com incidente; janela S1 é a de maior impacto financeiro positivo (evita 00:01).
