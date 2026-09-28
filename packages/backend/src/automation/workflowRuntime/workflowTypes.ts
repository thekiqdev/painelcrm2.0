export type WorkflowExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type WorkflowExecutionRow = {
  id: string;
  workflow_key: string;
  execution_id: string;
  correlation_id: string;
  tenant_id: string | null;
  status: WorkflowExecutionStatus;
  started_at: string;
  completed_at: string | null;
  failed_at: string | null;
  payload_json: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
  dry_run: boolean;
  shadow_mode: boolean;
};

export type ExecuteWorkflowInput = {
  workflowKey: string;
  correlationId: string;
  tenantId?: string | null;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  dryRun?: boolean;
  shadowMode?: boolean;
  triggerEventKey?: string;
  idempotencyKey?: string;
};

export type ExecuteWorkflowResult = {
  outcome: 'skipped' | 'shadow_executed' | 'executed' | 'failed';
  executionId?: string;
  workflowExecutionId?: string;
  status?: WorkflowExecutionStatus;
  shadow?: boolean;
  reason?: string;
  error?: string;
};

export type AutomationJobStatus = 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled';

export type SagaInstanceStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'compensating'
  | 'failed'
  | 'cancelled';
