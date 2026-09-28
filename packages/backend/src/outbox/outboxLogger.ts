type OutboxLogPayload = Record<string, unknown>;

function emit(prefix: string, msg: string, payload: OutboxLogPayload = {}): void {
  console.log(JSON.stringify({ prefix, msg, ...payload, ts: new Date().toISOString() }));
}

export function logOutbox(msg: string, payload?: OutboxLogPayload): void {
  emit('[OUTBOX]', msg, payload);
}

export function logOutboxWorker(msg: string, payload?: OutboxLogPayload): void {
  emit('[OUTBOX_WORKER]', msg, payload);
}

export function logOutboxRetry(msg: string, payload?: OutboxLogPayload): void {
  emit('[OUTBOX_RETRY]', msg, payload);
}

export function logOutboxDlq(msg: string, payload?: OutboxLogPayload): void {
  emit('[OUTBOX_DLQ]', msg, payload);
}

export function logOutboxReplay(msg: string, payload?: OutboxLogPayload): void {
  emit('[OUTBOX_REPLAY]', msg, payload);
}
