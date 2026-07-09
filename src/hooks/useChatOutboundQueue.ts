import { useCallback, useRef, type MutableRefObject } from 'react';
import { chatService, type ChatMessage } from '@/services/chat';
import { bridgeSendMessage } from '@/features/chat-core/core/chatCommandBridge';

export type ChatReplySnap = {
  messageId: string;
  preview: string;
  senderName: string;
};

type QueueItem = {
  clientMessageId: string;
  text: string;
  optimisticLocalId: string;
  replyToMessageId?: string;
  replyPreview?: string;
  replySenderName?: string;
};

/**
 * Fila de envio por conversa: uma mensagem de cada vez ao provider, sem bloquear o composer.
 * `applyMessages` deve aceitar atualizações funcionais na lista atual de mensagens.
 */
export function useChatOutboundQueue(options: {
  conversationId: string | null;
  applyMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  pendingWsFifoRef: MutableRefObject<string[]>;
  afterItemDone?: () => void;
}) {
  const { conversationId, applyMessages, pendingWsFifoRef, afterItemDone } = options;
  const queuesRef = useRef<Map<string, QueueItem[]>>(new Map());
  const drainingRef = useRef<Set<string>>(new Set());

  const drain = useCallback(
    async (cid: string) => {
      if (drainingRef.current.has(cid)) return;
      drainingRef.current.add(cid);
      try {
        for (;;) {
          const q = queuesRef.current.get(cid);
          if (!q?.length) break;
          const item = q[0];
          const { optimisticLocalId, clientMessageId, text } = item;

          applyMessages((prev) =>
            prev.map((m) => (m.id === optimisticLocalId ? { ...m, status: 'sending' } : m)),
          );

          try {
            const { message: serverMsg } = await bridgeSendMessage(cid, text, {
              replyToMessageId: item.replyToMessageId,
              clientMessageId,
              optimisticId: optimisticLocalId,
            });
            pendingWsFifoRef.current = pendingWsFifoRef.current.filter((id) => id !== optimisticLocalId);
            if (serverMsg) {
              applyMessages((prev) => {
                const withoutOpt = prev.filter((m) => m.id !== optimisticLocalId);
                if (withoutOpt.some((m) => m.id === serverMsg.id)) return withoutOpt;
                return [...withoutOpt, serverMsg];
              });
            } else {
              applyMessages((prev) => prev.filter((m) => m.id !== optimisticLocalId));
            }
          } catch (e) {
            pendingWsFifoRef.current = pendingWsFifoRef.current.filter((id) => id !== optimisticLocalId);
            applyMessages((prev) =>
              prev.map((m) =>
                m.id === optimisticLocalId
                  ? {
                      ...m,
                      status: 'failed',
                      metadata: {
                        ...(m.metadata && typeof m.metadata === 'object' ? m.metadata : {}),
                        send_error: e instanceof Error ? e.message : String(e),
                      },
                    }
                  : m,
              ),
            );
          } finally {
            q.shift();
            if (q.length === 0) queuesRef.current.delete(cid);
            afterItemDone?.();
          }
        }
      } finally {
        drainingRef.current.delete(cid);
      }
    },
    [applyMessages, pendingWsFifoRef, afterItemDone],
  );

  const enqueueText = useCallback(
    (text: string, reply: ChatReplySnap | null, conversationIdOverride?: string | null): boolean => {
      const cid = conversationIdOverride ?? conversationId;
      const trimmed = text.trim();
      if (!cid || !trimmed) return false;

      const clientMessageId = crypto.randomUUID();
      const optimisticLocalId = `optimistic-${clientMessageId}`;

      const optimistic: ChatMessage = {
        id: optimisticLocalId,
        conversation_id: cid,
        direction: 'outgoing',
        body: trimmed,
        status: 'queued',
        sentAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
        client_message_id: clientMessageId,
        metadata: { optimistic: true, client_message_id: clientMessageId },
        ...(reply
          ? {
              reply_to_message_id: reply.messageId,
              reply_preview: reply.preview,
              reply_sender_name: reply.senderName,
            }
          : {}),
      };

      pendingWsFifoRef.current = [...pendingWsFifoRef.current, optimisticLocalId];
      applyMessages((prev) => [...prev, optimistic]);

      const item: QueueItem = {
        clientMessageId,
        text: trimmed,
        optimisticLocalId,
        replyToMessageId: reply?.messageId,
        replyPreview: reply?.preview,
        replySenderName: reply?.senderName,
      };
      const arr = queuesRef.current.get(cid) ?? [];
      arr.push(item);
      queuesRef.current.set(cid, arr);

      void drain(cid);
      return true;
    },
    [conversationId, applyMessages, pendingWsFifoRef, drain],
  );

  const retryFailed = useCallback(
    (failedMessage: ChatMessage) => {
      const cid = conversationId;
      if (!cid || failedMessage.direction !== 'outgoing' || failedMessage.status !== 'failed') return;
      const meta = failedMessage.metadata && typeof failedMessage.metadata === 'object'
        ? (failedMessage.metadata as Record<string, unknown>)
        : null;
      const oldClient =
        (typeof meta?.client_message_id === 'string' && meta.client_message_id) ||
        failedMessage.client_message_id ||
        null;
      const text =
        (typeof failedMessage.body === 'string' && failedMessage.body.trim()) ||
        '';
      if (!text) return;

      applyMessages((prev) => prev.filter((m) => m.id !== failedMessage.id));
      pendingWsFifoRef.current = pendingWsFifoRef.current.filter((id) => id !== failedMessage.id);

      const clientMessageId = crypto.randomUUID();
      const optimisticLocalId = `optimistic-${clientMessageId}`;
      const optimistic: ChatMessage = {
        id: optimisticLocalId,
        conversation_id: cid,
        direction: 'outgoing',
        body: text,
        status: 'queued',
        sentAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
        client_message_id: clientMessageId,
        metadata: { optimistic: true, client_message_id: clientMessageId, retry_of: oldClient },
        reply_to_message_id: failedMessage.reply_to_message_id ?? null,
        reply_preview: failedMessage.reply_preview ?? null,
        reply_sender_name: failedMessage.reply_sender_name ?? null,
      };
      pendingWsFifoRef.current = [...pendingWsFifoRef.current, optimisticLocalId];
      applyMessages((prev) => [...prev, optimistic]);

      const item: QueueItem = {
        clientMessageId,
        text,
        optimisticLocalId,
        replyToMessageId: failedMessage.reply_to_message_id ?? undefined,
        replyPreview: failedMessage.reply_preview ?? undefined,
        replySenderName: failedMessage.reply_sender_name ?? undefined,
      };
      const arr = queuesRef.current.get(cid) ?? [];
      arr.push(item);
      queuesRef.current.set(cid, arr);
      void drain(cid);
    },
    [conversationId, applyMessages, pendingWsFifoRef, drain],
  );

  return { enqueueText, retryFailed };
}
