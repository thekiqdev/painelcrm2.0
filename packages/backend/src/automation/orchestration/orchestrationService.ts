import { randomUUID } from 'crypto';
import { scheduleAutomationJob } from '../automationJobRepository.js';
import { executeWorkflowShadow } from '../workflowRuntime/shadowExecution.js';
import { findWorkflowExecutionByExecutionId, updateWorkflowExecutionStatus } from '../workflowRuntime/workflowExecutionRepository.js';
import { isWorkflowOrchestrationEnabled } from '../workflowRuntime/workflowFlags.js';
import { logOrchestration, logWorkflowStep } from '../workflowRuntime/workflowLogger.js';
import type { StartWorkflowInput, ScheduleStepInput, StepMutationInput } from './orchestrationTypes.js';
import type { ExecuteWorkflowResult } from '../workflowRuntime/workflowTypes.js';

export async function startWorkflow(input: StartWorkflowInput): Promise<ExecuteWorkflowResult> {
  const enabled = await isWorkflowOrchestrationEnabled({ tenantId: input.tenantId ?? null });
  if (!enabled) {
    logOrchestration('start_skipped', { reason: 'orchestration_v1_off', workflow_key: input.workflowKey });
    return { outcome: 'skipped', reason: 'orchestration_v1_off' };
  }

  logOrchestration('start', {
    workflow_key: input.workflowKey,
    correlation_id: input.correlationId,
    tenant_id: input.tenantId ?? null,
    trigger_event: input.triggerEventKey ?? null,
  });

  return executeWorkflowShadow({
    workflowKey: input.workflowKey,
    correlationId: input.correlationId,
    tenantId: input.tenantId ?? null,
    payload: input.payload,
    triggerEventKey: input.triggerEventKey,
    idempotencyKey: input.idempotencyKey,
    dryRun: true,
    shadowMode: true,
  });
}

export async function scheduleStep(input: ScheduleStepInput): Promise<{ scheduled: boolean; jobId: string | null }> {
  const enabled = await isWorkflowOrchestrationEnabled({ tenantId: input.tenantId ?? null });
  if (!enabled) return { scheduled: false, jobId: null };

  const execution = await findWorkflowExecutionByExecutionId(input.executionId);
  logWorkflowStep('schedule', {
    execution_id: input.executionId,
    step_key: input.stepKey,
    correlation_id: input.correlationId,
  });

  const scheduledFor = new Date(Date.now() + (input.delayMs ?? 0));
  const { id } = await scheduleAutomationJob({
    jobKey: `step:${input.stepKey}`,
    workflowExecutionId: execution?.id ?? null,
    tenantId: input.tenantId ?? null,
    correlationId: input.correlationId,
    scheduledFor,
    payload: input.payload,
    metadata: { step_key: input.stepKey, simulated: true },
    shadowMode: true,
  });

  return { scheduled: Boolean(id), jobId: id };
}

export async function completeStep(input: StepMutationInput): Promise<void> {
  const enabled = await isWorkflowOrchestrationEnabled();
  if (!enabled) return;

  logWorkflowStep('complete', {
    execution_id: input.executionId,
    step_key: input.stepKey,
    correlation_id: input.correlationId,
  });

  await updateWorkflowExecutionStatus(input.executionId, 'running', {
    metadata: { last_completed_step: input.stepKey, ...(input.metadata ?? {}) },
  });
}

export async function failStep(input: StepMutationInput): Promise<void> {
  const enabled = await isWorkflowOrchestrationEnabled();
  if (!enabled) return;

  logWorkflowStep('fail', {
    execution_id: input.executionId,
    step_key: input.stepKey,
    error: input.error,
  });

  await updateWorkflowExecutionStatus(input.executionId, 'failed', {
    metadata: input.metadata,
    error: input.error,
  });
}

export async function cancelWorkflow(input: {
  executionId: string;
  correlationId: string;
  reason?: string;
}): Promise<void> {
  const enabled = await isWorkflowOrchestrationEnabled();
  if (!enabled) return;

  logOrchestration('cancel', {
    execution_id: input.executionId,
    correlation_id: input.correlationId,
    reason: input.reason ?? 'cancelled',
  });

  await updateWorkflowExecutionStatus(input.executionId, 'cancelled', {
    metadata: { cancel_reason: input.reason ?? 'user_cancel' },
  });
}

export function newOrchestrationCorrelationId(): string {
  return randomUUID();
}
