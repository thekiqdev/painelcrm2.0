/**
 * MB-089 — unit tests Preview↔Messages metrics.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPreviewMessagesMetricsSnapshot,
  recordConversationPreviewRebuilt,
  recordHydrateGenerationMismatch,
  recordMessageAppend,
  recordMessageWithoutPreview,
  recordPreviewThreadDivergence,
  recordPreviewWithoutMessage,
  resetPreviewMessagesMetricsForTests,
} from './previewMessagesMetrics';

describe('previewMessagesMetrics', () => {
  beforeEach(() => {
    resetPreviewMessagesMetricsForTests();
  });

  it('increments counters', () => {
    recordPreviewWithoutMessage();
    recordMessageWithoutPreview();
    recordPreviewThreadDivergence({
      conversationId: 'c1',
      storePreview: 'a',
      threadPreview: 'b',
    });
    recordConversationPreviewRebuilt();
    recordMessageAppend();
    recordHydrateGenerationMismatch();
    const snap = getPreviewMessagesMetricsSnapshot();
    expect(snap.preview_without_message_total).toBe(1);
    expect(snap.message_without_preview_total).toBe(1);
    expect(snap.preview_thread_divergence_total).toBe(1);
    expect(snap.conversation_preview_rebuilt_total).toBe(1);
    expect(snap.message_append_total).toBe(1);
    expect(snap.hydrate_generation_mismatch_total).toBe(1);
  });
});
