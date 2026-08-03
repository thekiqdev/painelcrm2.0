# Plano — Janela horária de faturamento + WhatsApp `Invalid token.`

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-01 |
| **Tipo** | Plano de implementação (sprints sequenciais) |
| **Escopo** | Recorrência CRM (`billing_recurring_jobs` + janela local) + notificação `invoice.created` (WhatsApp / UazAPI) |
| **Fora de escopo (nesta onda)** | Auto-recriar instância UazAPI no worker; Billing SaaS plataforma (`tenant_billing` / platform WhatsApp) — salvo menção cruzada |
| **Pré-requisito / contexto** | Investigação 2026-07-29: falha automática `Invalid token.` ~00:01; decisão de produto: criação e envio no horário de `/settings/billing` |
| **Audits relacionados** | [`AUDIT_WHATSAPP_RECURRING_INVOICE_NOTIFICATION.md`](../architecture/chat/AUDIT_WHATSAPP_RECURRING_INVOICE_NOTIFICATION.md) · [`AUDIT_UAZAPI_INVALID_TOKEN_SOURCE.md`](../architecture/billing/AUDIT_UAZAPI_INVALID_TOKEN_SOURCE.md) · [`FASE_2_MOTOR_JANELA_RECORRENCIA_POR_TENANT.md`](../FASE_2_MOTOR_JANELA_RECORRENCIA_POR_TENANT.md) |
| **Status** | Onda S0–S4 ✅ em código — validação prod via [runbook](./RUNBOOK_BILLING_WINDOW_AND_WHATSAPP.md) |

---

## 1. Resumo executivo

Dois problemas ligados no tempo, mas com causas distintas:

| # | Sintoma | Causa no código |
|---|---------|-----------------|
| **A** | Notificação automática WhatsApp falha com `Invalid token.` | UazAPI rejeita `chat_instances.instance_token`; self-heal marca `disconnected`; classifier trata como **definitive** (sem retry útil). Manual funciona após reconnect/UI (mesmo pipeline, token/espelho corrigidos). |
| **B** | Falha / geração observada ~**00:01** | Em `buildBillingWindowDiagnostic`, o horário de `/settings/billing` só é exigido no **dia de geração**. Em dias **posteriores** (catch-up / atraso / N dias de antecipação já passados), o ciclo fica elegível **o dia inteiro**, inclusive à meia-noite. |

**Decisão de produto:** criação da fatura e envio devem respeitar o horário configurado na instância (`tenants.recurring_generate_time_local` / preferências em `/settings/billing`).

**Resposta explícita (não negociável):** respeitar o horário **não para** a geração de faturas futuras. Só atrasa catch-ups da meia-noite até o relógio configurado no mesmo dia civil local. Job fora da janela → `requeue` (`retry_at`), **nunca** cancelamento do ciclo por “estar cedo”.

---

## 2. Garantia de continuidade da geração

### 2.1 O que muda vs o que não muda

| Cenário | Hoje | Depois do fix de janela (Sprint 1) |
|---------|------|-------------------------------------|
| Dia de geração + após horário H | Gera | Gera (**igual**) |
| Dia de geração + antes de H | Espera (requeue 15 min) | Espera (**igual**) |
| Dia **depois** do dia de geração às **00:01** | Gera à meia-noite | Espera até H **nesse** dia, depois gera |
| Após H no dia de catch-up | Gera | Gera |
| Idempotência `cycle_key` / invoice existente | Sem duplicata | Sem duplicata (**igual**) |
| Scheduler / worker em loop | Continuam | Continuam |

### 2.2 Diagrama

```text
Assinatura active + generation_date atingida
        │
        ├─ local_ymd < generation_date     → futuro (não enfileira / requeue)
        ├─ local_ymd >= generation_date
        │       └─ local_hhmm < H          → too_early (requeue; NÃO cancela)
        └─ local_ymd >= generation_date
                └─ local_hhmm >= H         → elegível → gera fatura (1× por ciclo)
```

