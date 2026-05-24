import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { chatService } from '@/services/chat';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import { CHAT_NAV_UNREAD_REFRESH_EVENT } from '@/lib/chatNavUnreadEvents';

const POLL_MS = 120_000;
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

  const refresh = useCallback(async () => {
    if (!enabled || !user?.id) {
      setCount(0);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const instances = await chatService.listInstances();
      const ids = instances
        .filter((inst) => (inst.metadata as Record<string, unknown> | null | undefined)?.enabled_in_chat !== false)
        .map((i) => i.id);
      if (ids.length === 0) {
        setCount(0);
        return;
      }
      const inboxScope = user.tenant_id ? ('tenant' as const) : ('owner' as const);
      const c = await chatService.getConversationAttendanceCounts({
        instanceIds: ids,
        inboxScope,
      });
      setCount(typeof c.unread === 'number' ? c.unread : 0);
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
    if (!enabled) return;
    const onRefresh = () => scheduleRefresh();
    window.addEventListener(CHAT_NAV_UNREAD_REFRESH_EVENT, onRefresh);
    window.addEventListener(REALTIME_WINDOW_EVENTS.messageCreated, onRefresh);
    window.addEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onRefresh);
    window.addEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onRefresh);
    const t = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      window.removeEventListener(CHAT_NAV_UNREAD_REFRESH_EVENT, onRefresh);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.messageCreated, onRefresh);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onRefresh);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onRefresh);
      window.clearInterval(t);
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [enabled, refresh, scheduleRefresh]);

  return count;
}
