# Billing Recovery + Auto-Healing Engine (Fase 3)

Camada operacional de **recovery**, **reconciliação**, **retry inteligente** e **auditoria** sobre o motor recorrente já estabilizado. **Não altera** `cycle_key`, `next_billing_date`, totais, gateway logic nem geração antecipada.

---

## Componentes

| Peça | Caminho |
|------|---------|
| Serviço principal | `packages/backend/src/services/billingRecoveryService.ts` |
| API health | `GET /api/superadmin/billing/health` |
| API recovery | `POST /api/superadmin/billing/recovery/run` |
| Script cron | `packages/backend/src/scripts/runBillingReconciliation.ts` |
| Auditoria | tabela `billing_recovery_audit` (migração `249`) |
| UI | `/superadmin/billing/operations` |

---

## Health score

| Score | Critérios (resumo) |
|-------|-------------------|
| **critical** | Heartbeat scheduler/worker stale; ≥10 jobs failed (30d); ≥5 processing travados; ≥15 ciclos inconsistentes |
| **warning** | Qualquer órfão, notify failed, gateway issue ou failed jobs > 0 |
| **healthy** | Nenhum indicador acima |

Resposta JSON inclui `counts`, `samples`, `heartbeats`, `jobs_summary`, `score_reasons`.

---

## Diagnósticos

### Ciclos órfãos (`subscription_cycles`)

Detecta `pending` / `queued` / `processing` / `invoiced` com:

- `invoiced` sem `invoice_id`
- sem `job_id` ou job em estado terminal
- `processing` ou fila parada há > 48h

Log: `[BILLING_ORPHAN]`

### Faturas órfãs (`customer_invoices`)

Recorrentes sem ciclo ligado e/ou sem `notification_outbound_deliveries` para `invoice.created` (após grace de 15 min).

### Notificações

- `failed`
- `queued` com `dispatch_not_before` ou `updated_at` vencidos (> 2h)
- `retry_count` elevado (≥ 5)

Log: `[BILLING_NOTIFY_RECOVERY]`

### Jobs

- `processing` com lock antigo (mesma regra do worker: `BILLING_WORKER_STALE_PROCESSING_RECLAIM_MINUTES`)
- `pending` com `scheduled_at` antigo

### Gateway (somente leitura no health)

Faturas de assinatura com `gateway_status` failed/refused ou `pending` sem `gateway_reference_id` há horas — **não** dispara `createCharge` automaticamente (preserva gateway logic).

---

## Auto-repair permitido

| Ação | Efeito |
|------|--------|
| `reclaim_stale_processing` | Job `processing` → `pending`, limpa lock, marca ciclo queued |
| `clear_pending_locks` | Remove locks órfãos em `pending` |
| `reactivate_stale_pending` | `scheduled_at = now()` em pending antigo elegível |
| `heal_orphan_cycles` | `processing` antigo → `queued`; `invoiced` sem fatura → `failed` |
| `recreate_invoice_notifications` | Chama `notifyInvoiceCreated` + flush da fila |
| `requeue_notification_deliveries` | `failed`/`queued` preso → `queued` + `next_retry_at = now()` |

### Não permitido (automático)

- Alterar valores / cancelar invoices
- Avançar `next_billing_date` ou criar nova cobrança financeira
- Reconciliação gateway (`billing:reconciliation` continua separado)

---

## Dry-run

```env
BILLING_RECOVERY_DRY_RUN=true   # default: apenas log + audit sem UPDATE
BILLING_RECOVERY_DRY_RUN=false  # aplica reparações leves
```

Override por request: `POST /api/superadmin/billing/recovery/run` com `{ "dry_run": false }`.

Logs: `[BILLING_HEALTH]`, `[BILLING_RECOVERY]`, `[BILLING_ORPHAN]`, `[BILLING_NOTIFY_RECOVERY]`.

---

## Script de reconciliação

```bash
cd packages/backend
npm run billing:ops-reconciliation
```

Fluxo: scan → diagnose → repair leve → relatório JSON no stdout.

Sugestão cron: a cada 15–30 min com `BILLING_RECOVERY_DRY_RUN=false` em produção após validação.

---

## Frontend

**Super Admin → Financeiro → Operações billing** (`/superadmin/billing/operations`)

- Health score e razões
- Cards de filas (pending, failed, órfãos, notify, gateway)
- Heartbeats worker/scheduler
- Audit trail recente
- Botões **Dry-run** e **Executar recovery**

---

## Relação com outros módulos

| Módulo | Papel |
|--------|--------|
| `billingOpsHeartbeatService` | Heartbeat em `GET /health` |
| `billingReconciliationService` | Gateway reference (SaaS `tenant_billing`) — **não** substituído |
| `billingNotificationFlush` | Após recriar notify no recovery |
| `runRecurringWorker` | Continua reclaim no batch; recovery reforça entre ciclos |

---

## Migrações

- `248_billing_ops_heartbeat.sql` — heartbeat
- `249_billing_recovery_audit.sql` — auditoria de recovery

---

## Validação

1. `GET /api/superadmin/billing/health` → `score` + `counts`
2. Dry-run: `POST .../recovery/run` `{ "dry_run": true }` → `applied: false` nas repairs
3. Com inconsistência real: `dry_run: false` → linhas em `billing_recovery_audit`
4. UI reflete score e amostras após refresh
