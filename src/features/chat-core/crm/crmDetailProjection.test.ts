/**
 * Sprint 4 / Phase 10H — CRM detail projection vs Conversation link SoT.
 */

import { describe, it, expect } from 'vitest';
import {
  conversationCrmProfileQueryKey,
  reconcileCrmDetailWithConversationLink,
  resolveCrmLinkKind,
} from './crmDetailProjection';

describe('crmDetailProjection (Sprint 4 / 10H)', () => {
  it('resolveCrmLinkKind prefers client over lead', () => {
    expect(resolveCrmLinkKind('c1', 'l1')).toBe('client');
    expect(resolveCrmLinkKind(null, 'l1')).toBe('lead');
    expect(resolveCrmLinkKind(null, null)).toBe('none');
  });

  it('clears projection when Conversation SoT has no link', () => {
    const r = reconcileCrmDetailWithConversationLink({
      conversationClientId: null,
      conversationLeadId: null,
      currentClient: { id: 'c1' },
      currentLead: null,
    });
    expect(r.linkKind).toBe('none');
    expect(r.nextClient).toBeNull();
    expect(r.shouldFetchProfile).toBe(false);
    expect(r.clearedMismatch).toBe(true);
  });

  it('drops mismatched client id when SoT points elsewhere', () => {
    const r = reconcileCrmDetailWithConversationLink({
      conversationClientId: 'c2',
      conversationLeadId: null,
      currentClient: { id: 'c1' },
      currentLead: { id: 'l1' },
    });
    expect(r.linkKind).toBe('client');
    expect(r.nextClient).toBeNull();
    expect(r.nextLead).toBeNull();
    expect(r.shouldFetchProfile).toBe(true);
    expect(r.clearedMismatch).toBe(true);
  });

  it('keeps matching lead projection soft-hold', () => {
    const lead = { id: 'l1', name: 'Ada' };
    const r = reconcileCrmDetailWithConversationLink({
      conversationClientId: null,
      conversationLeadId: 'l1',
      currentClient: null,
      currentLead: lead,
    });
    expect(r.nextLead).toBe(lead);
    expect(r.clearedMismatch).toBe(false);
    expect(r.shouldFetchProfile).toBe(true);
  });

  it('query key includes link SoT ids', () => {
    expect(conversationCrmProfileQueryKey('conv', 'c1', null)).toEqual([
      'floating-chat',
      'conversation-crm-profile',
      'conv',
      'c1',
      null,
    ]);
  });
});
