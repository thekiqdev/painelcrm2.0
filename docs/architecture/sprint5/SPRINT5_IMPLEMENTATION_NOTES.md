# Sprint 5 — Shadow Mode + Passive Consumers + Orchestration Foundation

## Escopo

Workflow runtime, orchestration, saga foundation, passive consumers reais (observe + shadow), event bridge outbox→workflow. **Sem** side-effects em billing, notify, onboarding ou comunicação real.

## Componentes

| Área | Caminho |
|------|---------|
| Migration | `257_workflow_automation_p0.sql` |
| Workflow runtime | `packages/backend/src/automation/workflowRuntime/` |
| Orchestration | `packages/backend/src/automation/orchestration/` |
| Sagas | `packages/backend/src/automation/sagas/` |
| Event bridge | `packages/backend/src/automation/outboxWorkflowBridge.ts` |
| Passive handlers | `packages/backend/src/automation/passiveConsumers/` |
| Jobs | `packages/backend/src/automation/automationJobRepository.ts` |

## Tabelas

- `workflow_executions` — execuções shadow/dry-run
- `automation_jobs` — jobs agendados (foundation)
- `saga_instances` — estado saga + compensation registry (sem execução real)
- `workflow_validation_snapshots` — replay/idempotency validation

## Passive consumers (Sprint 5)

| Subscriber | Eventos |
|------------|---------|
| `support.ticket.created` | `ticket.created`, `support.ticket.created` |
| `communication.message.received` | `communication.message.received` |
| `communication.message.failed` | `communication.message.failed` |
| `billing.invoice.created` | `invoice.created`, `billing.invoice.created` |
| `onboarding.trial.started` | `onboarding.trial.started` |
| `onboarding.signup.started` | `onboarding.signup.started` |

Comportamento: log → `bridgeOutboxEventToWorkflow` → `startWorkflow` (shadow) → persist execution + snapshots.

## Flags (default OFF)

- `workflow.runtime_v1`
- `workflow.shadow_execution_v1`
- `workflow.passive_consumers_v1`
- `workflow.orchestration_v1`
- `workflow.saga_foundation_v1`
- `workflow.bridge_v1`
- Kill: `workflow.master_off`

Requires `outbox.passive_consumers_v1` for outbox dispatch path.

## Shadow execution

`executeWorkflowShadow` simula steps: `validate_input` → `plan_steps` → `simulate_dispatch` → `finalize`. Sem envio WA/email, sem alteração tenant/billing.

## Rollback

1. `workflow.master_off` ON
2. `outbox.passive_consumers_v1` OFF — passive handlers não disparam bridge
3. Tabelas inertes com flags OFF

## Fora de escopo

Onboarding/recovery real, provisioning, compensation execution, workflow builder UI, AI orchestration.

## Testes

`packages/backend/src/automation/automation.test.ts`
