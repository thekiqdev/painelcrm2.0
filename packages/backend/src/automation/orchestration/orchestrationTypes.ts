export type OrchestrationStepStatus = 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled';

export type StartWorkflowInput = {
  workflowKey: string;
  correlationId: string;
  tenantId?: string | null;
  payload?: Record<string, unknown>;
  triggerEventKey?: string;
  idempotencyKey?: string;
};

export type ScheduleStepInput = {
  executionId: string;
  stepKey: string;
  correlationId: string;
  tenantId?: string | null;
  delayMs?: number;
  payload?: Record<string, unknown>;
};

export type StepMutationInput = {
  executionId: string;
  stepKey: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
  error?: string;
};