**Único atraso introduzido:** no máximo até o próximo `H:mm` local do tenant (tipicamente horas, não “fica preso para sempre”).

---

## 3. Estado atual relevante (código)

| Área | Arquivo / função | Nota |
|------|------------------|------|
| Janela | `billingTimeWindowObservability.ts` → `buildBillingWindowDiagnostic` | Hora só no `local.ymd === generation_date_ymd` |
| Scheduler / worker | `recurringBillingJobService.ts` | Mesma janela; requeue `+15 min` |
| Preferências | `tenantBillingPreferencesService.ts` + UI `BillingSection.tsx` | Default H=`09:00`, tz=`America/Sao_Paulo`, notify same-as-generation |
| Dispatch schedule | `notificationTenantOutboundDispatchSchedule.ts` | Se `same_as_generation` → `dispatch_not_before = null` (envio na criação) |
| WhatsApp send | `whatsappChannelDispatcher.ts` | Preflight refresh Uaz; Invalid token → self-heal |
| Classifier | `whatsappDispatchErrorClassifier.ts` | `invalid`+`token` / 401/403 → **definitive** |
| Self-heal | `chatInstanceInvalidTokenSelfHeal.ts` | `status=disconnected` + metadata; **não** recria token |

---

## 4. Decisões de produto (fechadas nesta onda)

| ID | Decisão |
|----|---------|
| **D1** | Em qualquer dia com `local_ymd >= generation_date_ymd`, exigir `local_hhmm >= recurring_generate_time_local_effective`. |
| **D2** | Fora da janela → apenas requeue; **proibido** cancelar/completar job só por estar cedo. |
| **D3** | Com `invoice_notify_same_as_generation=true`, o horário de envio segue a criação (Sprint 1 já alinha o sintoma 00:01 no notify). Horário de notify separado continua via `dispatch_not_before` (Sprint 2). |
| **D4** | Worker **não** auto-executa `connectInstance` / recriação de token UazAPI na primeira versão (Sprint 3). Sync + retry transient + falha clara. |
| **D5** | Execução **uma sprint por vez**, com gate de QA antes da seguinte. |

---

## 5. Princípios de implementação

1. Geração nunca é cancelada por “cedo” — só `pending` + `retry_at`.
2. Mesma regra no scheduler e no worker (um único helper).
3. Mudanças cobertas por testes unitários da janela **antes** de deploy.
4. Deploy incremental; sem big-bang token + janela no mesmo PR se o risco operacional for alto (preferência: S1 → S2 → S3).
5. Sem alterar git config / migrations desnecessárias só para janela (é lógica pura + testes).

---

## 6. Sprints

### Sprint 0 — Baseline e rede de segurança

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Concluída (2026-08-01) |
| **Esforço** | 0,5–1 dia |
| **Objetivo** | Medir antes de mudar; provar depois que “não parou de gerar” |
| **Ambiente medido** | Postgres local (`localhost:5433`, DB `painelcrm`) — **não** é produção; repetir queries em prod antes do deploy S1 |

**Entregas**

- [x] Queries de baseline (leitura local) — resultados no **Anexo B**.
- [x] Confirmar `BILLING_TIME_WINDOW_VERBOSE` utilizável — ver **§0.1**.
- [x] Checklist de regressão escrito — ver **§0.2**.
- [x] Reprodução da regra atual em código (matriz 00:01) — ver **§0.3**.
- [x] **Sem** mudança de comportamento de geração / classifier / dispatcher.

#### 0.1 — `BILLING_TIME_WINDOW_VERBOSE`

| Item | Valor |
|------|-------|
| Helper | `packages/backend/src/config/billingEnv.ts` → `isBillingTimeWindowVerbose()` |
| Ativar | `BILLING_TIME_WINDOW_VERBOSE=true` no serviço **billing-scheduler** e/ou **billing-worker** (e API se útil) |
| Default | ausente / ≠ `true` → verbose **off** (menos ruído) |
| Efeito | **Não altera elegibilidade.** Acrescenta campos (`local_now_ymd`, `local_now_hhmm`, `generate_time_source`, …) em logs `time_window_scheduler_*` / `time_window_worker_*` |
| Estado no `.env` local | **não definido** — ok para baseline; ligar só quando for observar ticks |

