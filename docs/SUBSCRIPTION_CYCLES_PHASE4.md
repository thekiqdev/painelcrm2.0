        # Etapa 4 — Reconciliação e validação (`subscription_cycles`)

        Referência: [PLANO_DEFINITIVO_FATURAS_RECORRENTES_COM_CICLOS.md](./PLANO_DEFINITIVO_FATURAS_RECORRENTES_COM_CICLOS.md), [SUBSCRIPTION_CYCLES_PHASE3.md](./SUBSCRIPTION_CYCLES_PHASE3.md).

        ## Objetivo

        Gerar um **relatório somente leitura** que cruza `subscription_cycles`, `billing_recurring_jobs` e `customer_invoices`, para **medir consistência** antes de qualquer cutover do motor. **Nenhuma alteração destrutiva**; scheduler/worker **não** são modificados.

        ## Execução

        Na raiz do backend (ou repo com `packages/backend`):

        ```bash
        cd packages/backend
        npx tsx src/scripts/runSubscriptionCyclesReconciliation.ts
        ```

        Ou via npm (a partir de `packages/backend`):

        ```bash
        npm run billing:subscription-cycles-reconcile
        ```

        Variável opcional — tamanho máximo das amostras por categoria (default 15, máx. 200):

        ```bash
        SAMPLE=30 npm run billing:subscription-cycles-reconcile
        ```

        **Saída:** JSON no stdout com `summary` (contagens), `samples` (linhas exemplo) e `notes_pt`.

        **Exit codes:**

        - `0` — todas as contagens de divergência são zero (e a tabela existe).
        - `1` — pelo menos uma divergência detetada (adequado a CI de *alerta* opcional).
        - `2` — tabela `subscription_cycles` inexistente ou inacessível.

        ## Verificações implementadas

        | Chave `summary` | O que deteta | Ação sugerida (não automática) |
        |-----------------|--------------|--------------------------------|
        | `invoiced_cycle_missing_invoice_id` | `status = invoiced` sem `invoice_id` | Corrigir dados ou backfill; revisar dual-write Etapa 3. |
        | `customer_invoice_subscription_missing_cycle` | Fatura `origin=subscription` com `subscription_id` + `period_start` sem linha de ciclo no mesmo par | Correr backfill (141) ou script de alinhamento; confirmar flag `subscription_cycles_write`. |
        | `completed_job_customer_invoice_cycle_mismatch` | Job `completed` com `result_invoice_id` CRM sem ciclo `invoiced` coerente (ou `invoice_id` diferente) | Investigar ordem de escrita, RLS, ou ciclo criado com `cycle_date` errado. |
        | `queued_cycle_without_active_job` | Ciclo `queued` sem job `pending`/`processing` no mesmo ciclo lógico | Scheduler/worker atrasados, job cancelado sem atualizar ciclo, ou janela temporal; reconciliar manualmente. |
        | `processing_cycle_without_processing_job` | Ciclo `processing` sem job em `processing` | Lock/reclaim, falha de worker, ou dual-write incompleto. |
        | `terminal_cycle_missing_reason` | `skipped`/`cancelled` sem `skipped_reason`, ou `failed` sem `skipped_reason` e sem `error_message` | Melhorar gravação de motivos (Etapa 3) ou backfill de texto. |
        | `invoiced_cycle_invoice_orphan_or_wrong_subscription` | `invoice_id` aponta para fatura inexistente ou `subscription_id` diferente | Integridade referencial quebrada; corrigir FK/dados. |

        ### Falso positivos possíveis

        - **`pending`** na tabela de ciclos **sem** job ainda é esperado entre ticks do scheduler (não entra nas verificações de “sem job”).
        - **SaaS** (`tenant_billing`): jobs completos com fatura interna não exigem `invoiced` + `invoice_id` CRM; a verificação de mismatch **restringe-se** a `customer_invoice` (ou tipo nulo tratado como CRM).
        - **Janela de tempo**: entre transações, contagens podem oscilar ligeiramente; repetir o relatório em horário de baixa carga.

        ## Ficheiros

        | Ficheiro | Função |
        |----------|--------|
        | `packages/backend/src/services/subscriptionCyclesReconciliationService.ts` | Consultas e montagem do relatório |
        | `packages/backend/src/scripts/runSubscriptionCyclesReconciliation.ts` | CLI + exit codes |
        | `package.json` | Script `billing:subscription-cycles-reconcile` |

        ## Critérios de aceite

        - [x] Executável em staging/produção (só `SELECT` / subconsultas).
        - [x] Sem `UPDATE`/`DELETE`/migrações automáticas.
        - [x] Relatório com contagens e amostras para decisão de cutover futuro.

        ## Próximo passo (fora desta etapa)

        - Definir política de cutover (ex.: scheduler usa ciclos como fonte) após **zero** divergências estáveis em janelas monitoradas.
