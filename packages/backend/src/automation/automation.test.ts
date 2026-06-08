import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./workflowRuntime/workflowFlags.js', () => ({
  isWorkflowMasterOff: vi.fn(),
  isWorkflowRuntimeEnabled: vi.fn(),
  getWorkflowShadowExecutionFlag: vi.fn(),
  isWorkflowPassiveConsumersEnabled: vi.fn(),
  isWorkflowOrchestrationEnabled: vi.fn(),
  isWorkflowSagaFoundationEnabled: vi.fn(),
  isWorkflowBridgeEnabled: vi.fn(),
}));

vi.mock('./workflowRuntime/workflowExecutionRepository.js', () => ({
  workflowExecutionsTableExists: vi.fn().mockResolvedValue(true),
  insertWorkflowExecution: vi.fn(),
  updateWorkflowExecutionStatus: vi.fn(),
  findWorkflowExecutionByExecutionId: vi.fn(),
}));

vi.mock('./workflowRuntime/validationSnapshots.js', () => ({
  recordWorkflowValidationSnapshot: vi.fn().mockResolvedValue({ recorded: true, duplicate: false }),
}));

vi.mock('./automationJobRepository.js', () => ({
  automationJobsTableExists: vi.fn().mockResolvedValue(true),
  scheduleAutomationJob: vi.fn().mockResolvedValue({ id: 'job-1' }),
}));

vi.mock('./sagas/sagaRepository.js', () => ({
  sagaInstancesTableExists: vi.fn().mockResolvedValue(true),
  createSagaInstance: vi.fn().mockResolvedValue({
    id: 'saga-1',
    saga_key: 'test',
    correlation_id: 'c1',
    tenant_id: null,
    status: 'pending',
    state_json: {},
    compensation_json: [],
    rollback_metadata_json: {},
    shadow_mode: true,
  }),
  registerSagaCompensation: vi.fn(),
  updateSagaState: vi.fn(),
}));

import {
  getWorkflowShadowExecutionFlag,
  isWorkflowBridgeEnabled,
  isWorkflowOrchestrationEnabled,
  isWorkflowPassiveConsumersEnabled,
  isWorkflowRuntimeEnabled,
  isWorkflowSagaFoundationEnabled,
} from './workflowRuntime/workflowFlags.js';
import {
  insertWorkflowExecution,
  updateWorkflowExecutionStatus,
  findWorkflowExecutionByExecutionId,
} from './workflowRuntime/workflowExecutionRepository.js';
import { executeWorkflowShadow } from './workflowRuntime/shadowExecution.js';
import { startWorkflow, scheduleStep, cancelWorkflow } from './orchestration/orchestrationService.js';
import { bridgeOutboxEventToWorkflow, workflowKeyForOutboxEvent } from './outboxWorkflowBridge.js';
import { startSagaFoundation } from './sagas/sagaFoundation.js';
import type { OutboxEventRow } from '../outbox/outboxTypes.js';

const baseEvent: OutboxEventRow = {
  id: 'evt-1',
  event_key: 'ticket.created',
  event_version: 1,
  aggregate_type: 'ticket',
  aggregate_id: 't-1',
  tenant_id: 'tenant-1',
  correlation_id: 'corr-1',
  payload_json: { ticket_id: 't-1' },
  metadata_json: { shadow: true },
  idempotency_key: 'idem-1',
  status: 'published',
  attempts: 0,
  max_attempts: 8,
  next_retry_at: new Date().toISOString(),
  priority: 2,
  last_error: null,
  locked_by: null,
  locked_at: null,
  published_at: new Date().toISOString(),
  failed_at: null,
  dead_letter_at: null,
  causation_id: null,
  replay_of_event_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('workflowRuntime shadow execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWorkflowRuntimeEnabled).mockResolvedValue(true);
    vi.mocked(getWorkflowShadowExecutionFlag).mockResolvedValue({ enabled: true, shadow: true });
    vi.mocked(insertWorkflowExecution).mockResolvedValue({
      inserted: true,
      row: {
        id: 'wf-db-1',
        workflow_key: 'test.workflow',
        execution_id: 'exec-1',
        correlation_id: 'corr-1',
        tenant_id: null,
        status: 'pending',
        started_at: new Date().toISOString(),
        completed_at: null,
        failed_at: null,
        payload_json: {},
        metadata_json: {},
        dry_run: true,
        shadow_mode: true,
      },
    });
  });

  it('skips when runtime flag off', async () => {
    vi.mocked(isWorkflowRuntimeEnabled).mockResolvedValue(false);
    const result = await executeWorkflowShadow({
      workflowKey: 'test',
      correlationId: 'c1',
    });
    expect(result.outcome).toBe('skipped');
  });

  it('executes shadow steps and completes', async () => {
    const result = await executeWorkflowShadow({
      workflowKey: 'test.workflow',
      correlationId: 'corr-1',
      idempotencyKey: 'exec-unique-1',
    });
    expect(result.outcome).toBe('shadow_executed');
    expect(updateWorkflowExecutionStatus).toHaveBeenCalled();
  });
});

