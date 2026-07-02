/**
 * Billing Engine V2 — Sprint 3.0E: [PIPELINE_CERTIFICATION] logs.
 */
import { billingLog } from '../../../services/billingLogger.js';

type PipelineLogPayload = Record<string, string | number | boolean | undefined | null>;

function sanitize(payload: PipelineLogPayload): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== null) out[key] = value;
  }
  return out;
}

export function logPipelineCertification(
  tag: 'PIPELINE_CERTIFICATION' | 'PIPELINE_COMPARE' | 'PIPELINE_GATE' | 'PIPELINE_RESULT',
  event: string,
  payload: PipelineLogPayload = {}
): void {
  billingLog('job', `[${tag}] ${event}`, sanitize(payload));
}
