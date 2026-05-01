import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import {
  KANBAN_CONVERSATION_UNREAD_BRIDGE_EVENT,
  type KanbanConversationUnreadBridgeDetail,
} from '@/lib/kanbanConversationUnreadBridge';
import type { ChatKanbanBoardCard } from '@/services/chatKanban';

type ConversationUpdatedDetail = {
  conversation_id?: string;
  unread_count?: number;
  last_message_preview?: string | null;
  last_message_at?: string | Date | null;
  display_name?: string | null;
  avatar_url?: string | null;
  assigned_user_id?: string | null;
  assigned_team_id?: string | null;
};

type MessageCreatedDetail = {
  conversation_id?: string;
  direction?: string;
};

const PULSE_MS = 4500;

/**
 * Atualiza cartões do quadro via WS (eventos na janela) e aplica pulse breve em mensagem recebida.
 */
export function useKanbanBoardRealtimeCards(
  enabled: boolean,
  cards: ChatKanbanBoardCard[],
  setCards: Dispatch<SetStateAction<ChatKanbanBoardCard[]>>,
): { pulseUnreadUntilByConversationId: Record<string, number> } {
  const [pulseUnreadUntilByConversationId, setPulseUnreadUntilByConversationId] = useState<
    Record<string, number>
  >({});

  const idsRef = useRef<Set<string>>(new Set());
  const pendingPulseTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    idsRef.current = new Set(cards.map((c) => c.conversation_id));
  }, [cards]);

  useEffect(() => {
    const clearPulseTimers = () => {
      pendingPulseTimersRef.current.forEach((t) => clearTimeout(t));
      pendingPulseTimersRef.current.clear();
    };

    const schedulePulseClear = (conversationId: string, until: number) => {
      const prevT = pendingPulseTimersRef.current.get(conversationId);
      if (prevT) clearTimeout(prevT);
      const t = setTimeout(() => {
        pendingPulseTimersRef.current.delete(conversationId);
        setPulseUnreadUntilByConversationId((p) => {
          if (p[conversationId] !== until) return p;
          const next = { ...p };
          delete next[conversationId];
          return next;
        });
      }, PULSE_MS + 120);
      pendingPulseTimersRef.current.set(conversationId, t);
    };

    const bumpPulse = (conversationId: string) => {
      const until = Date.now() + PULSE_MS;
      setPulseUnreadUntilByConversationId((prev) => ({ ...prev, [conversationId]: until }));
      schedulePulseClear(conversationId, until);
    };

    if (!enabled) {
      return clearPulseTimers;
    }

    const onConversationUpdated = (ev: Event) => {
      const d = (ev as CustomEvent<ConversationUpdatedDetail>).detail;
      if (!d || typeof d.conversation_id !== 'string') return;
      if (!idsRef.current.has(d.conversation_id)) return;
      if (typeof d.unread_count !== 'number') return;

      const lmAt =
        d.last_message_at != null && d.last_message_at !== ''
          ? typeof d.last_message_at === 'string'
            ? d.last_message_at
            : new Date(d.last_message_at).toISOString()
          : undefined;

      let unreadIncreased = false;
      setCards((prev) =>
        prev.map((c) => {
          if (c.conversation_id !== d.conversation_id) return c;
          const prevUnread = Math.max(0, Number(c.conv_unread_count ?? 0));
          if (d.unread_count > prevUnread) unreadIncreased = true;
          return {
            ...c,
            conv_unread_count: d.unread_count,
            ...(d.last_message_preview !== undefined && d.last_message_preview !== null
              ? { conv_last_message_preview: d.last_message_preview }
              : {}),
            ...(lmAt ? { conv_last_message_at: lmAt } : {}),
            ...(d.display_name !== undefined && d.display_name !== null
              ? { conv_display_name: d.display_name }
              : {}),
            ...(d.avatar_url !== undefined ? { conv_avatar_url: d.avatar_url } : {}),
            ...(d.assigned_user_id !== undefined
              ? { conv_assigned_to_user_id: d.assigned_user_id }
              : {}),
            ...(d.assigned_team_id !== undefined ? { conv_assigned_team_id: d.assigned_team_id } : {}),
          };
        }),
      );
      if (unreadIncreased) queueMicrotask(() => bumpPulse(d.conversation_id));
    };

    const onMessageCreated = (ev: Event) => {
      const d = (ev as CustomEvent<MessageCreatedDetail>).detail;
      if (!d || typeof d.conversation_id !== 'string') return;
      if (String(d.direction ?? '').toLowerCase() !== 'incoming') return;
      if (!idsRef.current.has(d.conversation_id)) return;
      bumpPulse(d.conversation_id);
    };

    const onBridgeUnread = (ev: Event) => {
      const d = (ev as CustomEvent<KanbanConversationUnreadBridgeDetail>).detail;
      if (!d?.conversationId || typeof d.unreadCount !== 'number') return;
      if (!idsRef.current.has(d.conversationId)) return;
      setCards((prev) =>
        prev.map((c) =>
          c.conversation_id === d.conversationId ? { ...c, conv_unread_count: d.unreadCount } : c,
        ),
      );
    };

    window.addEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onConversationUpdated);
    window.addEventListener(REALTIME_WINDOW_EVENTS.messageCreated, onMessageCreated);
    window.addEventListener(KANBAN_CONVERSATION_UNREAD_BRIDGE_EVENT, onBridgeUnread);

    return () => {
      window.removeEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onConversationUpdated);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.messageCreated, onMessageCreated);
      window.removeEventListener(KANBAN_CONVERSATION_UNREAD_BRIDGE_EVENT, onBridgeUnread);
      clearPulseTimers();
    };
  }, [enabled, setCards]);

  return { pulseUnreadUntilByConversationId };
}
