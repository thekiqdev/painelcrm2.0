/**
 * F6.5 — Fine-grained Selector Engine (memo + equality).
 * Não altera reducers / fatias de domínio; apenas estabiliza resultados.
 */

import {
  recordSelectorHit,
  recordSelectorMiss,
} from '../metrics/renderOptimizationMetrics';

export type EqualityFn<T> = (a: T, b: T) => boolean;

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!Object.is(aObj[key], bObj[key])) return false;
  }
  return true;
}

export function shallowEqualArray<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

/** Fingerprint estável para conversa UI (preview / unread / badges). */
export function conversationUiFingerprint(c: {
  id: string;
  unreadCount?: number | null;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  attendance_status?: string | null;
  assignee_display?: string | null;
  client_id?: string | null;
  leadId?: string | null;
  conversation_type?: string | null;
  provider?: string | null;
}): string {
  return [
    c.id,
    c.unreadCount ?? 0,
    c.lastMessageAt ?? '',
    c.lastMessagePreview ?? '',
    c.attendance_status ?? '',
    c.assignee_display ?? '',
    c.client_id ?? '',
    c.leadId ?? '',
    c.conversation_type ?? '',
    c.provider ?? '',
  ].join('|');
}

export function conversationsUiEqual<T extends { id: string }>(
  a: readonly T[],
  b: readonly T[],
  fingerprint: (item: T) => string = conversationUiFingerprint as (item: T) => string,
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (fingerprint(a[i]!) !== fingerprint(b[i]!)) return false;
  }
  return true;
}

/** Fingerprint estável para mensagem UI (status / body). */
export function messageUiFingerprint(m: {
  id: string;
  status?: string | null;
  body?: string | null;
  sentAt?: string | null;
  direction?: string | null;
  updated_at?: string | null;
}): string {
  return [
    m.id,
    m.status ?? '',
    m.body ?? '',
    m.sentAt ?? '',
    m.direction ?? '',
    m.updated_at ?? '',
  ].join('|');
}

export function messagesUiEqual<T extends { id: string }>(
  a: readonly T[],
  b: readonly T[],
  fingerprint: (item: T) => string = messageUiFingerprint as (item: T) => string,
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (fingerprint(a[i]!) !== fingerprint(b[i]!)) return false;
  }
  return true;
}

export type MemoizedSelector<S, R> = {
  (state: S): R;
  clear(): void;
  lastResult(): R | undefined;
};

/**
 * Memoiza selector por referência de state + equality do resultado.
 * Quando state muda mas resultado é equal, devolve a referência anterior.
 */
export function createMemoizedSelector<S, R>(
  selector: (state: S) => R,
  isEqual: EqualityFn<R> = Object.is,
  name?: string,
): MemoizedSelector<S, R> {
  let lastState: S | undefined;
  let lastResult: R | undefined;
  let hasResult = false;

  const memoized = ((state: S): R => {
    if (hasResult && Object.is(state, lastState)) {
      recordSelectorHit(name);
      return lastResult as R;
    }
    const next = selector(state);
    if (hasResult && isEqual(lastResult as R, next)) {
      recordSelectorHit(name);
      lastState = state;
      return lastResult as R;
    }
    recordSelectorMiss(name);
    lastState = state;
    lastResult = next;
    hasResult = true;
    return next;
  }) as MemoizedSelector<S, R>;

  memoized.clear = () => {
    lastState = undefined;
    lastResult = undefined;
    hasResult = false;
  };

  memoized.lastResult = () => (hasResult ? lastResult : undefined);

  return memoized;
}
