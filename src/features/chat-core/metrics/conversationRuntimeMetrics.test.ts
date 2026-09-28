import { describe, expect, it, beforeEach } from 'vitest';
import {
  getConversationRuntimeMetricsSnapshot,
  recordConversationDivergenceIfAny,
  recordConversationStoreUpdate,
  resetConversationRuntimeMetricsForTests,
} from './conversationRuntimeMetrics';

describe('conversationRuntimeMetrics (Phase 10B)', () => {
  beforeEach(() => {
    resetConversationRuntimeMetricsForTests();
  });

  it('counts store updates', () => {
    recordConversationStoreUpdate(2);
    expect(getConversationRuntimeMetricsSnapshot().conversation_store_updates).toBe(2);
    expect(getConversationRuntimeMetricsSnapshot().conversation_updates_total).toBe(2);
  });

  it('detects leadId divergence', () => {
    recordConversationDivergenceIfAny({
      conversationId: 'c1',
      pipeline: 'test',
      origin: 'unit',
      storeLeadId: 'L1',
      uiLeadId: null,
      storeClientId: null,
      uiClientId: null,
      storePreview: 'a',
      uiPreview: 'a',
    });
    expect(getConversationRuntimeMetricsSnapshot().conversation_duplicate_detected).toBe(1);
  });
});
