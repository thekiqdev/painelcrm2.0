/**
 * MB-089 — métricas DEV Phase 10D (Preview ↔ Messages ownership).
 * Contadores in-memory; sem endpoint novo.
 */

export type PreviewMessagesMetricsSnapshot = {
  preview_without_message_total: number;
  message_without_preview_total: number;
  preview_thread_divergence_total: number;
  conversation_preview_rebuilt_total: number;
  message_append_total: number;
  hydrate_generation_mismatch_total: number;
};

const state: PreviewMessagesMetricsSnapshot = {
  preview_without_message_total: 0,
  message_without_preview_total: 0,
  preview_thread_divergence_total: 0,
  conversation_preview_rebuilt_total: 0,
  message_append_total: 0,
  hydrate_generation_mismatch_total: 0,
};

function enabled(): boolean {
  try {
    return import.meta.env.DEV === true || import.meta.env.MODE === 'test';
  } catch {
    return false;
  }
}

export function recordPreviewWithoutMessage(by = 1): void {
  state.preview_without_message_total += by;
}

export function recordMessageWithoutPreview(by = 1): void {
  state.message_without_preview_total += by;
}

export function recordPreviewThreadDivergence(payload?: {
  conversationId: string;
  storePreview: string | null;
  threadPreview: string | null;
}): void {
  state.preview_thread_divergence_total += 1;
  if (!enabled() || !payload) return;
  console.warn('[Preview Thread Divergence]', payload);
}

export function recordConversationPreviewRebuilt(by = 1): void {
  state.conversation_preview_rebuilt_total += by;
}

export function recordMessageAppend(by = 1): void {
  state.message_append_total += by;
}

export function recordHydrateGenerationMismatch(by = 1): void {
  state.hydrate_generation_mismatch_total += by;
}

export function getPreviewMessagesMetricsSnapshot(): Readonly<PreviewMessagesMetricsSnapshot> {
  return { ...state };
}

export function resetPreviewMessagesMetricsForTests(): void {
  state.preview_without_message_total = 0;
  state.message_without_preview_total = 0;
  state.preview_thread_divergence_total = 0;
  state.conversation_preview_rebuilt_total = 0;
  state.message_append_total = 0;
  state.hydrate_generation_mismatch_total = 0;
}
