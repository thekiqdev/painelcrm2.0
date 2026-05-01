import type { DragEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { ChatConversation } from '@/services/chat';
import { resolveConversationIdentity } from '@/utils/chatIdentityDisplay';
import { ConversationDragPreview } from '@/components/chat/ConversationDragPreview';
import type { ConversationDragPreviewModel } from '@/lib/conversationDragPreview.types';

let ghostHost: HTMLDivElement | null = null;
let ghostRoot: Root | null = null;

export function removeConversationDragPreview(): void {
  try {
    ghostRoot?.unmount();
  } catch {
    /* ignore */
  }
  ghostRoot = null;
  ghostHost?.remove();
  ghostHost = null;
}

/**
 * Vista em cartão + `setDragImage` (chamar no `onDragStart`, após `setData`).
 * O nó fica fora de ecrã até `removeConversationDragPreview` (ex.: fim do arraste).
 */
export function applyConversationDragPreview(
  e: DragEvent,
  model: ConversationDragPreviewModel,
): void {
  removeConversationDragPreview();
  const host = document.createElement('div');
  host.setAttribute('data-conversation-drag-ghost', 'true');
  host.setAttribute('aria-hidden', 'true');
  host.className = 'pointer-events-none fixed left-0 z-[2147483646]';
  host.style.top = `${typeof window !== 'undefined' ? window.innerHeight + 400 : 0}px`;
  document.body.appendChild(host);
  ghostHost = host;
  ghostRoot = createRoot(host);

  flushSync(() => {
    ghostRoot!.render(<ConversationDragPreview {...model} />);
  });

  const w = host.offsetWidth;
  const h = host.offsetHeight;
  if (w > 0 && h > 0) {
    e.dataTransfer.setDragImage(host, Math.round(w / 2), Math.min(32, Math.round(h * 0.25)));
  }
  host.style.left = '-9999px';
  host.style.top = '0';
}

export function conversationDragPreviewFromChatConversation(
  c: ChatConversation | null,
  conversationId: string,
): ConversationDragPreviewModel {
  const identity = resolveConversationIdentity(
    c ?? ({ id: conversationId } as ChatConversation),
    null,
    null,
  );
  const last = c?.lastMessagePreview?.trim() || null;
  return {
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl ?? null,
    initials: identity.initials,
    line2: identity.phoneLine || null,
    line3: last,
    crm: c?.client_id ? 'client' : c?.leadId ? 'lead' : 'none',
  };
}
