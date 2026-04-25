# Correção — normalização de `cycle_key` e falso `active_job_exists`

## Causa raiz

1. **`billing_recurring_jobs.cycle_key`** devia representar o dia lógico do ciclo em texto, alinhado a `subscriptions.next_billing_date` (**YYYY-MM-DD**).
2. Em dados legados (ou caminhos que serializaram data com fuso), `cycle_key` ficou como **timestamp ISO** (ex.: `2026-04-24T00:00:00.000-03:00`).
3. O worker comparava `subscriptions.next_billing_date` normalizado (`2026-04-24`) com **`job.cycle_key` em bruto** → strings diferentes → **falso** `cancelled_job_cycle_mismatch_after_reschedule`.
4. `insertOrReactivateRenewalJob` / `predictInsertOrReactivateRenewalJob` procuravam jobs ativos com **`cycle_key =` canónico** exato. Um segundo job **no mesmo dia** com chave ISO não era encontrado como “o mesmo ciclo”, mas o UNIQUE `(subscription_id, cycle_key)` permitia **duas linhas** (`2026-04-24` e `…T00:00…`) → após cancelar a ISO, a linha canónica continuava `pending`/`processing` → **`active_job_exists`** bloqueava o reenfileiramento.

## Formato canónico

- **Canónico persistido:** `cycle_key` **TEXT** = **`YYYY-MM-DD`** (mesma convenção que a parte data de `subscriptions.next_billing_date`).
- **Legado aceite em leitura:** sufixo ISO `YYYY-MM-DDTHH…` ou espaço `YYYY-MM-DD HH…` — tratados como o mesmo dia lógico **após** `normalizeBillingCycleKeyYmd()`.

## O que mudou no código

| Área | Alteração |
|------|-----------|
| `normalizeBillingCycleKeyYmd` | Nova função exportada; normaliza qualquer string legada para YYYY-MM-DD quando seguro. |
| Worker (`processNextBatch`) | Compara **`normalizeBillingCycleKeyYmd(job.cycle_key)`** com a subscription normalizada; deixa de cancelar por mero formato. |
| `insertOrReactivateRenewalJob` / `predict…` | Usam `cycle_key` **canónico** no `INSERT` e na reativação (`UPDATE` também grava `cycle_key` canónico). |
| Colisão “mesmo ciclo” | Predicado SQL partilhado `BILLING_JOBS_WHERE_SAME_LOGICAL_CYCLE` (+ variante com `tenant_id` para insight): `cycle_key = canónico` **OU** prefixo `YYYY-MM-DD` + `T`/`t`/espaço na posição 11. |
| Scheduler | `joinRow.next_billing_date` e janela Fase 2 usam sempre o canónico derivado da subscription. |
| Insight | Contagem de pending no ciclo atual usa o mesmo predicado lógico. |
| Observabilidade | Logs com `cycle_key_raw` / `cycle_key_normalized`; bloqueio `active_job_exists` inclui JSON de ids e `cycle_key` brutos dos jobs bloqueantes. |

## Migração `140_billing_recurring_jobs_normalize_cycle_key.sql`

- Normaliza `cycle_key` ISO → `YYYY-MM-DD` quando **não** quebra UNIQUE.
- Se existir duplicata **ativa** (canónico + ISO), **cancela** a linha ISO com outcome/documentação explícitos.
- Repete normalização para ISO remanescentes.

**Executar** via pipeline habitual de migrações (`migrate.ts` inclui o ficheiro).

## Idempotência

- **Não reabre** `completed`.
- **Não duplica** `pending`/`processing` para o **mesmo dia lógico** (predicado alargado + UNIQUE após migração).
- **Reativa** só `cancelled`/`failed` da mesma linha (agora com `cycle_key` canónico ao reativar).

## Jobs em `processing` sem worker (fila “fantasma”)

O scheduler trata `pending` **e** `processing` como “ativo” e não insere duplicado. O worker **só** faz `SELECT` de linhas `pending` com `scheduled_at <= now()` e `retry_at` vencido. Se um processo morrer a meio do job, a linha pode ficar em `processing` **para sempre**: o scheduler continua a registar `skipped_active_exists` e o worker vê `batchSize = 0`.

**Correção aplicada:** no início de cada `processNextBatch`, `reclaimStaleBillingProcessingJobs` repõe em `pending` os jobs `processing` com `locked_at` (ou `updated_at` se `locked_at` for nulo) mais antigos que `BILLING_WORKER_STALE_PROCESSING_RECLAIM_MINUTES` (default **20**; `0` desliga). Ver `packages/backend/src/config/billingEnv.ts`.

Os logs `enqueue_skipped_insert_guard` incluem `blocking_jobs_json` com `status`, `scheduled_at`, `retry_at` e `locked_at` para diagnóstico.

## Riscos remanescentes

- Formatos de `cycle_key` **não** cobertos pelo predicado (ex.: outro separador) podem ainda exigir limpeza manual — improvável se só existir ISO `T` ou data pura.
- Várias linhas **ativas** para o mesmo dia lógico: o código regista `enqueue_warn_multiple_active_same_logical_cycle` e retém comportamento seguro (`skipped_active_exists`); operação deve inspecionar e fundir/cancelar duplicatas.
- **`pending`** com `retry_at` ou `scheduled_at` no futuro: o scheduler pode continuar a saltar o insert; o JSON de bloqueio mostra os valores — ajustar dados ou esperar a janela.

## `pending` + `retry_at` futuro (backoff pós-falha)

Após erro no processamento, o worker repõe o job em `pending` com `retry_at` escalonado (ex.: +1 h na 1.ª falha). Enquanto `retry_at > now()`, o worker **não** apanha o job (`batchSize` pode ser 0) mas o scheduler continua a ver “ativo” e não duplica — comportamento esperado.

**Bug corrigido:** nesse `UPDATE` de retry não se limpavam `locked_at` / `locked_by`, ficando `pending` com lock de `processing`. Agora os locks são sempre limpos no retry e em `failed` final. Foi adicionada sanitização no início do batch (`pending_orphan_locks_cleared`) e o log `batch_empty_retry_backoff` quando não há batch mas existem linhas à espera de `retry_at`.

## Critérios de aceite (verificação)

1. Comparação subscription vs job usa **dia lógico** normalizado.
2. Mesmo dia em formatos diferentes **não** dispara mismatch.
3. `active_job_exists` só quando existe **outro** job ativo no **mesmo ciclo lógico** (incl. legado ISO), não por string estritamente igual ao canónico apenas.
4. Nova fatura recorrente pode ser gerada após o worker processar o job **sem** cancelamento falso.
5. Migração 140 reduz duplicatas legadas sem violar UNIQUE.
