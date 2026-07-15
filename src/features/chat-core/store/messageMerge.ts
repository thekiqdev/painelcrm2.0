/**
 * F6.0 — Message Merge Engine (prepend incremental com dedupe + ordem).
 */

import type { ChatDomainMessage, ChatMessageId } from '../domain/types';

export type MessageMergeResult = {
  /** IDs na ordem final (antigas → novas). */
  orderedIds: ChatMessageId[];
  /** Mensagens a gravar em byId (apenas as novas/atualizadas do prepend). */
  byIdPatch: Record<ChatMessageId, ChatDomainMessage>;
  prepended: number;
  duplicatesDiscarded: number;
};

function messageTime(m: ChatDomainMessage): number {
  if (!m.sentAt) return 0;
  const t = new Date(m.sentAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Ordena mensagens de domínio (mais antigas primeiro). */
export function sortMessagesChronological(
  messages: readonly ChatDomainMessage[],
): ChatDomainMessage[] {
  return [...messages]
    .filter((m): m is ChatDomainMessage => typeof m?.id === 'string' && m.id.length > 0)
    .sort((a, b) => {
      const ta = messageTime(a);
      const tb = messageTime(b);
      if (ta && tb && ta !== tb) return ta - tb;
      if (ta && !tb) return -1;
      if (!ta && tb) return 1;
      return a.id.localeCompare(b.id);
    });
}

/**
 * Prepende página antiga preservando mensagens atuais e eliminando duplicatas.
 * `incoming` deve ser a página mais antiga; `existingIds` é a ordem atual no store.
 */
export function mergePrependMessages(
  existingIds: readonly ChatMessageId[],
  existingById: Readonly<Record<ChatMessageId, ChatDomainMessage>>,
  incoming: readonly ChatDomainMessage[],
): MessageMergeResult {
  const existingSet = new Set(existingIds);
  const byIdPatch: Record<ChatMessageId, ChatDomainMessage> = {};
  const prependIds: ChatMessageId[] = [];
  let duplicatesDiscarded = 0;

  const sortedIncoming = sortMessagesChronological(incoming);

  for (const message of sortedIncoming) {
    byIdPatch[message.id] = message;
    if (existingSet.has(message.id) || prependIds.includes(message.id)) {
      duplicatesDiscarded += 1;
      continue;
    }
    prependIds.push(message.id);
  }

  return {
    orderedIds: [...prependIds, ...existingIds],
    byIdPatch,
    prepended: prependIds.length,
    duplicatesDiscarded,
  };
}

/**
 * Codifica cursor legado baseado no id da mensagem mais antiga da página.
 * Backend cursor real pode substituir este formato sem mudar o Domain Store.
 */
export function encodeLegacyMessageCursor(oldestMessageId: string): string {
  return `msg:${oldestMessageId}`;
}

export function decodeLegacyMessageCursor(cursor: string | null | undefined): string | null {
  if (!cursor || typeof cursor !== 'string') return null;
  if (cursor.startsWith('msg:')) return cursor.slice(4) || null;
  return cursor;
}
