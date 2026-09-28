type Payload = Record<string, unknown>;

function emit(prefix: string, msg: string, payload: Payload = {}): void {
  console.log(JSON.stringify({ prefix, msg, ...payload, ts: new Date().toISOString() }));
}

export function logWorkflow(msg: string, payload?: Payload): void {
  emit('[WORKFLOW]', msg, payload);
}

export function logWorkflowExecution(msg: string, payload?: Payload): void {
  emit('[WORKFLOW_EXECUTION]', msg, payload);
}

export function logWorkflowStep(msg: string, payload?: Payload): void {
  emit('[WORKFLOW_STEP]', msg, payload);
}

export function logSaga(msg: string, payload?: Payload): void {
  emit('[SAGA]', msg, payload);
}

export function logOrchestration(msg: string, payload?: Payload): void {
  emit('[ORCHESTRATION]', msg, payload);
}

export function logPassiveConsumer(msg: string, payload?: Payload): void {
  emit('[PASSIVE_CONSUMER]', msg, payload);
}

export function logAutomationJob(msg: string, payload?: Payload): void {
  emit('[AUTOMATION_JOB]', msg, payload);
}