#### 0.2 — Checklist de regressão (usar no gate S1+)

**Janela / geração**

- [ ] Tenant com H=09:00 (ou 14:00), tz `America/Sao_Paulo`, no **dia de geração**, antes de H → job `pending` com `retry_at`; **sem** nova fatura.
- [ ] Mesmo tenant, após H no dia de geração → fatura criada **1×** (`cycle_key` estável).
- [ ] Catch-up: `generation_date` no passado, agora **00:01** local com H≠00:00 → **não** gera (pós-S1); às H:00 do mesmo dia → gera.
- [ ] Tenant com `recurring_invoice_generate_days_before_due > 0` (ex.: 7) → primeiro dia respeita H; dias seguintes também respeitam H (pós-S1).
- [ ] Assinatura já com invoice do ciclo → worker **não** duplica.

**Notificação**

- [ ] `invoice_notify_same_as_generation=true` → delivery criada no instante da fatura (sem `dispatch_not_before` futuro).
- [ ] Reenvio manual na UI após WhatsApp conectado → `sent` (caminho atual).

**WhatsApp (baseline pré-S3)**

- [ ] Com instância `disconnected` / token inválido → delivery falha com `Invalid token.` ou “não conectada” (comportamento atual documentado).
- [ ] Após reconnect na UI → reenvio ok.

#### 0.3 — Matriz da regra **atual** (pré-S1) — bug 00:01 reproduzido

`H=09:00`, `generation_date=2026-07-25`, tz `America/Sao_Paulo` (mesma lógica de `buildBillingWindowDiagnostic`):

| Agora (local) | `would_be_eligible` hoje | Motivo |
|---------------|--------------------------|--------|
| 25/07 08:00 | **false** | `too_early_local_time` |
| 25/07 12:00 | **true** | `eligible_by_window` |
| **26/07 00:01** | **true** | catch-up sem checar H ← **bug** |
| 26/07 09:00 | **true** | elegível |

Teste unitário que **codifica** o comportamento atual (deverá **inverter** na S1):

`billingTimeWindowObservability.test.ts` — *“N=5: após primeiro dia de geração, qualquer horário no mesmo fuso”* (ex.: 22/05 08:00 com gen 20/05 → elegível hoje).

**Gate Sprint 0**

- [x] Baseline documentada (Anexo B + §0.1–0.3).
- [x] Sem mudança de comportamento de geração.
- [x] Pronto para Sprint 1.

---

### Sprint 1 — Janela horária em todos os dias elegíveis (P0)

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Concluída (2026-08-01) |
| **Esforço** | 1–2 dias |
| **Objetivo** | Eliminar geração/notificação automática ~00:01 quando H ≠ 00:00 |
| **Código** | `packages/backend/src/services/billingTimeWindowObservability.ts` |
| **Testes** | `billingTimeWindowObservability.test.ts` — **8 passed** |

**Mudança de regra** (`buildBillingWindowDiagnostic`):

```text
ANTES:
  local < generation_date                    → future_local_date
  local == generation_date && hhmm < H       → too_early_local_time
  senão                                      → eligible  ← catch-up às 00:01

DEPOIS (entregue):
  local < generation_date                    → future_local_date
  local >= generation_date && hhmm < H       → too_early_local_time
  local >= generation_date && hhmm >= H      → eligible
```

**O que NÃO mudou**

- Loops do scheduler/worker.
- Requeue por janela (status `pending`, lock limpo, `retry_at = now + 15 min`).
- Idempotência por ciclo.
- Valor default H=`09:00` / timezone fallback.
- S1.1 (`retry_at` alinhado a H) — **não** feito nesta sprint (opcional / follow-up).

**Testes obrigatórios**

