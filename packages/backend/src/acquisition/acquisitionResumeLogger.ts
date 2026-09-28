type Payload = Record<string, unknown>;

function emit(msg: string, payload: Payload = {}): void {
  console.log(JSON.stringify({ prefix: '[acquisition-resume]', msg, ...payload, ts: new Date().toISOString() }));
}

export function logResumeDetected(payload: {
  lead_id: string;
  current_stage: string;
  resume_path?: string;
  resume_verified?: boolean;
}): void {
  emit('resume_detected', payload);
}

export function logResumeReconciled(payload: {
  lead_id: string;
  previous_stage: string;
  corrected_stage: string;
  reason: string;
}): void {
  emit('resume_reconciled', payload);
}

export function logResumeRedirect(payload: { lead_id: string; destination: string }): void {
  emit('resume_redirect', payload);
}