describe('orchestrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWorkflowOrchestrationEnabled).mockResolvedValue(true);
    vi.mocked(isWorkflowRuntimeEnabled).mockResolvedValue(true);
    vi.mocked(getWorkflowShadowExecutionFlag).mockResolvedValue({ enabled: true, shadow: true });
    vi.mocked(insertWorkflowExecution).mockResolvedValue({
      inserted: true,
      row: {
        id: 'wf-1',
        workflow_key: 'orch.test',
        execution_id: 'exec-orch',
        correlation_id: 'c-orch',
        tenant_id: null,
        status: 'pending',
        started_at: new Date().toISOString(),
        completed_at: null,
        failed_at: null,
        payload_json: {},
        metadata_json: {},
        dry_run: true,
        shadow_mode: true,
      },
    });
  });

  it('startWorkflow delegates to shadow execution', async () => {
    const result = await startWorkflow({
      workflowKey: 'onboarding.signup.shadow',
      correlationId: 'c-orch',
    });
    expect(result.outcome).toBe('shadow_executed');
  });

  it('scheduleStep creates automation job', async () => {
    vi.mocked(findWorkflowExecutionByExecutionId).mockResolvedValue({
      id: 'wf-1',
      workflow_key: 'k',
      execution_id: 'exec-1',
      correlation_id: 'c',
      tenant_id: null,
      status: 'running',
      started_at: new Date().toISOString(),
      completed_at: null,
      failed_at: null,
      payload_json: {},
      metadata_json: {},
      dry_run: true,
      shadow_mode: true,
    });
    const { scheduled, jobId } = await scheduleStep({
      executionId: 'exec-1',
      stepKey: 'notify',
      correlationId: 'c',
    });
    expect(scheduled).toBe(true);
    expect(jobId).toBe('job-1');
  });

  it('cancelWorkflow updates status', async () => {
    await cancelWorkflow({ executionId: 'exec-1', correlationId: 'c' });
    expect(updateWorkflowExecutionStatus).toHaveBeenCalledWith(
      'exec-1',
      'cancelled',
      expect.objectContaining({ metadata: expect.any(Object) }),
    );
  });
});

describe('outboxWorkflowBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWorkflowBridgeEnabled).mockResolvedValue(true);
    vi.mocked(isWorkflowPassiveConsumersEnabled).mockResolvedValue(true);
    vi.mocked(isWorkflowOrchestrationEnabled).mockResolvedValue(true);
    vi.mocked(isWorkflowRuntimeEnabled).mockResolvedValue(true);
    vi.mocked(isWorkflowSagaFoundationEnabled).mockResolvedValue(true);
    vi.mocked(getWorkflowShadowExecutionFlag).mockResolvedValue({ enabled: true, shadow: true });
    vi.mocked(insertWorkflowExecution).mockResolvedValue({
      inserted: true,
      row: {
        id: 'wf-bridge',
        workflow_key: 'support.ticket.created.shadow',
        execution_id: 'bridge:idem-1',
        correlation_id: 'corr-1',
        tenant_id: 'tenant-1',
        status: 'pending',
        started_at: new Date().toISOString(),
        completed_at: null,
        failed_at: null,
        payload_json: {},
        metadata_json: {},
        dry_run: true,
        shadow_mode: true,
      },
    });
  });

  it('maps ticket.created to workflow key', () => {
    expect(workflowKeyForOutboxEvent('ticket.created')).toBe('support.ticket.created.shadow');
  });

  it('bridges outbox event to shadow workflow', async () => {
    const result = await bridgeOutboxEventToWorkflow(baseEvent, { shadow: true, workerId: 'w-1' });
    expect(result.bridged).toBe(true);
    expect(result.workflowKey).toContain('support.ticket');
  });
});

describe('sagaFoundation', () => {
  beforeEach(() => {
    vi.mocked(isWorkflowSagaFoundationEnabled).mockResolvedValue(true);
  });

  it('starts saga in shadow mode', async () => {
    const result = await startSagaFoundation({
      sagaKey: 'onboarding.saga',
      correlationId: 'corr-saga',
    });
    expect(result.sagaId).toBe('saga-1');
    expect(result.shadow).toBe(true);
  });
});
