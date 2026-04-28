/**
 * Observabilidade leve do realtime do Chat (sem UI).
 * - Desenvolvimento: eventos de diagnóstico sempre que útil.
 * - Produção: apenas com VITE_CHAT_REALTIME_DEBUG=1
 */

const DEBUG_ENV = String(import.meta.env.VITE_CHAT_REALTIME_DEBUG ?? '').toLowerCase();
const PROD_DEBUG_ON = DEBUG_ENV === '1' || DEBUG_ENV === 'true';

export function isChatRealtimeDiagnosticsEnabled(): boolean {
  return import.meta.env.DEV || PROD_DEBUG_ON;
}

type ThrottleBucket = string;
const lastEmitMs = new Map<ThrottleBucket, number>();

const DEFAULT_MIN_INTERVAL_MS = 2800;
const DUPLICATE_MIN_INTERVAL_MS = 4000;

function shouldThrottle(bucket: ThrottleBucket, minMs: number): boolean {
  const now = Date.now();
  const prev = lastEmitMs.get(bucket) ?? 0;
  if (now - prev < minMs) return true;
  lastEmitMs.set(bucket, now);
  return false;
}

function emit(name: string, payload: Record<string, unknown>, bucket: ThrottleBucket, minMs: number): void {
  if (!isChatRealtimeDiagnosticsEnabled()) return;
  if (shouldThrottle(bucket, minMs)) return;
  console.info(name, payload);
}

export function logChatRealtimeV2EventReceived(
  kind: 'conversation' | 'message',
  detail: Record<string, unknown>
): void {
  emit(
    'chat_realtime_v2_event_received',
    { kind, ...detail },
    `v2:${kind}`,
    DEFAULT_MIN_INTERVAL_MS
  );
}

export function logChatRealtimeLegacyEventReceived(
  kind: 'conversation' | 'message',
  detail: Record<string, unknown>
): void {
  emit(
    'chat_realtime_legacy_event_received',
    { kind, ...detail },
    `legacy:${kind}`,
    DEFAULT_MIN_INTERVAL_MS
  );
}

export function logChatRealtimeSocketConnected(detail: Record<string, unknown>): void {
  if (!isChatRealtimeDiagnosticsEnabled()) return;
  if (shouldThrottle('socket:connect', 1500)) return;
  console.info('chat_realtime_socket_connected', detail);
}

export function logChatRealtimeSocketDisconnected(detail: Record<string, unknown>): void {
  if (!isChatRealtimeDiagnosticsEnabled()) return;
  if (shouldThrottle('socket:disconnect', 1500)) return;
  console.info('chat_realtime_socket_disconnected', detail);
}

export function logChatRealtimeDuplicateSkipped(detail: Record<string, unknown>): void {
  const conv =
    typeof detail.conversation_id === 'string' && detail.conversation_id
      ? detail.conversation_id
      : 'unknown';
  emit(
    'chat_realtime_duplicate_skipped',
    detail,
    `dup:${conv}:${String(detail.reason ?? 'id')}`,
    DUPLICATE_MIN_INTERVAL_MS
  );
}
