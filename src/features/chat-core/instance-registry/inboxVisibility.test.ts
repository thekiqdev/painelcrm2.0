/**
 * Sprint 1 / Phase 10F — Instance Visibility Unification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applyInboxInstanceVisibilityFromInstances,
  getInboxInstanceVisibilitySnapshot,
  refreshInboxInstanceVisibility,
  resetInboxInstanceVisibilityForTests,
  subscribeInboxInstanceVisibility,
} from './inboxVisibility';
import { filterEnabledChatInstanceIds } from './helpers';
import type { ChatInstance } from '@/services/chat';

vi.mock('./registry', () => ({
  ensureChatInstances: vi.fn(async () => [
    {
      id: 'a',
      status: 'connected',
      metadata: { enabled_in_chat: true },
    },
    {
      id: 'b',
      status: 'close',
      metadata: { enabled_in_chat: false },
    },
    {
      id: 'c',
      status: 'open',
      metadata: {},
    },
  ] as ChatInstance[]),
  invalidateChatInstanceRegistry: vi.fn(),
}));

describe('inboxVisibility (Sprint 1 / 10F)', () => {
  beforeEach(() => {
    resetInboxInstanceVisibilityForTests();
  });

  afterEach(() => {
    resetInboxInstanceVisibilityForTests();
    vi.clearAllMocks();
  });

  it('filterEnabledChatInstanceIds ignores connected — only enabled', () => {
    const rows = [
      { id: 'x', status: 'close', metadata: { enabled_in_chat: true } },
      { id: 'y', status: 'connected', metadata: { enabled_in_chat: false } },
    ] as ChatInstance[];
    expect(filterEnabledChatInstanceIds(rows)).toEqual(['x']);
  });

  it('refreshInboxInstanceVisibility publishes sorted enabled ids', async () => {
    const snap = await refreshInboxInstanceVisibility({ reason: 'bootstrap' });
    expect(snap.enabledInstanceIds).toEqual(['a', 'c']);
    expect(getInboxInstanceVisibilitySnapshot().enabledInstanceIds).toEqual(['a', 'c']);
  });

  it('subscribers are notified on refresh', async () => {
    const seen: number[] = [];
    const unsub = subscribeInboxInstanceVisibility(() => {
      seen.push(getInboxInstanceVisibilitySnapshot().enabledInstanceIds.length);
    });
    await refreshInboxInstanceVisibility({ reason: 'bootstrap' });
    unsub();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(2);
  });

  it('applyInboxInstanceVisibilityFromInstances shares same filter as refresh', () => {
    const snap = applyInboxInstanceVisibilityFromInstances([
      { id: 'z2', status: 'connected', metadata: { enabled_in_chat: true } },
      { id: 'z1', status: 'open', metadata: { enabled_in_chat: true } },
    ] as ChatInstance[]);
    expect(snap.enabledInstanceIds).toEqual(['z1', 'z2']);
  });
});
