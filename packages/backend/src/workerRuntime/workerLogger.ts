type Payload = Record<string, unknown>;

function emit(prefix: string, msg: string, payload: Payload = {}): void {
  console.log(JSON.stringify({ prefix, msg, ...payload, ts: new Date().toISOString() }));
}

export function logWorker(msg: string, payload?: Payload): void {
  emit('[WORKER]', msg, payload);
}

export function logWorkerHeartbeat(msg: string, payload?: Payload): void {
  emit('[WORKER_HEARTBEAT]', msg, payload);
}

export function logWorkerReclaim(msg: string, payload?: Payload): void {
  emit('[WORKER_RECLAIM]', msg, payload);
}

export function logWorkerShutdown(msg: string, payload?: Payload): void {
  emit('[WORKER_SHUTDOWN]', msg, payload);
}

export function logWorkerHealth(msg: string, payload?: Payload): void {
  emit('[WORKER_HEALTH]', msg, payload);
}
