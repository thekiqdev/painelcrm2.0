/**
 * MB-076 — métricas DEV Phase 10B (Conversation runtime unification).
 * Contadores in-memory; sem alteração de contratos/flags.
 */

export type ConversationRuntimeMetricsSnapshot = {
  conversation_updates_total: number;
  conversation_store_updates: number;
  conversation_normalizations: number;
  conversation_mapper_calls: number;
  conversation_duplicate_detected: number;
  conversation_selector_updates: number;
  conversation_ui_updates: number;
};

const state: ConversationRuntimeMetricsSnapshot = {
  conversation_updates_total: 0,
  conversation_store_updates: 0,
  conversation_normalizations: 0,
  conversation_mapper_calls: 0,
  conversation_duplicate_detected: 0,
  conversation_selector_updates: 0,
  conversation_ui_updates: 0,
};

function enabled(): boolean {
  try {
    return import.meta.env.DEV === true || import.meta.env.MODE === 'test';
  } catch {
    return false;
  }
}

export function recordConversationUpdate(by = 1): void {
  state.conversation_updates_total += by;
}

export function recordConversationStoreUpdate(by = 1): void {
  state.conversation_store_updates += by;
  state.conversation_updates_total += by;
}

export function recordConversationNormalization(by = 1): void {
  state.conversation_normalizations += by;
}

export function recordConversationMapperCall(by = 1): void {
  state.conversation_mapper_calls += by;
}

export function recordConversationSelectorUpdate(by = 1): void {
  state.conversation_selector_updates += by;
}

export function recordConversationUiUpdate(by = 1): void {
  state.conversation_ui_updates += by;
}

export type ConversationDivergenceLog = {
  conversationId: string;
  pipeline: string;
  origin: string;
  storeVersion: string;
  uiVersion: string;
  diff: string[];
};

/** Detecta divergência leadId/clientId/preview entre domain e raw/UI. */
export function recordConversationDivergenceIfAny(input: {
  conversationId: string;
  pipeline: string;
  origin: string;
  storeLeadId: string | null | undefined;
  uiLeadId: string | null | undefined;
  storeClientId: string | null | undefined;
  uiClientId: string | null | undefined;
  storePreview: string | null | undefined;
  uiPreview: string | null | undefined;
}): void {
  const diff: string[] = [];
  if ((input.storeLeadId ?? null) !== (input.uiLeadId ?? null)) {
    diff.push(`leadId store=${input.storeLeadId ?? 'null'} ui=${input.uiLeadId ?? 'null'}`);
  }
  if ((input.storeClientId ?? null) !== (input.uiClientId ?? null)) {
    diff.push(`client_id store=${input.storeClientId ?? 'null'} ui=${input.uiClientId ?? 'null'}`);
  }
  if ((input.storePreview ?? '') !== (input.uiPreview ?? '')) {
    diff.push('lastMessagePreview mismatch');
  }
  if (diff.length === 0) return;

  state.conversation_duplicate_detected += 1;
  if (!enabled()) return;
  const payload: ConversationDivergenceLog = {
    conversationId: input.conversationId,
    pipeline: input.pipeline,
    origin: input.origin,
    storeVersion: `lead=${input.storeLeadId ?? ''}|client=${input.storeClientId ?? ''}|prev=${input.storePreview ?? ''}`,
    uiVersion: `lead=${input.uiLeadId ?? ''}|client=${input.uiClientId ?? ''}|prev=${input.uiPreview ?? ''}`,
    diff,
  };
  console.warn('[Conversation Divergence Detected]', payload);
}

export function getConversationRuntimeMetricsSnapshot(): Readonly<ConversationRuntimeMetricsSnapshot> {
  return { ...state };
}

export function resetConversationRuntimeMetricsForTests(): void {
  state.conversation_updates_total = 0;
  state.conversation_store_updates = 0;
  state.conversation_normalizations = 0;
  state.conversation_mapper_calls = 0;
  state.conversation_duplicate_detected = 0;
  state.conversation_selector_updates = 0;
  state.conversation_ui_updates = 0;
}