- [x] Dia de geração, 08:59, H=09:00 → `too_early_local_time`.
- [x] Dia de geração, 09:00 → elegível.
- [x] Dia *depois* da geração, 00:01, H=09:00 → `too_early` (**regressão do bug**).
- [x] Dia *depois*, 09:00 → elegível (**prova que catch-up não morre**).
- [x] `days_before > 0`: primeiro dia respeita H; dias seguintes também respeitam H.
- [x] Timezone `America/Sao_Paulo` + fallback default.

**Gate Sprint 1**

- [x] Testes unitários verdes (8/8).
- [ ] Staging/prod: job atrasado só gera após H; job no dia gera após H (validação operacional — checklist §0.2).
- [x] Nenhuma alteração que cancele ciclo por janela (só `too_early` → requeue, como antes).

---

### Sprint 2 — Notificação alinhada à geração (P0)

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Concluída (2026-08-01) |
| **Esforço** | 0,5–1 dia |
| **Objetivo** | Envio WhatsApp coerente com `/settings/billing` |
| **Código** | `notificationTenantOutboundDispatchSchedule.ts` + `notificationEngineOrchestrator.ts` |
| **Testes** | `notificationTenantOutboundDispatchSchedule.test.ts` — **7 passed** (+ 8 janela = 15) |

**Entregas**

- [x] `same_as_generation=true`: após H no dia local → envio **imediato** (`dispatch_not_before=null`); **antes** de H → **defere** até `recurring_generate_time_local` (defesa p/ renovação manual / path fora da janela).
- [x] Notify **separado**: `dispatch_not_before` no timezone efetivo até `invoice_notify_time_local`; se já passou no dia → imediato.
- [x] Logs estruturados sempre-on: `outbound_dispatch_schedule` com `entity_id`/`invoice_id`, `dispatch_not_before`, `generate_time_local_effective`, `notify_time_local_effective`, `local_ymd`/`local_hhmm`, `timezone_effective`, `schedule_source`.
- [x] Metadata na delivery: `outbound_schedule_source`, `outbound_timezone_effective`, `outbound_generate_time_local_effective`.
- [x] Worker outbound: log `event_key` ao skip por `dispatch_not_before` futuro (já filtrava por SQL/`<= now()`).

**Gate Sprint 2**

- [x] Testes unitários verdes (schedule 7/7).
- [ ] Staging: delivery `queued`/`sent` coerente com settings (validação operacional).
- [x] Com S1+S2: path automático não envia ~00:01 se H ≠ 00:00 (geração bloqueada + defer de notify se somehow cedo).

---

### Sprint 3 — Robustez WhatsApp `Invalid token.` (P0 canal)

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Concluída (2026-08-01) |
| **Esforço** | 1–2 dias |
| **Objetivo** | Automático não “morrer” na primeira rejeição noturna sem recuperação controlada |
| **Código** | `whatsappDispatchErrorClassifier.ts`, `whatsappChannelDispatcher.ts`, orchestrator + retry worker, `chatInstanceInvalidTokenSelfHeal.ts` |
| **Testes** | classifier + self-heal + dispatch — verdes |

| Passo | Ação | Estado |
|-------|------|--------|
| 3.1 | Logs `whatsapp_dispatch_failed` / retry com `delivery_id`, `tenant_id`, `entity_id`, `chat_instance_id` | ✅ |
| 3.2 | `Invalid token` / 401 / 403 / disconnected → **transient** (teto `NOTIFICATIONS_ENGINE_WHATSAPP_MAX_SEND_ATTEMPTS`, default 4) | ✅ |
| 3.3 | Self-heal continua a marcar `disconnected` + metadata; **não** impede retries (status volta a `queued`) | ✅ |
| 3.4 | **Não** auto-`connectInstance` / recriar token | ✅ (mantido) |
| 3.5 | Metadata enriquecida: `invalidTokenReason`, `invalidTokenSource` (+ `invalidTokenDetectedAt`) | ✅ (UI dedicada adiada) |

**Gate Sprint 3**

- [x] `Invalid token.` classificado como `transient` nos testes.
- [x] Self-heal não altera `instance_token`.
- [ ] Staging: simular token inválido → delivery `queued` com `next_retry_at` (não `failed` na 1ª); após reconnect + retry → `sent`.

