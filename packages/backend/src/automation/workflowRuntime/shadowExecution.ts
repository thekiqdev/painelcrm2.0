import { randomUUID } from 'crypto';
import { runWithRequestContext } from '../../context/requestContext.js';
import { logWorkflow, logWorkflowExecution, logWorkflowStep } from './workflowLogger.js';
import { getWorkflowShadowExecutionFlag, isWorkflowRuntimeEnabled } from './workflowFlags.js';
import {
  insertWorkflowExecution,
  updateWorkflowExecutionStatus,
} from './workflowExecutionRepository.js';
import { recordWorkflowValidationSnapshot } from './validationSnapshots.js';
import type { ExecuteWorkflowInput, ExecuteWorkflowResult } from './workflowTypes.js';

const SHADOW_STEPS = ['validate_input', 'plan_steps', 'simulate_dispatch', 'finalize'];

/**
 * Simulates workflow steps without billing/communication/tenant side effects.
 */
export async function executeWorkflowShadow(input: ExecuteWorkflowInput): Promise<ExecuteWorkflowResult> {
  const runtimeOn = await isWorkflowRuntimeEnabled({ tenantId: input.tenantId ?? null });
  const shadowFlag = await getWorkflowShadowExecutionFlag({ tenantId: input.tenantId ?? null });

  if (!runtimeOn) {
    logWorkflow('shadow_skipped', { reason: 'runtime_v1_off', workflow_key: input.workflowKey });
    return { outcome: 'skipped', reason: 'runtime_v1_off' };
  }

  const executionId = input.idempotencyKey ?? `wf-exec-${input.workflowKey}-${randomUUID()}`;
  const shadowMode = input.shadowMode ?? shadowFlag.shadow ?? true;
  const dryRun = input.dryRun ?? true;

  return runWithRequestContext(
    {
      correlationId: input.correlationId,
      tenantId: input.tenantId ?? undefined,
      workerName: `workflow:${input.workflowKey}`,
    },
    async () => {
      const { inserted, row } = await insertWorkflowExecution({
        workflowKey: input.workflowKey,
        executionId,
        correlationId: input.correlationId,
        tenantId: input.tenantId ?? null,
        payload: input.payload,
        metadata: {
          ...(input.metadata ?? {}),
          trigger_event: input.triggerEventKey ?? null,
        },
        dryRun,
        shadowMode,
      });

      if (!row) {
        return { outcome: 'skipped', reason: 'table_unavailable' };
      }

      if (!inserted) {
        logWorkflowExecution('idempotent_duplicate', {
          execution_id: executionId,
          workflow_key: input.workflowKey,
        });
        return {
          outcome: 'shadow_executed',
          executionId,
          workflowExecutionId: row.id,
          status: row.status,
          shadow: true,
          reason: 'idempotent_duplicate',
        };
      }

      await updateWorkflowExecutionStatus(executionId, 'running');
      logWorkflowExecution('started', {
        execution_id: executionId,
        workflow_key: input.workflowKey,
        correlation_id: input.correlationId,
        shadow: shadowMode,
        dry_run: dryRun,
      });

      await recordWorkflowValidationSnapshot({
        workflowExecutionId: row.id,
        snapshotType: 'execution_start',
        correlationId: input.correlationId,
        idempotencyKey: `wf-snap:start:${executionId}`,
        payload: input.payload ?? {},
        metadata: { workflow_key: input.workflowKey },
      });

      for (let i = 0; i < SHADOW_STEPS.length; i += 1) {
        const step = SHADOW_STEPS[i]!;
        logWorkflowStep('shadow_step', {
          execution_id: executionId,
          step,
          step_index: i + 1,
          correlation_id: input.correlationId,
        });
      }

      await updateWorkflowExecutionStatus(executionId, 'completed', {
        metadata: { steps_simulated: SHADOW_STEPS.length, passive: true },
      });

      await recordWorkflowValidationSnapshot({
        workflowExecutionId: row.id,
        snapshotType: 'execution_complete',
        correlationId: input.correlationId,
        idempotencyKey: `wf-snap:complete:${executionId}`,
        payload: { steps: SHADOW_STEPS },
      });

      logWorkflowExecution('completed', {
        execution_id: executionId,
        workflow_key: input.workflowKey,
        shadow: shadowMode,
      });

      if (!shadowFlag.enabled && !shadowMode) {
        return {
          outcome: 'executed',
          executionId,
          workflowExecutionId: row.id,
          status: 'completed',
          shadow: false,
        };
      }

      return {
        outcome: 'shadow_executed',
        executionId,
        workflowExecutionId: row.id,
        status: 'completed',
        shadow: true,
      };
    },
  );
}
