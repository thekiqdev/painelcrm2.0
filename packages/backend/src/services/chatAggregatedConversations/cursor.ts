import type { ChatConversationSort } from './types.js';

export type DecodedCursor = {
  sort: ChatConversationSort;
  t: string | null;
  id: string;
  priority?: string | null;
  unread?: number;
  pinned?: boolean;
};

const SORT_VALUES = new Set([
  'last_message_at',
  'priority',
  'unread',
  'sla',
  'pinned',
]);

export function encodeConversationCursor(payload: DecodedCursor): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeConversationCursor(raw: string | null | undefined): DecodedCursor | null {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const json = Buffer.from(raw.trim(), 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const sort = typeof parsed.sort === 'string' ? parsed.sort : 'last_message_at';
    if (!SORT_VALUES.has(sort)) return null;
    const id = typeof parsed.id === 'string' ? parsed.id : null;
    if (!id) return null;
    return {
      sort: sort as ChatConversationSort,
      t: typeof parsed.t === 'string' ? parsed.t : null,
      id,
      priority: typeof parsed.priority === 'string' ? parsed.priority : null,
      unread: typeof parsed.unread === 'number' ? parsed.unread : undefined,
      pinned: typeof parsed.pinned === 'boolean' ? parsed.pinned : undefined,
    };
  } catch {
    return null;
  }
}

export function buildNextCursor(
  sort: ChatConversationSort,
  lastRow: Record<string, unknown> | undefined,
): string | null {
  if (!lastRow || lastRow.id == null) return null;
  const id = String(lastRow.id);
  const t =
    (lastRow.effective_last_message_at as string | Date | null | undefined) ??
    (lastRow.last_message_at as string | Date | null | undefined);
  const tIso = t instanceof Date ? t.toISOString() : typeof t === 'string' ? t : null;
  return encodeConversationCursor({
    sort,
    t: tIso,
    id,
    priority: typeof lastRow.priority === 'string' ? lastRow.priority : null,
    unread: typeof lastRow.unread_count === 'number' ? lastRow.unread_count : undefined,
    pinned: lastRow.inbox_pinned === true,
  });
}
