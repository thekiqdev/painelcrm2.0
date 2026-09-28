/**
 * Sprint 3 / Phase 10G — métricas DEV do open pipeline.
 * Memória only; sem endpoint.
 */

export type OpenConversationPipelineMetricsSnapshot = {
  open_start_total: number;
  open_coalesced_total: number;
  open_stale_abort_total: number;
  open_applied_total: number;
  open_generation_supersede_total: number;
};

const state: OpenConversationPipelineMetricsSnapshot = {
  open_start_total: 0,
  open_coalesced_total: 0,
  open_stale_abort_total: 0,
  open_applied_total: 0,
  open_generation_supersede_total: 0,
};

export function recordOpenPipelineStart(by = 1): void {
  state.open_start_total += by;
}

export function recordOpenPipelineCoalesced(by = 1): void {
  state.open_coalesced_total += by;
}

export function recordOpenPipelineStaleAbort(by = 1): void {
  state.open_stale_abort_total += by;
}

export function recordOpenPipelineApplied(by = 1): void {
  state.open_applied_total += by;
}

export function recordOpenPipelineGenerationSupersede(by = 1): void {
  state.open_generation_supersede_total += by;
}

export function getOpenConversationPipelineMetricsSnapshot(): Readonly<OpenConversationPipelineMetricsSnapshot> {
  return { ...state };
}

export function resetOpenConversationPipelineMetricsForTests(): void {
  state.open_start_total = 0;
  state.open_coalesced_total = 0;
  state.open_stale_abort_total = 0;
  state.open_applied_total = 0;
  state.open_generation_supersede_total = 0;
}

/**
 * Ordem oficial Store ON:
 * select (UI) → loadMessagesCommand → Message Store (+ Preview sync 10D) → selectors → UI
 */
export const OPEN_CONVERSATION_PIPELINE_ORDER = [
  'select',
  'loadMessagesCommand',
  'messageStore',
  'previewSync',
  'selectors',
  'ui',
] as const;
