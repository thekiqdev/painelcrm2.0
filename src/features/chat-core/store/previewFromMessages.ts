/**
 * Phase 10D — Preview ← Messages.
 * Conversation.lastMessagePreview/At são projeção da última Message do slice.
 */

import { coerceChatPlainText } from '@/services/chat';
import type { ChatConversationId, ChatDomainConversation, ChatDomainMessage } from '../domain/types';
import {
  recordConversationPreviewRebuilt,
  recordMessageWithoutPreview,
  recordPreviewThreadDivergence,
  recordPreviewWithoutMessage,
} from '../metrics/previewMessagesMetrics';
import type { ChatDomainState } from './types';

export function derivePreviewTextFromDomainMessage(message: ChatDomainMessage): string {
  const raw =
    message.raw && typeof message.raw === 'object'
      ? (message.raw as Record<string, unknown>)
      : {};
  const contract =
    raw.message_contract && typeof raw.message_contract === 'object'
      ? (raw.message_contract as Record<string, unknown>)
      : null;
  const previewText =
    coerceChatPlainText(contract?.body) ||
    coerceChatPlainText(message.body) ||
    coerceChatPlainText(raw.body) ||
    coerceChatPlainText(raw.content) ||
    '';
  if (previewText) return previewText;

  const kind = typeof contract?.kind === 'string' ? contract.kind : null;
  if (kind === 'audio') return '[Áudio]';
  if (kind === 'document') return '[Documento]';
  if (kind === 'image') return '[Imagem]';
  const media = raw.media;
  if (Array.isArray(media) && media.length > 0) return '[Imagem]';
  return '[Mídia]';
}

/** Última mensagem canônica do slice (sentAt desc; empate = ordem do array). */
export function pickLastDomainMessage(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): ChatDomainMessage | null {
  const ids = state.messages.byConversationId[conversationId];
  if (!ids || ids.length === 0) return null;

  let best: ChatDomainMessage | null = null;
  let bestTs = Number.NEGATIVE_INFINITY;
  let bestIndex = -1;

  for (let i = 0; i < ids.length; i++) {
    const message = state.messages.byId[ids[i]!];
    if (!message) continue;
    const ts = message.sentAt ? Date.parse(message.sentAt) : Number.NaN;
    if (!Number.isNaN(ts)) {
      if (ts > bestTs || (ts === bestTs && i >= bestIndex)) {
        best = message;
        bestTs = ts;
        bestIndex = i;
      }
      continue;
    }
    if (i >= bestIndex) {
      best = message;
      bestIndex = i;
    }
  }

  return best;
}

function patchConversationRawPreview(
  conversation: ChatDomainConversation,
  preview: string | null,
  lastMessageAt: string | null,
): unknown {
  if (!conversation.raw || typeof conversation.raw !== 'object') {
    return {
      id: conversation.id,
      lastMessagePreview: preview,
      last_message_preview: preview,
      lastMessageAt,
      last_message_at: lastMessageAt,
    };
  }
  return {
    ...(conversation.raw as Record<string, unknown>),
    lastMessagePreview: preview,
    last_message_preview: preview,
    lastMessageAt,
    last_message_at: lastMessageAt,
  };
}

/**
 * Quando o slice `messages.byConversationId[id]` existe (hydrated), Preview
 * da Conversation é reescrito a partir da última Message (ou null se vazio).
 * Sem slice hydrated → no-op (inbox pode manter projeção HTTP até abrir thread).
 */
export function syncConversationPreviewFromMessages(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): ChatDomainState {
  if (!(conversationId in state.messages.byConversationId)) {
    return state;
  }

  const ids = state.messages.byConversationId[conversationId] ?? [];
  const last = pickLastDomainMessage(state, conversationId);
  const nextPreview = last ? derivePreviewTextFromDomainMessage(last) : null;

  const existing = state.conversations.byId[conversationId];
  if (!existing) {
    if (last && !nextPreview) {
      recordMessageWithoutPreview();
    }
    return state;
  }

  // TF3: última msg sem sentAt → não zerar lastMessageAt do inbox; hydrate [] → limpa At.
  const nextAt: string | null = !last
    ? null
    : last.sentAt
      ? last.sentAt
      : (existing.lastMessageAt ?? null);

  const prevPreview = existing.lastMessagePreview ?? null;
  const prevAt = existing.lastMessageAt ?? null;

  if (ids.length === 0 && prevPreview) {
    recordPreviewWithoutMessage();
  }
  if (last && !nextPreview) {
    recordMessageWithoutPreview();
  }
  if (prevPreview !== nextPreview) {
    recordPreviewThreadDivergence({
      conversationId,
      storePreview: prevPreview,
      threadPreview: nextPreview,
    });
  }

  if (prevPreview === nextPreview && prevAt === nextAt) {
    return state;
  }

  const updated: ChatDomainConversation = {
    ...existing,
    lastMessagePreview: nextPreview,
    lastMessageAt: nextAt,
    raw: patchConversationRawPreview(existing, nextPreview, nextAt),
  };

  recordConversationPreviewRebuilt();

  return {
    ...state,
    conversations: {
      ...state.conversations,
      byId: {
        ...state.conversations.byId,
        [conversationId]: updated,
      },
    },
  };
}
