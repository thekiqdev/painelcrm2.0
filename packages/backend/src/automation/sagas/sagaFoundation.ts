import { isWorkflowSagaFoundationEnabled } from '../workflowRuntime/workflowFlags.js';
import { createSagaInstance, registerSagaCompensation, updateSagaState } from './sagaRepository.js';
import { logSaga } from '../workflowRuntime/workflowLogger.js';
import type { SagaCompensationRegistration } from './sagaTypes.js';

export async function startSagaFoundation(input: {
  sagaKey: string;
  correlationId: string;
  tenantId?: string | null;
  initialState?: Record<string, unknown>;
}): Promise<{ sagaId: string | null; shadow: boolean }> {
  const enabled = await isWorkflowSagaFoundationEnabled({ tenantId: input.tenantId ?? null });
  if (!enabled) {
    logSaga('start_skipped', { reason: 'saga_foundation_v1_off', saga_key: input.sagaKey });
    return { sagaId: null, shadow: true };
  }

  const row = await createSagaInstance({
    sagaKey: input.sagaKey,
    correlationId: input.correlationId,
    tenantId: input.tenantId ?? null,
    initialState: input.initialState,
    shadowMode: true,
  });

  if (row) {
    await updateSagaState(row.id, { status: 'running', state: { phase: 'shadow_started' } });
    logSaga('started', { saga_id: row.id, saga_key: input.sagaKey, correlation_id: input.correlationId });
  }

  return { sagaId: row?.id ?? null, shadow: true };
}

export async function registerCompensationFoundation(
  sagaId: string,
  compensation: SagaCompensationRegistration,
): Promise<void> {
  const enabled = await isWorkflowSagaFoundationEnabled();
  if (!enabled) return;
  await registerSagaCompensation(sagaId, { ...compensation, execute: false });
}
