/**
 * Métricas Chat no backend (inbox/messages/realtime) — API de registro opt-in.
 * Não altera Controllers; callers observacionais podem incrementar.
 */
import { getObservabilityConfig, shouldSampleObservation } from './config.js';
import { ensureCounter, ensureHistogram, incCounter, observeHistogram } from './registry.js';

let defs = false;

export function registerChatBackendMetricDefs(): void {
  if (defs) return;
  defs = true;
  ensureCounter('chat_inbox_load_total', 'Inbox loads');
  ensureCounter('chat_messages_load_total', 'Message page loads');
  ensureHistogram('chat_inbox_load_ms', 'Inbox load latency');
  ensureHistogram('chat_messages_load_ms', 'Messages load latency');
  ensureHistogram('chat_realtime_latency_ms', 'Realtime apply latency (client-reported or bridge)');
  ensureCounter('chat_unread_events_total', 'Unread update events');
  ensureCounter('chat_store_sync_total', 'Store sync events (client-reported)');
  ensureCounter('chat_bridge_sync_total', 'Bridge sync events');
  ensureCounter('chat_client_samples_total', 'Client production metric samples received');
}

function gate(): boolean {
  const cfg = getObservabilityConfig();
  return cfg.enabled && shouldSampleObservation(cfg.sampleRate);
}

export function recordChatInboxLoad(ms: number, ok: boolean): void {
  if (!gate()) return;
  registerChatBackendMetricDefs();
  incCounter('chat_inbox_load_total', { status: ok ? 'ok' : 'error' });
  observeHistogram('chat_inbox_load_ms', ms, { status: ok ? 'ok' : 'error' });
}

export function recordChatMessagesLoad(ms: number, ok: boolean): void {
  if (!gate()) return;
  registerChatBackendMetricDefs();
  incCounter('chat_messages_load_total', { status: ok ? 'ok' : 'error' });
  observeHistogram('chat_messages_load_ms', ms, { status: ok ? 'ok' : 'error' });
}

export function recordChatClientSample(body: {
  inbox_ms?: number;
  messages_ms?: number;
  realtime_ms?: number;
  unread?: number;
  store_sync?: number;
  bridge_sync?: number;
}): void {
  if (!gate()) return;
  registerChatBackendMetricDefs();
  incCounter('chat_client_samples_total');
  if (typeof body.inbox_ms === 'number') observeHistogram('chat_inbox_load_ms', body.inbox_ms, { status: 'client' });
  if (typeof body.messages_ms === 'number')
    observeHistogram('chat_messages_load_ms', body.messages_ms, { status: 'client' });
  if (typeof body.realtime_ms === 'number') observeHistogram('chat_realtime_latency_ms', body.realtime_ms);
  if (body.unread) incCounter('chat_unread_events_total', undefined, body.unread);
  if (body.store_sync) incCounter('chat_store_sync_total', undefined, body.store_sync);
  if (body.bridge_sync) incCounter('chat_bridge_sync_total', undefined, body.bridge_sync);
}
