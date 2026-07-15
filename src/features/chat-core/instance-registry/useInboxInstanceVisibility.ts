/**
 * Hook — lê o snapshot compartilhado de Instance Visibility (Sprint 1 / 10F).
 */

import { useCallback, useSyncExternalStore } from 'react';
import {
  getInboxInstanceVisibilitySnapshot,
  subscribeInboxInstanceVisibility,
  type InboxInstanceVisibilitySnapshot,
} from '../instance-registry/inboxVisibility';

const serverSnapshot: InboxInstanceVisibilitySnapshot = {
  instances: Object.freeze([]),
  enabledInstanceIds: Object.freeze([]),
  loading: false,
  lastResolvedAt: 0,
};

export function useInboxInstanceVisibility(): InboxInstanceVisibilitySnapshot {
  const subscribe = useCallback((onStoreChange: () => void) => {
    return subscribeInboxInstanceVisibility(onStoreChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    getInboxInstanceVisibilitySnapshot,
    () => serverSnapshot,
  );
}
