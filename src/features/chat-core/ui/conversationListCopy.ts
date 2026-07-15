/**
 * Sprint TF2 — copy da lista de conversas (Chat + Floating).
 * Preview vazio ≠ ausência de timestamp.
 */

export const CONVERSATION_LIST_EMPTY_PREVIEW = 'Sem mensagens recentes';
/** Placeholder neutro quando não há lastMessageAt (nunca reusar EMPTY_PREVIEW). */
export const CONVERSATION_LIST_EMPTY_TIME = '—';

export function conversationListPreviewText(
  preview: string | null | undefined,
  maxLen = 72,
): string {
  const p = preview?.trim();
  if (!p) return CONVERSATION_LIST_EMPTY_PREVIEW;
  if (maxLen > 0 && p.length > maxLen) return `${p.slice(0, maxLen)}…`;
  return p;
}

export function conversationListTimeLabel(
  lastMessageAt: string | Date | null | undefined,
  formatRelative: (at: string | Date) => string,
): string {
  if (!lastMessageAt) return CONVERSATION_LIST_EMPTY_TIME;
  try {
    return formatRelative(lastMessageAt);
  } catch {
    return CONVERSATION_LIST_EMPTY_TIME;
  }
}
