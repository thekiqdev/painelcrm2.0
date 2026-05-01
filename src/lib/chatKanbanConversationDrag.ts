/** Drag nativo (HTML5) de conversa → coluna Kanban; funciona com janela flutuante sobre o quadro. */

import { removeConversationDragPreview } from '@/lib/conversationDragPreview';

export const PAINELCRM_CONVERSATION_DRAG_MIME = 'application/x-painelcrm-conversation';

export type PainelcrmConversationDragPayload = {
  type: 'conversation';
  conversationId: string;
  hasClient: boolean;
  hasLead: boolean;
};

let activeSession: PainelcrmConversationDragPayload | null = null;

export function getActiveConversationDrag(): PainelcrmConversationDragPayload | null {
  return activeSession;
}

export function isNativeConversationDragActive(): boolean {
  return activeSession != null;
}

/** `dragOver` / `dataTransfer.types` (MIME definido no `setData` do `dragStart`). */
export function dataTransferHasConversationDragMime(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  try {
    return Array.from(dataTransfer.types as unknown as string[]).includes(
      PAINELCRM_CONVERSATION_DRAG_MIME,
    );
  } catch {
    return false;
  }
}

export function beginConversationDragSession(
  dataTransfer: DataTransfer,
  payload: PainelcrmConversationDragPayload,
): void {
  activeSession = payload;
  try {
    dataTransfer.setData(PAINELCRM_CONVERSATION_DRAG_MIME, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  dataTransfer.effectAllowed = 'copy';
}

export function endConversationDragSession(): void {
  activeSession = null;
  removeConversationDragPreview();
  try {
    window.dispatchEvent(new CustomEvent('painelcrm:conversation-drag-end'));
  } catch {
    /* ignore */
  }
}

export function readConversationDragFromDataTransfer(
  dataTransfer: DataTransfer | null,
): PainelcrmConversationDragPayload | null {
  if (!dataTransfer) return activeSession;
  try {
    const raw = dataTransfer.getData(PAINELCRM_CONVERSATION_DRAG_MIME);
    if (raw) {
      const o = JSON.parse(raw) as Partial<PainelcrmConversationDragPayload>;
      if (o?.type === 'conversation' && typeof o.conversationId === 'string') {
        return {
          type: 'conversation',
          conversationId: o.conversationId,
          hasClient: Boolean(o.hasClient),
          hasLead: Boolean(o.hasLead),
        };
      }
    }
  } catch {
    /* ignore */
  }
  return activeSession;
}
