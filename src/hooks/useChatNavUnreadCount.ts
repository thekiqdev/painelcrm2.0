import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  bootstrapChatF3Session,
  ensureChatF3RuntimeWired,
  ensureChatInstances,
  fetchChatAttendanceCounts,
  getChatGlobalUnreadCount,
  shouldUseChatUnreadEngine,
  subscribeChatUnreadEngine,
} from '@/features/chat-core/runtime';
import { filterEnabledChatInstanceIds } from '@/features/chat-core/instance-registry';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import { CHAT_NAV_UNREAD_REFRESH_EVENT } from '@/lib/chatNavUnreadEvents';

const DEBOUNCE_MS = 900;

/**
 * Contagem de conversas com mensagens não lidas (`unread_count > 0`),
 * alinhada ao endpoint `/api/chat/conversations/attendance-counts` (campo `unread`).
 */
export function useChatNavUnreadCount(enabled: boolean): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const debounceRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    bootstrapChatF3Session(user?.id, user?.tenant_id);
  }, [user?.id, user?.tenant_id]);

  const refresh = useCallback(async () => {
    if (!enabled || !user?.id) {
      setCount(0);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    ensureChatF3RuntimeWired();
    try {
      const instances = await ensureChatInstances({ reason: 'bootstrap' });
      const ids = filterEnabledChatInstanceIds(instances);
      if (ids.length === 0) {
        setCount(0);
        return;
      }
      const inboxScope = user.tenant_id ? ('tenant' as const) : ('owner' as const);
      const c = await fetchChatAttendanceCounts(
        { instanceIds: ids, inboxScope },
        { reason: 'bootstrap' },
      );
      setCount(shouldUseChatUnreadEngine() ? getChatGlobalUnreadCount() : c.unread);
    } catch {
      setCount(0);
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled, user?.id, user?.tenant_id]);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void refresh();
    }, DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !shouldUseChatUnreadEngine()) return;
    return subscribeChatUnreadEngine(() => {
      setCount(getChatGlobalUnreadCount());
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const onRealtime = () => {
      if (shouldUseChatUnreadEngine()) {
        setCount(getChatGlobalUnreadCount());
        return;
      }
      scheduleRefresh();
    };

    const onRefresh = () => {
      if (shouldUseChatUnreadEngine()) {
        setCount(getChatGlobalUnreadCount());
        return;
      }
      scheduleRefresh();
    };

    window.addEventListener(CHAT_NAV_UNREAD_REFRESH_EVENT, onRefresh);
    window.addEventListener(REALTIME_WINDOW_EVENTS.messageCreated, onRealtime);
    window.addEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onRealtime);
    window.addEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onRefresh);

    // Phase 9 — sem setInterval: updates via Socket / unread engine / evento manual.

    return () => {
      window.removeEventListener(CHAT_NAV_UNREAD_REFRESH_EVENT, onRefresh);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.messageCreated, onRealtime);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onRealtime);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onRefresh);
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [enabled, refresh, scheduleRefresh]);

  return count;
}
