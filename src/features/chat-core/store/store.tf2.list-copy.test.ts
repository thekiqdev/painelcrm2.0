/**
 * Sprint TF2 — conversation list copy contract.
 */

import { describe, it, expect } from 'vitest';
import {
  CONVERSATION_LIST_EMPTY_PREVIEW,
  CONVERSATION_LIST_EMPTY_TIME,
  conversationListPreviewText,
  conversationListTimeLabel,
} from '../ui/conversationListCopy';

describe('TF2 conversation list copy', () => {
  it('preview empty uses empty-preview string once', () => {
    expect(conversationListPreviewText(null)).toBe(CONVERSATION_LIST_EMPTY_PREVIEW);
    expect(conversationListPreviewText('  ')).toBe(CONVERSATION_LIST_EMPTY_PREVIEW);
  });

  it('preview with text does not use empty-preview', () => {
    expect(conversationListPreviewText('to contando os dias')).toBe('to contando os dias');
  });

  it('time without At is neutral dash — never empty-preview', () => {
    expect(conversationListTimeLabel(null, () => 'há 2 min')).toBe(CONVERSATION_LIST_EMPTY_TIME);
    expect(conversationListTimeLabel(undefined, () => 'há 2 min')).toBe(CONVERSATION_LIST_EMPTY_TIME);
    expect(CONVERSATION_LIST_EMPTY_TIME).not.toBe(CONVERSATION_LIST_EMPTY_PREVIEW);
  });

  it('time with At uses formatter', () => {
    expect(conversationListTimeLabel('2026-07-15T12:00:00.000Z', () => 'há 1 hora')).toBe('há 1 hora');
  });
});