---

### Sprint 4 — Observabilidade e certificação (P1)

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Concluída (2026-08-01) |
| **Esforço** | 0,5–1 dia |
| **Objetivo** | Fechar onda com evidência operacional documentada |
| **Runbook** | [`RUNBOOK_BILLING_WINDOW_AND_WHATSAPP.md`](./RUNBOOK_BILLING_WINDOW_AND_WHATSAPP.md) |
| **Fase 2 atualizada** | [`FASE_2_MOTOR_JANELA_RECORRENCIA_POR_TENANT.md`](../FASE_2_MOTOR_JANELA_RECORRENCIA_POR_TENANT.md) |

**Entregas**

- [x] Contagens / queries: janela, faturas por hora, WA Invalid token, jobs requeue, self-heal — no runbook §4.
- [x] Caso golden documentado: “catch-up no D+1 só após H” — runbook §2 (G1–G5).
- [x] Regra de produto na Fase 2: sempre `hora local >= H` quando `local_ymd >= generation_date`.
- [x] Critérios de sucesso §7: marcados o que o código/testes cobrem; checklist prod permanece para ops pós-deploy.

**Gate Sprint 4**

- [x] Runbook publicado e linkado neste plano.
- [x] Fase 2 alinhada à regra Sprint 1.
- [ ] Checklist pós-deploy do runbook §5 executado em staging/prod (ops).

---

## 7. Critérios de sucesso (produção)

| Critério | Código / testes | Ops pós-deploy |
|----------|-----------------|----------------|
| Queda forte / zero criações ou notificações automáticas ~00:01 com H ≠ 00:00 | ✅ S1+S2 (janela + schedule) | [ ] runbook §5 |
| Faturas do dia continuam a aparecer **após** o horário de `/settings/billing` | ✅ S1 (elegível após H) | [ ] |
| Catch-ups geram fatura no mesmo dia civil **após** H (não “somem”) | ✅ S1 testes D+1 00:01 / 09:00 | [ ] |
| `Invalid token.` não fecha delivery como failed definitivo na 1ª sem retry | ✅ S3 classifier + schedule retry | [ ] |
| Reenvio manual após reconnect continua ok | ✅ path inalterado (sem auto-recreate) | [ ] |

---

## 8. Ordem de execução

```text
Sprint 0 (baseline)     ✅
Sprint 1 (janela)       ✅
Sprint 2 (notificação)  ✅
Sprint 3 (Invalid token)✅
Sprint 4 (runbook/cert) ✅  → validação prod = runbook §5
```

**Regra:** não iniciar a sprint N+1 sem gate da N aprovado (exceto nota em S3 sobre paralelismo com S2 *após* S1 estável).

---

## 9. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Medo de “parar de gerar” | Testes catch-up pós-H; requeue nunca cancela; gate S1 em staging |
| Jobs em requeue longo antes de H | Comportamento desejado; opcional S1.1 alinhar `retry_at` a H |
| Invalid token real (sessão morta) | Retry não resolve sozinho — tenant precisa reconnect; S3 evita falso “definitive” precoce |
| Auto-recreate token no worker | Explicitamente fora de S3 v1 (D4) |
| Confundir CRM vs SaaS platform notify | Escopo = CRM `invoice.created`; SaaS fica para onda futura se necessário |

---

## 10. Anexo A — Queries úteis (leitura)

```sql
-- Preferências do tenant
SELECT id, timezone,
       recurring_generate_time_local,
       invoice_notify_same_as_generation,
       invoice_notify_time_local,
       recurring_invoice_generate_days_before_due
FROM tenants
WHERE id = '<tenant_id>';

-- Deliveries Invalid token
SELECT id, tenant_id, entity_id, status, error_message,
       dispatch_sender_user_id, dispatch_chat_instance_id,
       created_at, updated_at, dispatch_not_before
FROM notification_outbound_deliveries
WHERE event_key = 'invoice.created'
  AND error_message ILIKE '%invalid token%'
  AND created_at > now() - interval '30 days'
ORDER BY created_at DESC
LIMIT 100;

-- Self-heal recente
SELECT id, user_id, status, updated_at,
       metadata->>'invalidTokenDetectedAt' AS healed_at,
       left(instance_token, 8) AS token_prefix
FROM chat_instances
WHERE metadata ? 'invalidTokenDetected'
ORDER BY updated_at DESC
LIMIT 50;
```

