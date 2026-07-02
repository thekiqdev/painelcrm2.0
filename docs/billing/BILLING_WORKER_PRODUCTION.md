# Billing Worker Production — Sprint 4.2

## Certificação

Módulo: `audit/worker/workerCertification.ts`

## Cenários cobertos

Scheduler, Worker, Retry, Pending, Completed, Failed, Recovery, Generate Manual/Automático, Advance Cycle, Upgrade, Downgrade, Pause, Resume, Cancel.

## Métricas

- Contagem por `billing_recurring_jobs.status`
- Jobs `processing` stuck > 30min
- Failed sem invoice

## Pré-requisito

`docs/billing/BILLING_WORKER_CERTIFICATION.md` (4.1J)
