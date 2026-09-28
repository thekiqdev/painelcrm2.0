/**
 * Sprint 6 / Phase 11 — cache precedence Runtime Core declaration helpers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import {
  getChatPrimaryCacheLayer,
  shouldReactQueryOwnChatThread,
  shouldReactQueryOwnConversationMeta,
  isChatStoreOffLegacyPathActive,
  shouldIndexedDbActAsSourceOfTruth,
  PHASE11_LEGACY_RETIREMENT_DOC,
} from '../runtime/cachePrecedence';

describe('Phase 11 cache precedence', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
  });

  it('Store ON → domain-store primary; RQ does not own thread/meta', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    expect(getChatPrimaryCacheLayer()).toBe('domain-store');
    expect(shouldReactQueryOwnChatThread()).toBe(false);
    expect(shouldReactQueryOwnConversationMeta()).toBe(false);
    expect(isChatStoreOffLegacyPathActive()).toBe(false);
  });

  it('Store OFF → react-query primary; legacy path active', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    expect(getChatPrimaryCacheLayer()).toBe('react-query');
    expect(shouldReactQueryOwnChatThread()).toBe(true);
    expect(shouldReactQueryOwnConversationMeta()).toBe(true);
    expect(isChatStoreOffLegacyPathActive()).toBe(true);
  });

  it('IndexedDB never SoT; retirement doc points to MB-028', () => {
    expect(shouldIndexedDbActAsSourceOfTruth()).toBe(false);
    expect(PHASE11_LEGACY_RETIREMENT_DOC.adr).toBe('ADR-013');
    expect(PHASE11_LEGACY_RETIREMENT_DOC.physicalRemoval).toContain('MB-028');
  });
});