---

## 11. Anexo B — Resultados Sprint 0 (Postgres local, 2026-08-01)

> Ambiente: `localhost:5433` / `painelcrm`. **Repetir em produção** antes do deploy da Sprint 1.

### B.1 Jobs recorrentes

| status | n |
|--------|---|
| completed | 87 |
| failed | 7 |
| cancelled | 6 |
| pending com `retry_at` futuro | **0** |

### B.2 Notificações `invoice.created` (30 dias)

| status / erro | n |
|---------------|---|
| sent | 42 |
| failed / `Invalid token.` | **23** |
| failed / instância disconnected | 1 |
| failed / nenhuma instância ativa | 1 |

Amostra recente: todas no tenant `4ecc0b33-aecd-4489-a5ae-0d7c6395c35d`; horários BRT observados nos últimos ~3 dias concentrados em **11h–16h** (não só 00:01 neste BD local). Falha mais recente: **2026-08-01 12:48 BRT**.

### B.3 Preferências tenants (n=8)

| Métrica | Valor |
|---------|-------|
| Com `recurring_generate_time_local` | 8/8 |
| `invoice_notify_same_as_generation` efetivo true | 8/8 |
| Com `days_before > 0` | **1** |
| Distribuição H | `09:00` ×7 · `14:00` ×1 |

### B.4 Tenant problema (`4ecc0b33-…`)

| Campo | Valor |
|-------|-------|
| timezone | `America/Sao_Paulo` |
| `recurring_generate_time_local` | **14:00:00** |
| `invoice_notify_same_as_generation` | **true** |
| `recurring_invoice_generate_days_before_due` | **7** |
| `chat_instances` | 1 linha, `status=disconnected`, `invalidTokenDetectedAt=2026-08-01T15:48:35.740Z`, token prefix `a0b6c8ac` |
| self-heal global (metadata) | 1 instância |

**Leitura para S1:** com **7 dias de antecipação**, após o primeiro dia de geração a regra atual libera o ciclo a **qualquer hora** (incl. 00:01) — alinhado ao bug de produto. H configurado é **14:00**, não 09:00.

**Leitura para S3:** `Invalid token.` é o erro dominante (23/25 falhas); instância já marcada disconnected por self-heal no dia da baseline.

### B.5 Faturas CRM por hora BRT (60 dias, agregadas)

Pico em **14h** (15), depois 13h/15h/11–12h; também há criações noturnas (22h×4, 23h×1). Sem pico isolado em `00` neste snapshot local — o caso 00:01 reportado pode ser prod ou ciclo específico; a **regra de código** que permite 00:01 em catch-up está confirmada (§0.3).

---

## 12. Histórico de execução

| Data | Sprint | Resultado |
|------|--------|-----------|
| 2026-08-01 | — | Plano documentado |
| 2026-08-01 | **0** | ✅ Baseline local + checklist + verbose confirmado; sem mudança de comportamento |
| 2026-08-01 | **1** | ✅ Janela exige H em todos os dias `>= generation_date`; testes 8/8; S1.1 adiado |
| 2026-08-01 | **2** | ✅ Schedule notify alinhado + defesa same_as antes de H; logs `outbound_dispatch_schedule`; testes 7/7 |
| 2026-08-01 | **3** | ✅ Invalid token → transient + retry; logs correlacionados; self-heal metadata; sem auto-recreate |
| 2026-08-01 | **4** | ✅ Runbook + Fase 2 atualizada + golden G1–G5; onda código fechada; checklist prod no runbook §5 |

---

*Documento vivo: atualizar **Status** no cabeçalho e a secção 12 ao concluir cada sprint.*
